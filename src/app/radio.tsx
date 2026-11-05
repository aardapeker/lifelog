import Ionicons from '@expo/vector-icons/Ionicons';
import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import * as Speech from 'expo-speech';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeIn, Pulse, PressScale } from '../components/motion';
import { Chip, IconButton, PillButton, StatusLine, type Status } from '../components/ui';
import { buildShow, VIBES, type Show, type Vibe } from '../lib/radio';
import { pausePlayback, playbackState, playTracks, resumePlayback, savePlaylist } from '../lib/spotify';
import { colors, fonts, inputColors, radius } from '../lib/theme';

const POLL_MS = 1500;
const END_MARGIN_MS = 2500; // stop this close to the end, so Spotify doesn't drift into its own autoplay

type Phase = 'pick' | 'building' | 'onair' | 'done';

/** Keeps the screen on while the show runs (the host needs the app awake to talk). */
function KeepAwake() {
  useKeepAwake('radio');
  return null;
}

export default function RadioScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>('pick');
  const [vibe, setVibe] = useState<Vibe>('surprise');
  const [wish, setWish] = useState('');
  const [voice, setVoice] = useState(true);
  const [show, setShow] = useState<Show | null>(null);
  const [index, setIndex] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  // the engine runs on refs: timers and speech callbacks must see the latest values
  const live = useRef({ show: null as Show | null, index: 0, speaking: false, paused: false, startedAt: 0, voice: true });
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopEngine = useCallback(() => {
    if (poll.current) clearInterval(poll.current);
    poll.current = null;
    Speech.stop();
  }, []);
  useEffect(() => stopEngine, [stopEngine]);

  const fail = (e: unknown) => setStatus({ kind: 'err', msg: e instanceof Error ? e.message : String(e) });

  /** Host talks (if voice is on), then the song starts. */
  const playSlot = useCallback((i: number) => {
    const s = live.current.show;
    if (!s) return;
    if (i >= s.slots.length) {
      stopEngine();
      setPhase('done');
      return;
    }
    live.current.index = i;
    setIndex(i);
    const start = () => {
      live.current.speaking = false;
      setSpeaking(false);
      if (live.current.paused || live.current.index !== i) return;
      live.current.startedAt = Date.now();
      playTracks([s.slots[i].track.uri]).catch(fail);
    };
    const intro = s.slots[i].intro;
    if (live.current.voice && intro) {
      live.current.speaking = true;
      setSpeaking(true);
      Speech.speak(intro, { language: s.lang, rate: 1.0, pitch: 1.0, onDone: start, onError: start, onStopped: () => {} });
    } else start();
  }, [stopEngine]);

  /** Watches Spotify: when the song is about to end, the next one gets its intro. */
  const tick = useCallback(async () => {
    const l = live.current;
    if (!l.show || l.speaking || l.paused || Date.now() - l.startedAt < 4000) return;
    const p = await playbackState().catch(() => null);
    const slot = l.show.slots[l.index];
    if (!p?.track || p.track.uri !== slot.track.uri) return;
    if (p.track.durationMs - p.progressMs < END_MARGIN_MS) {
      const next = l.index + 1;
      if (next < l.show.slots.length) await pausePlayback().catch(() => {});
      playSlot(next);
    }
  }, [playSlot]);

  const start = async () => {
    setPhase('building');
    setStatus({ kind: 'idle' });
    try {
      const s = await buildShow(db, vibe, wish);
      live.current = { show: s, index: 0, speaking: false, paused: false, startedAt: 0, voice };
      setShow(s);
      setPaused(false);
      setPhase('onair');
      poll.current = setInterval(tick, POLL_MS);
      playSlot(0);
    } catch (e) {
      setPhase('pick');
      fail(e);
    }
  };

  const togglePause = async () => {
    const l = live.current;
    if (!l.paused) {
      l.paused = true;
      setPaused(true);
      if (l.speaking) {
        Speech.stop();
        l.speaking = false;
        setSpeaking(false);
      } else await pausePlayback().catch(fail);
      return;
    }
    l.paused = false;
    setPaused(false);
    // paused during the talk: start the song; paused during the song: carry on
    if (l.startedAt === 0 || (await playbackState().catch(() => null))?.track?.uri !== l.show?.slots[l.index].track.uri) {
      playSlot(l.index);
    } else await resumePlayback().catch(fail);
  };

  const skip = () => {
    Speech.stop();
    live.current.speaking = false;
    live.current.paused = false;
    setPaused(false);
    playSlot(live.current.index + 1);
  };

  const toggleVoice = () => {
    live.current.voice = !voice;
    setVoice(!voice);
    if (voice && live.current.speaking) Speech.stop(); // turning it off mid-sentence: let the song start
  };

  const save = async () => {
    if (!show) return;
    setStatus({ kind: 'busy' });
    try {
      await savePlaylist(show.title, 'Made by your friend in Lifelog Radio', show.slots.map((s) => s.track.uri));
      setStatus({ kind: 'ok', msg: `Saved "${show.title}" to your Spotify playlists.` });
    } catch (e) {
      fail(e);
    }
  };

  const close = () => {
    stopEngine();
    router.back();
  };

  const current = show?.slots[index];

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      {phase === 'onair' && <KeepAwake />}
      <View style={styles.bar}>
        <IconButton icon="chevron-down" label="Close radio" onPress={close} />
        <View style={styles.onAir}>
          {phase === 'onair' && !paused && <Pulse style={styles.onAirDot} />}
          <Text style={styles.barTitle}>{phase === 'onair' ? 'On air' : 'Radio'}</Text>
        </View>
        <IconButton icon={voice ? 'mic' : 'mic-off'} label={voice ? 'Host talks' : 'Host is quiet'} onPress={toggleVoice} />
      </View>

      <ScrollView
        style={styles.sheet}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]}
        keyboardShouldPersistTaps="handled"
      >
        {phase === 'pick' && (
          <FadeIn>
            <Text style={styles.title}>{'Your Own\nRadio Show'}</Text>
            <Text style={styles.text}>
              Your friend picks the songs, and before each one tells you why, out loud, like a radio host. Spotify plays
              them.
            </Text>
            <Text style={styles.label}>What's the vibe?</Text>
            <View style={styles.chips}>
              {VIBES.map((v) => (
                <Chip key={v.key} label={v.label} active={vibe === v.key} onPress={() => setVibe(v.key)} />
              ))}
            </View>
            <Text style={styles.label}>Anything else? (optional)</Text>
            <TextInput
              style={styles.input}
              value={wish}
              onChangeText={setWish}
              placeholder="90s rock, no sad songs, something Turkish…"
              placeholderTextColor={colors.muted}
              {...inputColors}
            />
            <PillButton label="Go on air" onPress={start} full style={{ marginTop: 24 }} />
          </FadeIn>
        )}

        {phase === 'building' && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.text} />
            <Text style={[styles.text, { marginTop: 14, textAlign: 'center' }]}>
              Digging through your week and your records…
            </Text>
          </View>
        )}

        {(phase === 'onair' || phase === 'done') && show && current && (
          <>
            <Text style={styles.showTitle}>{show.title}</Text>
            <FadeIn key={current.track.id}>
              {current.track.image && <Image source={{ uri: current.track.image }} style={styles.cover} />}
              <Text style={styles.trackName}>{current.track.name}</Text>
              <Text style={styles.trackArtist}>{current.track.artist}</Text>
              {!!current.intro && (
                <Text style={[styles.intro, speaking && { color: colors.text }]}>“{current.intro}”</Text>
              )}
            </FadeIn>

            {phase === 'onair' ? (
              <View style={styles.controls}>
                <PressScale style={styles.control} onPress={togglePause} accessibilityLabel={paused ? 'Play' : 'Pause'}>
                  <Ionicons name={paused ? 'play' : 'pause'} size={28} color={colors.accentText} />
                </PressScale>
                <IconButton icon="play-skip-forward" label="Next song" onPress={skip} size={54} />
              </View>
            ) : (
              <Text style={[styles.text, { marginTop: 18 }]}>That's the show. Spotify keeps playing from here.</Text>
            )}

            <Text style={styles.label}>{index + 1 < show.slots.length ? 'Up next' : 'Tonight’s set'}</Text>
            {show.slots.map((s, i) => (
              <View key={s.track.id} style={[styles.row, i === index && styles.rowNow]}>
                <Text style={styles.rowNum}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowName, i < index && { color: colors.muted }]} numberOfLines={1}>
                    {s.track.name}
                  </Text>
                  <Text style={styles.rowArtist} numberOfLines={1}>
                    {s.track.artist}
                  </Text>
                </View>
              </View>
            ))}
            <View style={styles.after}>
              <PillButton label="Save as playlist" onPress={save} ghost />
              {phase === 'done' && <PillButton label="New show" onPress={() => setPhase('pick')} />}
            </View>
          </>
        )}
        <StatusLine status={status} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 14 },
  onAir: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  onAirDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  barTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.text },
  sheet: { flex: 1, backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  content: { padding: 24 },
  center: { paddingVertical: 80, alignItems: 'center' },
  title: { fontFamily: fonts.serif, fontSize: 40, lineHeight: 46, color: colors.text, marginBottom: 14 },
  text: { fontFamily: fonts.sansRegular, fontSize: 15, lineHeight: 22, color: colors.muted },
  label: { fontFamily: fonts.serif, fontSize: 14, color: colors.muted, marginTop: 26, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: radius.sm,
    backgroundColor: colors.raised,
    color: colors.text,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
  },
  showTitle: { fontFamily: fonts.serifItalic, fontSize: 16, color: colors.muted, marginBottom: 16 },
  cover: { width: '100%', aspectRatio: 1, borderRadius: radius.md, marginBottom: 18, backgroundColor: colors.raised },
  trackName: { fontFamily: fonts.serif, fontSize: 28, lineHeight: 34, color: colors.text },
  trackArtist: { fontFamily: fonts.sans, fontSize: 15, color: colors.muted, marginTop: 4 },
  intro: { fontFamily: fonts.serifItalic, fontSize: 17, lineHeight: 26, color: colors.muted, marginTop: 16 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 22 },
  control: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingHorizontal: 10, borderRadius: radius.sm },
  rowNow: { backgroundColor: colors.raised },
  rowNum: { fontFamily: fonts.serif, fontSize: 15, color: colors.muted, width: 18 },
  rowName: { fontFamily: fonts.sans, fontSize: 15, color: colors.text },
  rowArtist: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted, marginTop: 2 },
  after: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 22 },
});
