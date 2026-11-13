import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BuildProgress } from '../components/BuildProgress';
import { SeekBar } from '../components/expressive';
import { Glass, GlassArea } from '../components/Glass';
import Ionicons from '../components/Icon';
import { FadeIn, PressScale, Pulse } from '../components/motion';
import { AlbumGlow, Ban, GlowingCover, Heart, KeepAwake, showName, withAlpha } from '../components/radioParts';
import { IconButton, PillButton, StatusLine } from '../components/ui';
import { useRadio } from '../lib/radioEngine';
import { colors, fonts, radius } from '../lib/theme';

/**
 * The show, full screen: while it's being made (the live steps, then your playlist check), and on air
 * as a music player: the cover glowing, the song, the controls, and what the hosts are saying.
 * The playlist has its own page (top right).
 */
export default function OnAirScreen() {
  const insets = useSafeAreaInsets();
  const r = useRadio();
  const { phase, show, current, palette, paused, speaking, progress, station, steps, draft, status, hearts, voice } = r;

  const close = () => (router.canGoBack() ? router.back() : router.replace('/radio'));
  const [talkOpen, setTalkOpen] = useState(true);
  /** ⋯ : the show's less frequent actions. */
  const more = () =>
    Alert.alert(show ? showName(show) : 'The show', undefined, [
      { text: r.liveKept ? 'Unsave the show' : 'Save the show (with its voices)', onPress: r.keepLive },
      { text: 'Save the songs to Spotify', onPress: r.save },
      phase === 'onair'
        ? { text: 'End the show', style: 'destructive', onPress: r.stop }
        : { text: 'Play it again', onPress: () => r.replay() },
      { text: 'Cancel', style: 'cancel' },
    ]);

  return (
    <View style={styles.screen}>
      {/* everything sits in a blur area, so the player panel is real frosted glass over the cover's colours */}
      <GlassArea>
      <AlbumGlow palette={palette} image={phase === 'onair' || phase === 'done' ? (current?.track.image ?? null) : null} />
      {phase === 'onair' && <KeepAwake />}
      {/* like the reference: the cover's colours melt into darkness at the bottom… */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.85)']}
        locations={[0, 0.6, 1]}
        style={[StyleSheet.absoluteFill, { top: '45%' }]}
        pointerEvents="none"
      />

      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 74, paddingBottom: insets.bottom + 40 }]}>
        {phase === 'building' && <BuildProgress steps={steps} station={station} />}

        {phase === 'review' && draft && (
          // the songs are picked and found on Spotify: reorder or drop some, then the hosts write the talks
          <FadeIn>
            <Text style={styles.reviewTitle}>Tonight's playlist</Text>
            <Text style={styles.reviewHint}>Move songs up or down, or drop one. The hosts write their talks for this exact order.</Text>
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
                <Pressable onPress={() => r.moveDraft(i, -1)} hitSlop={6} disabled={i === 0} accessibilityLabel={`Move ${t.name} up`}>
                  <Ionicons name="chevron-up" size={22} color={i === 0 ? colors.line : colors.text} />
                </Pressable>
                <Pressable onPress={() => r.moveDraft(i, 1)} hitSlop={6} disabled={i === draft.length - 1} accessibilityLabel={`Move ${t.name} down`}>
                  <Ionicons name="chevron-down" size={22} color={i === draft.length - 1 ? colors.line : colors.text} />
                </Pressable>
                <Pressable onPress={() => r.dropDraft(i)} hitSlop={6} disabled={draft.length === 1} accessibilityLabel={`Drop ${t.name}`}>
                  <Ionicons name="close" size={20} color={colors.muted} />
                </Pressable>
              </View>
            ))}
            <View style={styles.after}>
              <PillButton label="Write the show" onPress={r.writeDraft} />
              <PillButton
                label="Back"
                onPress={() => {
                  r.cancelDraft();
                  close();
                }}
                ghost
              />
            </View>
          </FadeIn>
        )}

        {phase === 'pick' && (
          <View style={styles.idle}>
            <Text style={styles.reviewTitle}>Nothing on air</Text>
            <PillButton label="Pick a station" onPress={() => router.replace('/radio')} style={{ alignSelf: 'flex-start', marginTop: 16 }} />
          </View>
        )}

        {(phase === 'onair' || phase === 'done') && show && current && (
          <>
            <Text style={styles.showName} numberOfLines={1}>
              {show.station.emoji} {showName(show)}
            </Text>
            <FadeIn key={current.track.id} style={styles.coverBox}>
              {current.track.image && (
                <GlowingCover uri={current.track.image} glow={palette?.glow ?? null} live={phase === 'onair' && !paused} talking={speaking} />
              )}
            </FadeIn>

            {/* the player: frosted glass tinted with the cover's colours, the song, a seekable waveform, the controls */}
            <Glass blur radius={28} style={styles.player} fill="rgba(30, 29, 29, 0.18)">
              <LinearGradient
                colors={[withAlpha(palette?.glow ?? 'rgb(120, 110, 130)', 0.42), withAlpha(palette?.deep ?? 'rgb(40, 36, 44)', 0.55)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <View style={styles.titleRow}>
                {current.track.image && <Image source={{ uri: current.track.image }} style={styles.thumb} />}
                <View style={{ flex: 1 }}>
                  <Text style={styles.trackName} numberOfLines={1}>
                    {current.track.name}
                  </Text>
                  <Text style={styles.trackArtist} numberOfLines={1}>
                    {current.track.artist}
                  </Text>
                </View>
              </View>
              {phase === 'onair' ? (
                <>
                  <SeekBar
                    progress={progress}
                    durationMs={current.track.durationMs}
                    seed={current.track.id}
                    onSeek={r.seek}
                    disabled={speaking} // while the hosts talk, the song isn't on yet
                  />
                  <View style={styles.controls}>
                    <Ban name={current.track.name} onBan={() => r.ban(current.track)} size={22} />
                    <Tap icon="play-back" label="Previous" onPress={r.previous} />
                    <PressScale onPress={r.togglePause} scaleTo={0.9} style={styles.play} accessibilityLabel={paused ? 'Play' : 'Pause'}>
                      <Ionicons name={paused ? 'play' : 'pause'} size={26} color={colors.text} />
                    </PressScale>
                    <Tap icon="play-forward" label="Next song" onPress={r.skip} />
                    <Heart on={hearts.has(current.track.id)} onPress={() => r.toggleHeart(current.track)} size={24} />
                  </View>
                </>
              ) : (
                <Text style={styles.done}>That's the show. Spotify keeps playing from here.</Text>
              )}
            </Glass>

            {/* under the player: hosts on/off · what's on the mic · more */}
            <View style={styles.under}>
              <Tap icon={voice ? 'mic-outline' : 'mic-off-outline'} label={voice ? 'Hosts on (tap to mute them)' : 'Hosts off'} onPress={r.toggleVoice} small />
              <Pressable style={styles.pill} onPress={() => setTalkOpen((o) => !o)} accessibilityLabel="What the hosts said">
                <Text style={styles.pillText} numberOfLines={1}>
                  {current.talk[0]
                    ? `${current.label === 'News' ? '📰' : current.label === 'Commercial' ? '📢' : '🎙️'} ${current.talk[0].text.replace(/<[^>]+>/g, '').trim()}`
                    : '🎵 Just the music'}
                </Text>
              </Pressable>
              <Tap icon="ellipsis-horizontal" label="More" onPress={more} small />
            </View>

            {/* what the hosts said before this song (the pill folds it) */}
            {talkOpen && current.talk.length > 0 && (
              <Glass radius={22} style={styles.talk} fill="rgba(20, 19, 19, 0.38)">
                <Text style={styles.talkHead}>
                  {current.label === 'News' ? '📰 NEWS' : current.label === 'Commercial' ? '📢 COMMERCIAL BREAK' : '🎙️ ON THE MIC'}
                </Text>
                {current.talk.map((l, k) => (
                  <Text key={k} style={[styles.line, speaking && { color: colors.text }]}>
                    {show.station.sidekick && <Text style={styles.who}>{l.speaker}: </Text>}
                    {l.text.replace(/<[^>]+>/g, '').trim()}
                  </Text>
                ))}
              </Glass>
            )}

            {phase === 'done' && (
              <PillButton
                label="New show"
                onPress={() => {
                  r.setPhase('pick');
                  router.replace('/radio');
                }}
                style={{ alignSelf: 'flex-start', marginTop: 18 }}
              />
            )}
          </>
        )}
        <StatusLine status={status} />
      </ScrollView>

      {/* …and the same soft fade at the top, under the header, instead of a hard edge where the page
          scrolls: the bar floats over the page (so the cover's glow isn't cut off at a line) */}
      <LinearGradient
        colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0)']}
        locations={[0, 0.55, 1]}
        style={[styles.topFade, { height: insets.top + 76 }]} // only behind the header: it used to dim the show's name
        pointerEvents="none"
      />
      <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
        <IconButton icon="chevron-down" label="Close" onPress={close} />
        <View style={styles.barMid}>
          <View style={styles.onAir}>
            {phase === 'onair' && !paused && <Pulse style={styles.dot} />}
            <Text style={styles.barSmall}>{phase === 'onair' ? 'ON AIR' : phase === 'done' ? 'THAT WAS' : 'PREPARING'}</Text>
          </View>
          <Text style={styles.barTitle} numberOfLines={1}>
            {(show ?? { station }).station.name} {(show ?? { station }).station.freq}
          </Text>
        </View>
        {show && (phase === 'onair' || phase === 'done') ? (
          <IconButton icon="list" label="Playlist" onPress={() => router.push('/playlist')} />
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>
      </GlassArea>
    </View>
  );
}

/** A plain icon button (no circle), like a music app's controls. */
function Tap({ icon, label, onPress, small }: { icon: string; label: string; onPress: () => void; small?: boolean }) {
  return (
    <PressScale onPress={onPress} scaleTo={0.85} hitSlop={10} accessibilityLabel={label} style={styles.tap}>
      <Ionicons name={icon as never} size={small ? 22 : 28} color={colors.text} />
    </PressScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  topFade: { position: 'absolute', top: 0, left: 0, right: 0 },
  barMid: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  onAir: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.danger },
  barSmall: { fontFamily: fonts.sans, fontSize: 11, letterSpacing: 1.2, color: 'rgba(255,255,255,0.8)', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 5 },
  barTitle: { fontFamily: fonts.sans, fontSize: 15, color: colors.text, marginTop: 2, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 5 },
  content: { paddingHorizontal: 22, paddingTop: 8 },
  // readable on any cover colour, even a pale one: bright, a touch heavier, with a soft shadow
  showName: { fontFamily: fonts.sans, fontSize: 15, color: 'rgba(255,255,255,0.92)', marginBottom: 14, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  coverBox: { width: '82%', alignSelf: 'center', marginTop: 6 }, // like a record sleeve, with room around it
  player: { padding: 18, marginTop: 26 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 46, height: 46, borderRadius: 12 },
  trackName: { fontFamily: fonts.display, letterSpacing: -0.3, fontSize: 19, lineHeight: 24, color: colors.text },
  trackArtist: { fontFamily: fonts.sans, fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingHorizontal: 4 },
  tap: { padding: 4 },
  play: {
    width: 76,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  under: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, paddingHorizontal: 6 },
  pill: { flex: 1, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.10)' },
  pillText: { fontFamily: fonts.sansRegular, fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  done: { fontFamily: fonts.sansRegular, fontSize: 15, lineHeight: 22, color: colors.muted, marginTop: 10 },
  talk: { padding: 18, marginTop: 18 },
  talkHead: { fontFamily: fonts.sans, fontSize: 11, letterSpacing: 1.2, color: colors.muted, marginBottom: 4 },
  line: { fontFamily: fonts.serifItalic, fontSize: 16, lineHeight: 24, color: colors.muted, marginTop: 8 },
  who: { fontFamily: fonts.serifBold, fontStyle: 'normal' },
  reviewTitle: { fontFamily: fonts.display, fontSize: 26, color: colors.text, marginBottom: 6 },
  reviewHint: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: colors.muted, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingHorizontal: 10, borderRadius: radius.sm },
  rowNum: { fontFamily: fonts.serif, fontSize: 15, color: colors.muted, width: 18 },
  rowName: { fontFamily: fonts.sans, fontSize: 15, color: colors.text },
  rowArtist: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted, marginTop: 2 },
  after: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 22 },
  idle: { paddingTop: 40 },
});
