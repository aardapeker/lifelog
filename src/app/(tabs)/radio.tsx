import Ionicons from '@expo/vector-icons/Ionicons';
import { useKeepAwake } from 'expo-keep-awake';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Alert, Image, Keyboard, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MorphPlayButton, WavyProgress } from '../../components/expressive';
import { Glass, GlassArea } from '../../components/Glass';
import { FadeIn, Pulse, PressScale, Shimmer, ShimmerText } from '../../components/motion';
import { Chip, IconButton, PillButton, StatusLine } from '../../components/ui';
import type { Palette } from '../../lib/albumColors';
import { SHOW_LENGTHS, WISHES } from '../../lib/radio';
import { useRadio } from '../../lib/radioEngine';
import { LANGS, STATIONS, VOICES } from '../../lib/stations';
import { colors, fonts, inputColors, radius, TAB_BAR_SPACE } from '../../lib/theme';
import { Avatar, Bell } from '../../components/TopBar';

/** Keeps the screen on while the show runs (the host needs the app awake to talk). */
function KeepAwake() {
  useKeepAwake('radio');
  return null;
}

/** The show's own name, without the station repeated in front ("Neon FM 98.3: Pazar Sabahı…" → "Pazar Sabahı…"). */
const showName = (s: { title: string; station: { name: string; freq: string } }) =>
  s.title.replace(new RegExp(`^\\s*${s.station.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s*${s.station.freq.replace('.', '\\.')})?\\s*[:·\\-–—]?\\s*`, 'i'), '') || s.title;

/** ♥ a song: it may come back in later shows. Everything else is replaced by new finds. */
function Heart({ on, onPress, size }: { on: boolean; onPress: () => void; size: number }) {
  return (
    <PressScale onPress={onPress} scaleTo={0.8} hitSlop={10} accessibilityLabel={on ? 'Unheart this song' : 'Heart this song'}>
      <Ionicons name={on ? 'heart' : 'heart-outline'} size={size} color={on ? '#FF5A6E' : colors.muted} />
    </PressScale>
  );
}

/** 🚫 "Don't play this song": asks once, then the song never comes back on the radio. */
function Ban({ name, onBan, size }: { name: string; onBan: () => void; size: number }) {
  const ask = () =>
    Alert.alert(`Never play "${name}"?`, "It won't come back on Lifelog Radio. If it's playing now, we skip it.", [
      { text: 'Cancel', style: 'cancel' },
      { text: "Don't play it", style: 'destructive', onPress: onBan },
    ]);
  return (
    <PressScale onPress={ask} scaleTo={0.8} hitSlop={10} accessibilityLabel={`Don't play ${name}`}>
      <Ionicons name="ban-outline" size={size} color={colors.muted} />
    </PressScale>
  );
}

const withAlpha = (rgb: string, a: number) => rgb.replace('rgb(', 'rgba(').replace(')', `, ${a})`);

/** A soft glow in the album cover's colours behind the glass; fades over when the song changes. */
function AlbumGlow({ palette }: { palette: Palette | null }) {
  const [layers, setLayers] = useState<{ key: number; p: Palette }[]>([]);
  useEffect(() => {
    if (palette) setLayers((l) => [...l.slice(-1), { key: Date.now(), p: palette }]);
  }, [palette]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {layers.map(({ key, p }) => (
        <FadeIn key={key} from={0} style={StyleSheet.absoluteFill}>
          <LinearGradient
            colors={[withAlpha(p.glow, 0.55), withAlpha(p.deep, 0.9), colors.bg]}
            locations={[0, 0.45, 0.9]}
            style={StyleSheet.absoluteFill}
          />
        </FadeIn>
      ))}
    </View>
  );
}
export default function RadioScreen() {
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollViewInstance>(null);
  const [keyboard, setKeyboard] = useState(0); // its height while it's open
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboard(e.endCoordinates.height);
      scroll.current?.scrollToEnd({ animated: true });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const { banned, ban, length, setLength, hearts, toggleHeart, jumpTo, previous, phase, setPhase, stationKey, setStationKey, trying, station, chooseLang, chooseVoice, wish, setWish, voice, show, index, speaking, paused, status, progress, palette, start, togglePause, skip, toggleVoice, save, stop, current } = useRadio();

  return (
    <View style={styles.screen}>
    <GlassArea style={{ paddingTop: insets.top + 8 }}>
      <AlbumGlow palette={palette} />
      {phase === 'onair' && <KeepAwake />}
      <View style={styles.bar}>
        <Avatar size={44} />
        <View style={styles.onAir}>
          {phase === 'onair' && !paused && <Pulse style={styles.onAirDot} />}
          <Text style={styles.barTitle}>{phase === 'onair' ? 'On air' : 'Radio'}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <IconButton icon={voice ? 'mic' : 'mic-off'} label={voice ? 'Host talks' : 'Host is quiet'} onPress={toggleVoice} />
          <Bell />
        </View>
      </View>

      <Glass blur radius={28} style={styles.sheet}>
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: (keyboard ? 70 : TAB_BAR_SPACE) + keyboard }]}
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
            <Text style={styles.label}>How long?</Text>
            <View style={styles.chips}>
              {SHOW_LENGTHS.map((n) => (
                <Chip key={n} label={`${n} songs`} active={length === n} onPress={() => setLength(n)} />
              ))}
            </View>

            <Text style={styles.label}>Language</Text>
            <View style={styles.chips}>
              {LANGS.map((l) => (
                <Chip key={l.key} label={l.label} active={station.lang === l.key} onPress={() => chooseLang(l.key)} />
              ))}
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
              // the keyboard would cover the box: make room under it and scroll it into view
              onFocus={() => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 250)}
              {...inputColors}
            />
            <PillButton label="Go on air" onPress={start} full style={{ marginTop: 24 }} />
          </FadeIn>
        )}

        {phase === 'building' && (
          <View>
            <Text style={[styles.showTitle, { marginBottom: 16 }]}>{station.host.name} is warming up the mic…</Text>
            <Shimmer style={styles.cover} />
            <Shimmer style={{ height: 26, width: '70%', marginBottom: 10 }} />
            <Shimmer style={{ width: '40%', marginBottom: 24 }} />
            <ShimmerText lines={4} />
          </View>
        )}

        {(phase === 'onair' || phase === 'done') && show && current && (
          <>
            <Text style={styles.showTitle}>
              {show.station.emoji} {show.station.name} {show.station.freq} · {showName(show)}
            </Text>
            <FadeIn key={current.track.id}>
              {current.track.image && <Image source={{ uri: current.track.image }} style={styles.cover} />}
              <View style={styles.titleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.trackName}>{current.track.name}</Text>
                  <Text style={styles.trackArtist}>{current.track.artist}</Text>
                </View>
                <View style={styles.songActions}>
                  <Ban name={current.track.name} onBan={() => ban(current.track)} size={24} />
                  <Heart on={hearts.has(current.track.id)} onPress={() => toggleHeart(current.track)} size={30} />
                </View>
              </View>
              {!!current.label && <Text style={styles.breakLabel}>{current.label === 'News' ? '📰 News' : '📢 Commercial break'}</Text>}
              {current.talk.map((l, k) => (
                <Text key={k} style={[styles.intro, speaking && { color: colors.text }]}>
                  {show.station.sidekick && <Text style={styles.who}>{l.speaker}: </Text>}
                  {l.text.replace(/<[^>]+>/g, '').trim()}
                </Text>
              ))}
            </FadeIn>

            {phase === 'onair' && <WavyProgress progress={progress} playing={!paused && !speaking} />}
            {phase === 'onair' ? (
              <View style={styles.controls}>
                <IconButton icon="play-skip-back" label="Previous" onPress={previous} size={54} />
                <MorphPlayButton playing={!paused} onPress={togglePause} />
                <IconButton icon="play-skip-forward" label="Next song" onPress={skip} size={54} />
                <IconButton icon="stop" label="End the show" onPress={stop} size={54} />
              </View>
            ) : (
              <Text style={[styles.text, { marginTop: 18 }]}>That's the show. Spotify keeps playing from here.</Text>
            )}

            <Text style={styles.label}>{index + 1 < show.slots.length ? 'Up next' : 'Tonight’s set'}</Text>
            {show.slots.map((s, i) => (
              <PressScale
                key={s.track.id}
                scaleTo={0.98}
                style={[styles.row, i === index && styles.rowNow]}
                onPress={() => phase === 'onair' && i !== index && jumpTo(i, false)}
                accessibilityLabel={`Play ${s.track.name}`}
              >
                <Text style={styles.rowNum}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.rowName,
                      i < index && { color: colors.muted },
                      banned.has(s.track.id) && { color: colors.muted, textDecorationLine: 'line-through' },
                    ]}
                    numberOfLines={1}
                  >
                    {s.track.name}
                  </Text>
                  <Text style={styles.rowArtist} numberOfLines={1}>
                    {s.track.artist}
                  </Text>
                </View>
                {!banned.has(s.track.id) && <Ban name={s.track.name} onBan={() => ban(s.track)} size={17} />}
                <Heart on={hearts.has(s.track.id)} onPress={() => toggleHeart(s.track)} size={20} />
              </PressScale>
            ))}
            <View style={styles.after}>
              <PillButton label="Save as playlist" onPress={save} ghost />
              {phase === 'done' && <PillButton label="New show" onPress={() => setPhase('pick')} />}
            </View>
          </>
        )}
        <StatusLine status={status} />
      </ScrollView>
      </Glass>
    </GlassArea>
    </View>
  );
}

const styles = StyleSheet.create({
  songActions: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 14 },
  onAir: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  onAirDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  barTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.text },
  sheet: { flex: 1, marginBottom: -40 },
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  trackName: { fontFamily: fonts.serif, fontSize: 28, lineHeight: 34, color: colors.text },
  trackArtist: { fontFamily: fonts.sans, fontSize: 15, color: colors.muted, marginTop: 4 },
  intro: { fontFamily: fonts.serifItalic, fontSize: 17, lineHeight: 26, color: colors.muted, marginTop: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 22 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingHorizontal: 10, borderRadius: radius.sm },
  rowNow: { backgroundColor: colors.raised },
  rowNum: { fontFamily: fonts.serif, fontSize: 15, color: colors.muted, width: 18 },
  rowName: { fontFamily: fonts.sans, fontSize: 15, color: colors.text },
  rowArtist: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted, marginTop: 2 },
  after: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 22 },
});
