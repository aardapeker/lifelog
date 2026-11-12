import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BuildProgress } from '../components/BuildProgress';
import { MorphPlayButton, WavyProgress } from '../components/expressive';
import { Glass } from '../components/Glass';
import Ionicons from '../components/Icon';
import { FadeIn, Pulse } from '../components/motion';
import { AlbumGlow, Ban, GlowingCover, Heart, KeepAwake, showName } from '../components/radioParts';
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

  return (
    <View style={styles.screen}>
      <AlbumGlow palette={palette} image={phase === 'onair' || phase === 'done' ? (current?.track.image ?? null) : null} />
      {phase === 'onair' && <KeepAwake />}

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

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
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
            <FadeIn key={current.track.id}>
              {current.track.image && (
                <GlowingCover uri={current.track.image} glow={palette?.glow ?? null} live={phase === 'onair' && !paused} talking={speaking} />
              )}
            </FadeIn>

            {/* the player: song, progress, controls */}
            <Glass radius={28} style={styles.player} fill="rgba(29, 28, 28, 0.45)">
              <View style={styles.titleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.trackName} numberOfLines={2}>
                    {current.track.name}
                  </Text>
                  <Text style={styles.trackArtist} numberOfLines={1}>
                    {current.track.artist}
                  </Text>
                </View>
              </View>
              {phase === 'onair' && <WavyProgress progress={progress} playing={!paused && !speaking} />}
              {phase === 'onair' ? (
                <View style={styles.controls}>
                  <Ban name={current.track.name} onBan={() => r.ban(current.track)} size={22} />
                  <IconButton icon="play-skip-back" label="Previous" onPress={r.previous} size={50} />
                  <MorphPlayButton playing={!paused} onPress={r.togglePause} />
                  <IconButton icon="play-skip-forward" label="Next song" onPress={r.skip} size={50} />
                  <Heart on={hearts.has(current.track.id)} onPress={() => r.toggleHeart(current.track)} size={26} />
                </View>
              ) : (
                <Text style={styles.done}>That's the show. Spotify keeps playing from here.</Text>
              )}
            </Glass>

            {/* the small things: hosts on/off, keep the show, end it */}
            <View style={styles.extras}>
              <Extra icon={voice ? 'mic' : 'mic-off'} label={voice ? 'Hosts on' : 'Hosts off'} onPress={r.toggleVoice} />
              <Extra icon={r.liveKept ? 'bookmark' : 'bookmark-outline'} label={r.liveKept ? 'Saved' : 'Save show'} onPress={r.keepLive} />
              <Extra icon="logo-spotify" label="To Spotify" onPress={r.save} />
              {phase === 'onair' ? (
                <Extra icon="stop" label="End" onPress={r.stop} />
              ) : (
                <Extra icon="refresh" label="Play again" onPress={() => r.replay()} />
              )}
            </View>

            {/* what the hosts said before this song */}
            {current.talk.length > 0 && (
              <Glass radius={22} style={styles.talk} fill="rgba(29, 28, 28, 0.35)">
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
    </View>
  );
}

function Extra({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.extra} hitSlop={6} accessibilityLabel={label}>
      <Ionicons name={icon as never} size={20} color={colors.text} />
      <Text style={styles.extraText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  barMid: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  onAir: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.danger },
  barSmall: { fontFamily: fonts.sans, fontSize: 11, letterSpacing: 1.2, color: colors.muted },
  barTitle: { fontFamily: fonts.sans, fontSize: 15, color: colors.text, marginTop: 2 },
  content: { paddingHorizontal: 22, paddingTop: 8 },
  showName: { fontFamily: fonts.serifItalic, fontSize: 15, color: colors.muted, marginBottom: 14, textAlign: 'center' },
  player: { padding: 18, marginTop: 22 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  trackName: { fontFamily: fonts.display, letterSpacing: -0.4, fontSize: 24, lineHeight: 30, color: colors.text },
  trackArtist: { fontFamily: fonts.sans, fontSize: 15, color: colors.muted, marginTop: 3 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  done: { fontFamily: fonts.sansRegular, fontSize: 15, lineHeight: 22, color: colors.muted, marginTop: 10 },
  extras: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 16 },
  extra: { alignItems: 'center', gap: 4, minWidth: 64 },
  extraText: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted },
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
