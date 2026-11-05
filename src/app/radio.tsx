import Ionicons from '@expo/vector-icons/Ionicons';
import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeIn, Pulse, PressScale } from '../components/motion';
import { Chip, IconButton, PillButton, StatusLine, type Status } from '../components/ui';
import { buildShow, castOf, WISHES, type Show } from '../lib/radio';
import { STATIONS, stationByKey, VOICES, withVoices, type Persona, type VoiceChoices } from '../lib/stations';
import { getSetting, setSetting } from '../lib/db';
import { pausePlayback, playbackState, playTracks, resumePlayback, savePlaylist } from '../lib/spotify';
import { colors, fonts, inputColors, radius } from '../lib/theme';
import { clearClips, playClip, speakRobot, synthesize, type Talking } from '../lib/tts';

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
  const [stationKey, setStationKey] = useState('neon');
  const [choices, setChoices] = useState<VoiceChoices>({});
  const [trying, setTrying] = useState<string | null>(null); // voice being previewed
  const preview = useRef<Talking | null>(null);
  const station = withVoices(stationByKey(stationKey), choices);

  useEffect(() => {
    getSetting(db, 'radio.voices', '{}')
      .then((v) => setChoices(JSON.parse(v) as VoiceChoices))
      .catch(() => {});
  }, [db]);

  /** Picks a voice for the host or sidekick, remembers it, and lets you hear it. */
  const chooseVoice = async (role: 'host' | 'sidekick', p: Persona, voice: string) => {
    const next = { ...choices, [stationKey]: { ...choices[stationKey], [role]: voice } };
    setChoices(next);
    setSetting(db, 'radio.voices', JSON.stringify(next)).catch(() => {});
    preview.current?.stop();
    setTrying(voice);
    try {
      const uri = await synthesize(
        [{ speaker: p.name, text: `Hey! I'm ${p.name}, and you're listening to ${station.name} ${station.freq}.` }],
        [{ name: p.name, voice, style: p.style }],
      );
      preview.current = playClip(uri);
      await preview.current.done;
    } catch (e) {
      fail(e);
    } finally {
      setTrying((t) => (t === voice ? null : t));
    }
  };
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
  const talking = useRef<Talking | null>(null);
  // intros are voiced ahead of time (while the previous song plays), so the host never makes you wait
  const clips = useRef(new Map<number, Promise<string | null>>());

  const prepare = useCallback((i: number) => {
    const s = live.current.show;
    if (!s || i >= s.slots.length || clips.current.has(i) || !s.slots[i].talk.length) return;
    clips.current.set(
      i,
      synthesize(s.slots[i].talk, castOf(s.station)).catch((e) => {
        // say why it sounds robotic, instead of failing silently
        setStatus({ kind: 'err', msg: `${e instanceof Error ? e.message : e} Using the phone's voice for now.` });
        return null;
      }),
    );
  }, []);

  const shush = () => {
    talking.current?.stop();
    talking.current = null;
  };

  const stopEngine = useCallback(() => {
    preview.current?.stop();
    if (poll.current) clearInterval(poll.current);
    poll.current = null;
    talking.current?.stop();
    talking.current = null;
    clearClips();
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
      prepare(i + 1);
    };
    const talk = s.slots[i].talk;
    if (!live.current.voice || !talk.length) return start();
    live.current.speaking = true;
    setSpeaking(true);
    prepare(i);
    (async () => {
      const uri = await clips.current.get(i);
      if (live.current.index !== i || !live.current.speaking) return; // skipped or paused while it was loading
      const t = uri ? playClip(uri) : speakRobot(talk.map((l) => l.text).join(' '), s.lang);
      talking.current = t;
      if (await t.done) start();
    })();
  }, [stopEngine, prepare]);

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
      preview.current?.stop();
      const s = await buildShow(db, station, wish);
      live.current = { show: s, index: 0, speaking: false, paused: false, startedAt: 0, voice };
      clips.current = new Map();
      if (voice) {
        prepare(0);
        await clips.current.get(0); // the opening line is ready before we go on air
      }
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
        shush();
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
    shush();
    live.current.speaking = false;
    live.current.paused = false;
    setPaused(false);
    playSlot(live.current.index + 1);
  };

  const toggleVoice = () => {
    live.current.voice = !voice;
    setVoice(!voice);
    if (voice && live.current.speaking) {
      // turning it off mid-sentence: let the song start
      shush();
      live.current.speaking = false;
      setSpeaking(false);
      playSlot(live.current.index);
    }
  };

  const save = async () => {
    if (!show) return;
    setStatus({ kind: 'busy' });
    try {
      await savePlaylist(show.title, `${show.station.name} ${show.station.freq}, made for you in Lifelog Radio`, show.slots.map((s) => s.track.uri));
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
            <Text style={styles.title}>{'Tune In'}</Text>
            <Text style={styles.text}>
              Pick a station. The hosts play real songs on your Spotify and talk between them, with fake ads and news about
              your life.
            </Text>
            <View style={styles.dial}>
              {STATIONS.map((st) => {
                const on = st.key === stationKey;
                return (
                  <PressScale
                    key={st.key}
                    scaleTo={0.97}
                    style={[styles.station, on && styles.stationOn]}
                    onPress={() => setStationKey(st.key)}
                    accessibilityLabel={st.name}
                  >
                    <Text style={styles.stationEmoji}>{st.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.stationName, on && { color: colors.accentText }]}>
                        {st.name} <Text style={styles.freq}>{st.freq}</Text>
                      </Text>
                      <Text style={[styles.stationTag, on && { color: colors.accentText }]} numberOfLines={2}>
                        {st.tagline}
                      </Text>
                      {on && (
                        <Text style={styles.stationHosts}>
                          {st.sidekick ? `${st.host.name} & ${st.sidekick.name}` : st.host.name}
                        </Text>
                      )}
                    </View>
                  </PressScale>
                );
              })}
            </View>
            <Text style={styles.label}>Voices (tap one to hear it)</Text>
            {[
              { role: 'host' as const, p: station.host },
              ...(station.sidekick ? [{ role: 'sidekick' as const, p: station.sidekick }] : []),
            ].map(({ role, p }) => (
              <View key={role} style={{ marginBottom: 12 }}>
                <Text style={styles.voiceFor}>{p.name}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.voiceRow}>
                  {VOICES.map((v) => (
                    <Chip
                      key={v.name}
                      label={`${trying === v.name && p.voice === v.name ? '🔊 ' : ''}${v.name} · ${v.vibe}`}
                      active={p.voice === v.name}
                      onPress={() => chooseVoice(role, p, v.name)}
                    />
                  ))}
                </ScrollView>
              </View>
            ))}

            <Text style={styles.label}>Anything else? (optional)</Text>
            <View style={[styles.chips, { marginBottom: 10 }]}>
              {WISHES.map((w) => (
                <Chip key={w} label={w} active={wish === w} onPress={() => setWish(wish === w ? '' : w)} />
              ))}
            </View>
            <TextInput
              style={styles.input}
              value={wish}
              onChangeText={setWish}
              placeholder="No sad songs, something Turkish…"
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
              {station.host.name} is warming up the mic…
            </Text>
          </View>
        )}

        {(phase === 'onair' || phase === 'done') && show && current && (
          <>
            <Text style={styles.showTitle}>
              {show.station.emoji} {show.station.name} {show.station.freq} · {show.title}
            </Text>
            <FadeIn key={current.track.id}>
              {current.track.image && <Image source={{ uri: current.track.image }} style={styles.cover} />}
              <Text style={styles.trackName}>{current.track.name}</Text>
              <Text style={styles.trackArtist}>{current.track.artist}</Text>
              {!!current.label && <Text style={styles.breakLabel}>{current.label === 'News' ? '📰 News' : '📢 Commercial break'}</Text>}
              {current.talk.map((l, k) => (
                <Text key={k} style={[styles.intro, speaking && { color: colors.text }]}>
                  {show.station.sidekick && <Text style={styles.who}>{l.speaker}: </Text>}
                  {l.text.replace(/<[^>]+>/g, '').trim()}
                </Text>
              ))}
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
  dial: { gap: 10, marginTop: 22 },
  voiceFor: { fontFamily: fonts.sans, fontSize: 13, color: colors.text, marginBottom: 8 },
  voiceRow: { gap: 8, paddingRight: 24 },
  station: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.raised,
  },
  stationOn: { backgroundColor: colors.accent },
  stationEmoji: { fontSize: 28 },
  stationName: { fontFamily: fonts.serif, fontSize: 19, color: colors.text },
  freq: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
  stationTag: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: colors.muted, marginTop: 2 },
  stationHosts: { fontFamily: fonts.sans, fontSize: 12, color: colors.accentText, marginTop: 6, opacity: 0.7 },
  breakLabel: { fontFamily: fonts.sans, fontSize: 13, color: colors.text, marginTop: 16, letterSpacing: 0.5 },
  who: { fontFamily: fonts.serifBold, fontStyle: 'normal' },
  showTitle: { fontFamily: fonts.serifItalic, fontSize: 16, color: colors.muted, marginBottom: 16 },
  cover: { width: '100%', aspectRatio: 1, borderRadius: radius.md, marginBottom: 18, backgroundColor: colors.raised },
  trackName: { fontFamily: fonts.serif, fontSize: 28, lineHeight: 34, color: colors.text },
  trackArtist: { fontFamily: fonts.sans, fontSize: 15, color: colors.muted, marginTop: 4 },
  intro: { fontFamily: fonts.serifItalic, fontSize: 17, lineHeight: 26, color: colors.muted, marginTop: 12 },
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
