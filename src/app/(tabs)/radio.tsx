import Ionicons from '../../components/Icon';
import { useKeepAwake } from 'expo-keep-awake';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Alert, Animated, Easing, Image, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MorphPlayButton, WavyProgress } from '../../components/expressive';
import { Glass, GlassArea } from '../../components/Glass';
import { FadeIn, Pulse, PressScale } from '../../components/motion';
import { BuildProgress } from '../../components/BuildProgress';
import { Chip, IconButton, PillButton, StatusLine } from '../../components/ui';
import type { Palette } from '../../lib/albumColors';
import { SHOW_LENGTHS, songLangOf, songLangsFor, type SongLang } from '../../lib/radio';
import { getSetting, setSetting } from '../../lib/db';
import { useSQLiteContext } from 'expo-sqlite';
import { useRadio } from '../../lib/radioEngine';
import { FRIEND_VOICES, LANGS, STATIONS, voicesFor } from '../../lib/stations';
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
/**
 * The page's light: the album cover itself, blurred into a soft cloud of its colours, filling the
 * whole screen behind the glass (fixed while you scroll). Each new cover cross-fades in. A dark veil
 * keeps the text readable. No cover (or before it loads): the cover's two colours as a gradient.
 */
function AlbumGlow({ palette, image }: { palette: Palette | null; image: string | null }) {
  const [layers, setLayers] = useState<{ key: string; image: string | null; p: Palette | null }[]>([]);
  useEffect(() => {
    if (!image && !palette) return;
    setLayers((l) => (l[l.length - 1]?.key === `${image}|${palette?.glow}` ? l : [...l.slice(-1), { key: `${image}|${palette?.glow}`, image, p: palette }]));
  }, [image, palette]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {layers.map(({ key, image: img, p }) => (
        <FadeIn key={key} from={0} style={StyleSheet.absoluteFill}>
          {img ? (
            <>
              <Image source={{ uri: img }} blurRadius={40} resizeMode="cover" style={[StyleSheet.absoluteFill, styles.backdrop]} />
              <LinearGradient
                colors={['rgba(29, 28, 28, 0.15)', 'rgba(29, 28, 28, 0.45)', 'rgba(29, 28, 28, 0.7)']}
                locations={[0, 0.5, 1]}
                style={StyleSheet.absoluteFill}
              />
            </>
          ) : p ? (
            <LinearGradient
              colors={[withAlpha(p.glow, 0.65), withAlpha(p.glow, 0.38), withAlpha(p.deep, 0.95)]}
              locations={[0, 0.45, 1]}
              style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]}
            />
          ) : null}
        </FadeIn>
      ))}
    </View>
  );
}

/**
 * The cover with a halo: a soft light in the cover's brightest colour glowing out from behind it,
 * like a lamp (a real blurred shadow, not a hard edge). While on air it breathes slowly (a little
 * faster while the hosts talk); paused, it rests.
 */
function GlowingCover({ uri, glow, live, talking }: { uri: string; glow: string | null; live: boolean; talking: boolean }) {
  const breath = useRef(new Animated.Value(0.75)).current;
  useEffect(() => {
    if (!live) {
      Animated.timing(breath, { toValue: 0.55, duration: 600, useNativeDriver: true }).start();
      return;
    }
    const half = talking ? 1100 : 2200;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0.6, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [live, talking, breath]);
  const scale = breath.interpolate({ inputRange: [0.5, 1], outputRange: [0.97, 1.02] });
  return (
    <View style={styles.coverWrap}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.halo,
          { backgroundColor: glow ?? 'rgb(255, 255, 255)', boxShadow: `0 0 70px 18px ${withAlpha(glow ?? 'rgb(255, 255, 255)', 0.75)}` },
          { opacity: breath, transform: [{ scale }] },
        ]}
      />
      <Image source={{ uri }} style={styles.cover} />
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
  const db = useSQLiteContext();
  const [songLang, setSongLang] = useState<SongLang>('station'); // the songs' language (the talk has its own)
  useEffect(() => {
    getSetting(db, 'radio.songLang', 'station').then((v) => setSongLang(v as SongLang)).catch(() => {});
  }, [db]);
  const pickSongLang = (v: SongLang) => {
    setSongLang(v);
    setSetting(db, 'radio.songLang', v).catch(() => {});
  };
  const [allShows, setAllShows] = useState(false); // Recent shows: the newest 3, or all of them
  const [recast, setRecast] = useState(false); // the full voice lists, only on purpose
  const { draft, reviewFirst, setReviewFirst, moveDraft, dropDraft, writeDraft, cancelDraft, replay, steps, history, loadHistory, playPast, forgetShow, keepShow, liveKept, keepLive, banned, ban, length, setLength, hearts, toggleHeart, jumpTo, previous, phase, setPhase, stationKey, setStationKey, trying, station, chooseLang, chooseVoice, wish, setWish, voice, show, index, speaking, paused, status, progress, palette, start, togglePause, skip, toggleVoice, save, stop, current } = useRadio();
  useEffect(() => setRecast(false), [stationKey]); // a new station opens with its cast folded
  useFocusEffect(useCallback(() => { loadHistory(); }, [loadHistory])); // Settings may have changed how long shows are kept

  return (
    <View style={styles.screen}>
    <GlassArea style={{ paddingTop: insets.top + 8 }}>
      <AlbumGlow palette={palette} image={phase === 'onair' || phase === 'done' ? (current?.track.image ?? null) : null} />
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

      {/* a lighter glass, so the cover's colours glow through the whole page */}
      <Glass blur radius={28} style={styles.sheet} fill={palette ? 'rgba(29, 28, 28, 0.3)' : undefined}>
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        // room for the sheet's 40px overhang, the tab bar, and (while picking) the floating Go on air
        contentContainerStyle={[
          styles.content,
          { paddingBottom: keyboard ? 110 + keyboard : 40 + TAB_BAR_SPACE + insets.bottom + (phase === 'pick' ? 74 : 0) },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {phase === 'pick' && (
          <FadeIn>
            <Text style={styles.title}>{'Tune In'}</Text>
            <Text style={styles.text}>
              Pick a station. The hosts play real songs on your Spotify and talk between them, with fake ads and news about
              your life.
            </Text>
            {history.length > 0 && (
              // every show of the last day: closed by accident, stopped or finished; its script is kept
              <>
                <Text style={styles.label}>Recent shows</Text>
                {(allShows ? history : history.slice(0, 3)).map((h) => {
                  const open = !h.done && h.index < h.show.slots.length;
                  return (
                    <View key={h.id} style={styles.resume}>
                      <Text style={styles.stationEmoji}>{h.show.station.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.stationName} numberOfLines={1}>{h.show.title}</Text>
                        <Text style={styles.stationTag}>
                          {h.kept ? 'Saved · ' : ''}{h.show.station.name} · {ago(h.savedAt)} ·{' '}
                          {open ? `song ${h.index + 1} of ${h.show.slots.length}` : 'finished'}
                        </Text>
                        <View style={styles.resumeRow}>
                          {open ? (
                            <>
                              <Chip label="Resume" active onPress={() => playPast(h.id, false)} />
                              <Chip label="From the start" active={false} onPress={() => playPast(h.id, true)} />
                            </>
                          ) : (
                            <Chip label="Play again" active onPress={() => playPast(h.id, true)} />
                          )}
                        </View>
                      </View>
                      <View style={styles.pastIcons}>
                        <Pressable onPress={() => keepShow(h.id, !h.kept)} hitSlop={10} accessibilityLabel={h.kept ? 'Unsave show' : 'Save show'}>
                          <Ionicons name={h.kept ? 'bookmark' : 'bookmark-outline'} size={18} color={h.kept ? colors.text : colors.muted} />
                        </Pressable>
                        <Pressable
                          onPress={() =>
                            h.kept
                              ? Alert.alert('Delete this saved show?', 'Its script and voices are deleted from your phone.', [
                                  { text: 'Keep it', style: 'cancel' },
                                  { text: 'Delete', style: 'destructive', onPress: () => forgetShow(h.id) },
                                ])
                              : forgetShow(h.id)
                          }
                          hitSlop={10}
                          accessibilityLabel="Delete show"
                        >
                          <Ionicons name="close" size={18} color={colors.muted} />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
                {history.length > 3 && (
                  <Pressable onPress={() => setAllShows((a) => !a)} hitSlop={8} style={styles.recast}>
                    <Text style={styles.recastText}>{allShows ? 'Show fewer' : `Show all ${history.length}`}</Text>
                  </Pressable>
                )}
              </>
            )}
            {/* with Recent shows above, the stations get their own title, so the two lists don't run together */}
            {history.length > 0 && <Text style={styles.label}>Stations</Text>}
            <View style={[styles.dial, history.length > 0 && { marginTop: 0 }]}>
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

            <Text style={styles.label}>Playlist</Text>
            <View style={styles.chips}>
              <Chip label="Let me check it first" active={reviewFirst} onPress={() => setReviewFirst(true)} />
              <Chip label="Surprise me" active={!reviewFirst} onPress={() => setReviewFirst(false)} />
            </View>

            <Text style={styles.label}>Hosts speak</Text>
            <View style={styles.chips}>
              {LANGS.map((l) => (
                <Chip key={l.key} label={l.label} active={station.lang === l.key} onPress={() => chooseLang(l.key)} />
              ))}
            </View>

            <Text style={styles.label}>Songs</Text>
            <View style={styles.chips}>
              {/* only the languages that exist in the station's genre (Arabesk: Turkish only) */}
              {songLangsFor(station).map((l) => (
                <Chip key={l.key} label={l.label} active={songLangOf(station, songLang) === l.key} onPress={() => pickSongLang(l.key)} />
              ))}
            </View>

            <Text style={styles.label}>Voices</Text>
            {[
              { role: 'host' as const, p: station.host },
              ...(station.sidekick ? [{ role: 'sidekick' as const, p: station.sidekick }] : []),
            ].map(({ role, p }) => {
              const friend = station.key === 'friend';
              const options = friend
                ? FRIEND_VOICES.map((f) => ({ voice: f.voice, label: f.label }))
                : voicesFor(p).map((v) => ({
                    voice: v.name,
                    label: `${v.name} · ${v.vibe}${p.gender ? '' : v.gender === 'male' ? ' ♂' : ' ♀'}`,
                  }));
              const currentVoice = friend && !FRIEND_VOICES.some((f) => f.voice === p.voice) ? FRIEND_VOICES[0].voice : p.voice;
              const mine = options.find((o) => o.voice === currentVoice) ?? { voice: currentVoice, label: currentVoice };
              const say = (o: { voice: string; label: string }) => `${trying === o.voice && p.voice === o.voice ? '🔊 ' : ''}${o.label}`;
              return (
                <View key={role} style={{ marginBottom: 12 }}>
                  <Text style={styles.voiceFor}>{p.name}</Text>
                  {!recast ? (
                    // the cast is set: only the chosen voice shows (tap to hear it; a kept sample costs nothing)
                    <View style={styles.chips}>
                      <Chip label={say(mine)} active onPress={() => chooseVoice(role, p, mine.voice)} />
                    </View>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.voiceRow}>
                      {options.map((o) => (
                        <Chip key={o.voice} label={say(o)} active={currentVoice === o.voice} onPress={() => chooseVoice(role, p, o.voice)} />
                      ))}
                    </ScrollView>
                  )}
                </View>
              );
            })}
            {/* changing voices is tucked away on purpose: every new sample uses the daily voice quota */}
            <Pressable onPress={() => setRecast((r) => !r)} hitSlop={8} style={styles.recast}>
              <Text style={styles.recastText}>{recast ? 'Done' : 'Change voices'}</Text>
            </Pressable>

            <Text style={styles.label}>Anything else? (optional)</Text>
            <View style={[styles.chips, { marginBottom: 10 }]}>
              {station.wishes.map((w) => (
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
          </FadeIn>
        )}

        {phase === 'review' && draft && (
          // the songs are picked and found on Spotify: reorder or drop some, then the hosts write the talks
          <View>
            <Text style={styles.reviewTitle}>Tonight's playlist</Text>
            <Text style={styles.reviewHint}>
              Move songs up or down, or drop one. The hosts write their talks for this exact order.
            </Text>
            {draft.map((t, i) => (
              <View key={t.id} style={styles.row}>
                <Text style={styles.rowNum}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {t.name}
                  </Text>
                  <Text style={styles.rowArtist} numberOfLines={1}>
                    {t.artist}
                  </Text>
                </View>
                <Pressable onPress={() => moveDraft(i, -1)} hitSlop={6} disabled={i === 0} accessibilityLabel={`Move ${t.name} up`}>
                  <Ionicons name="chevron-up" size={22} color={i === 0 ? colors.line : colors.text} />
                </Pressable>
                <Pressable onPress={() => moveDraft(i, 1)} hitSlop={6} disabled={i === draft.length - 1} accessibilityLabel={`Move ${t.name} down`}>
                  <Ionicons name="chevron-down" size={22} color={i === draft.length - 1 ? colors.line : colors.text} />
                </Pressable>
                <Pressable onPress={() => dropDraft(i)} hitSlop={6} disabled={draft.length === 1} accessibilityLabel={`Drop ${t.name}`}>
                  <Ionicons name="close" size={20} color={colors.muted} />
                </Pressable>
              </View>
            ))}
            <View style={styles.after}>
              <PillButton label="Write the show" onPress={writeDraft} />
              <PillButton label="Back" onPress={cancelDraft} ghost />
            </View>
          </View>
        )}

        {phase === 'building' && (
          // what's happening, step by step (no fake skeleton)
          <BuildProgress steps={steps} station={station} />
        )}

        {(phase === 'onair' || phase === 'done') && show && current && (
          <>
            <Text style={styles.showTitle}>
              {show.station.emoji} {show.station.name} {show.station.freq} · {showName(show)}
            </Text>
            <FadeIn key={current.track.id}>
              {current.track.image && <GlowingCover uri={current.track.image} glow={palette?.glow ?? null} live={phase === 'onair' && !paused} talking={speaking} />}
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

            <Text style={styles.label}>
              {phase === 'done' ? 'Tonight’s set · tap a song to play from there' : index + 1 < show.slots.length ? 'Up next' : 'Tonight’s set'}
            </Text>
            {show.slots.map((s, i) => (
              <PressScale
                key={s.track.id}
                scaleTo={0.98}
                style={[styles.row, i === index && styles.rowNow]}
                // on air: jump to it; after the show: play the show again from that song
                onPress={() => (phase === 'onair' ? i !== index && jumpTo(i, false) : replay(i))}
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
              {/* 🔖 keeps this show for good, script and voices, so it can be played again any time for free */}
              <PillButton label={liveKept ? 'Show saved ✓' : 'Save show'} onPress={keepLive} ghost={liveKept} />
              <PillButton label="Save to Spotify" onPress={save} ghost />
              {phase === 'done' && <PillButton label="Play again" onPress={() => replay()} />}
              {phase === 'done' && <PillButton label="New show" onPress={() => setPhase('pick')} ghost />}
            </View>
          </>
        )}
        <StatusLine status={status} />
      </ScrollView>
      </Glass>
      {/* always in reach while picking: floats just above the tab bar */}
      {phase === 'pick' && !keyboard && (
        <View style={[styles.goOnAir, { bottom: insets.bottom + 88 }]} pointerEvents="box-none">
          <PillButton label="Go on air" onPress={start} full />
        </View>
      )}
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
  goOnAir: { position: 'absolute', left: 24, right: 24, elevation: 12 },
  content: { padding: 24 },
  center: { paddingVertical: 80, alignItems: 'center' },
  title: { fontFamily: fonts.display, letterSpacing: -0.4, fontSize: 40, lineHeight: 46, color: colors.text, marginBottom: 14 },
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
  resume: { flexDirection: 'row', gap: 14, padding: 16, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', marginBottom: 10 },
  reviewTitle: { fontFamily: fonts.display, fontSize: 26, color: colors.text, marginBottom: 6 },
  reviewHint: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: colors.muted, marginBottom: 14 },
  pastIcons: { gap: 16, alignItems: 'center' },
  resumeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  recast: { alignSelf: 'flex-start', marginBottom: 18 },
  recastText: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted, textDecorationLine: 'underline' },
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
  coverWrap: { marginBottom: 0 },
  halo: { bottom: 18, borderRadius: radius.md }, // the same box as the cover (its margin excluded)
  backdrop: { transform: [{ scale: 1.25 }], opacity: 0.85 }, // a little bigger: no hard blur edges at the screen's sides
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  trackName: { fontFamily: fonts.display, letterSpacing: -0.4, fontSize: 28, lineHeight: 34, color: colors.text },
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

/** "just now", "25 min ago", "3 h ago". */
function ago(t: number): string {
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 60 * 24) return `${Math.round(min / 60)} h ago`;
  const days = Math.round(min / 1440);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
