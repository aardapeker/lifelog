import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BuildProgress } from '../components/BuildProgress';
import { BlurSource, FrostedGlass, Glass, useBlurSource } from '../components/Glass';
import Ionicons from '../components/Icon';
import { FadeIn, PressScale, Pulse } from '../components/motion';
import { Ban, ColourWash, CoverCloud, GlowingCover, Heart, showName, WASH_BASE, withAlpha } from '../components/radioParts';
import { IconButton, PillButton, StatusLine } from '../components/ui';
import { breadcrumb } from '../lib/crashLog';
import { ActionSheet, type SheetAction } from '../components/ActionSheet';
import { DragList } from '../components/DragList';
import { Booth, ShowTape } from '../components/booth';
import { ProgressLine } from '../components/ProgressLine';
import { skinOf } from '../lib/skins';
import { useLateFonts } from '../lib/lateFonts';
import { LyricsCard } from '../components/LyricsCard';
import { SongAbout } from '../components/SongAbout';
import { SongPicker } from '../components/SongPicker';
import { previewOf } from '../lib/deezer';
import { useRadio } from '../lib/radioEngine';
import { isrcOf } from '../lib/spotify';
import { cleanTitle } from '../lib/songInfo';
import { stopPreview, usePreview } from '../radar/components/Preview';
import { colors, fonts, radius } from '../lib/theme';
import { useFirstFrame } from '../lib/perf';
import { useSwipeToClose } from '../lib/useSwipeToClose';

/**
 * The show, full screen: while it's being made (the live steps, then your playlist check), and on air
 * as a music player: the cover glowing, the song, the controls, and what the hosts are saying.
 * The playlist has its own page (top right).
 */
export default function OnAirScreen() {
  useFirstFrame('Player'); // Settings → Privacy → Speed
  const insets = useSafeAreaInsets();
  const r = useRadio();
  const pv = usePreview('draft');
  const { phase, show, current, palette, paused, speaking, progress, station, steps, draft, status, hearts, voice } = r;
  // what's on the mic: the talk before the current song, or the goodbye once the last song is over
  // (it used to keep showing the last song's talk while the hosts said goodbye)
  const goodbye = !!show && r.index >= show.slots.length;
  const onMic = goodbye && show ? { talk: show.outro, label: 'Goodbye' } : { talk: current?.talk ?? [], label: current?.label ?? null };
  // the station's look on the booth, the tape and the progress line (Cinzel, Monoton… load a moment after the start)
  const skin = skinOf((show ?? { station }).station.key);
  useLateFonts();

  useEffect(() => {
    if (phase === 'onair') breadcrumb('radio: player drawn');
  }, [phase]);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/radio'));
  const [talkOpen, setTalkOpen] = useState(true);
  /** ⋯ : the show's less frequent actions (a bottom sheet: Android's alert drops a 4th button and traps you). */
  const [menu, setMenu] = useState(false);
  const blur = useBlurSource();
  const [scrolled, setScrolled] = useState(false);
  const [dragging, setDragging] = useState(false); // a playlist row is held: the page stops scrolling
  const more = () => setMenu(true);
  // swipe down to close, like a music app's player (not while a playlist row is held)
  const swipe = useSwipeToClose(close, () => dragging);
  // the song picker: "add" on the review list, "request" during the show
  const [picking, setPicking] = useState<'add' | 'request' | null>(null);
  const actions: SheetAction[] = [
    { label: r.liveKept ? 'Unsave the show' : 'Save the show (with its voices)', icon: r.liveKept ? 'bookmark' : 'bookmark-outline', onPress: r.keepLive },
    { label: 'Save the songs to Spotify', icon: 'musical-notes-outline', onPress: r.save },
    phase === 'onair'
      ? { label: 'End the show', icon: 'stop-circle-outline', onPress: r.stop, destructive: true }
      : { label: 'Play it again', icon: 'refresh', onPress: () => r.replay() },
  ];

  return (
    <Animated.View style={[styles.screen, swipe.style]} {...swipe.panHandlers}>
      {/* the page is what the top bar blurs once you scroll (the bar sits outside it, never inside) */}
      <BlurSource target={blur}>
      {/* the same background as the playlist: the song's colour at the top, fading into black */}
      <ColourWash glow={phase === 'onair' || phase === 'done' ? (palette?.glow ?? null) : null} />
      {/* on air: the cover as a slowly turning colour cloud; still while paused, during talks, and when the
          top bar frosts over it (a moving picture under a live blur would make the blur redo every frame) */}
      {phase === 'onair' && current?.track.image && <CoverCloud uri={current.track.image} moving={!paused && !speaking && !scrolled} />}
      {/* no KeepAwake: the screen sleeps as usual and the show goes on, like with the phone locked
          (the screen on for a whole show, with the cloud turning, drained the battery) */}
      <ActionSheet visible={menu} title={show ? showName(show) : 'The show'} actions={actions} onClose={() => setMenu(false)} />
      <SongPicker
        visible={picking !== null}
        title={picking === 'request' ? '🎵 Request a song' : '＋ Add a song to the show'}
        onPick={(t) => (picking === 'request' ? r.requestSong(t) : r.addDraft(t))}
        onClose={() => setPicking(null)}
        multi // requests too: pick several, they play one after another
        chosen={picking === 'add' && draft ? new Set(draft.map((t) => t.id)) : undefined}
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 74, paddingBottom: insets.bottom + 40 }]}
        scrollEnabled={!dragging}
        onScroll={(e) => {
          swipe.onScroll(e);
          setScrolled(e.nativeEvent.contentOffset.y > 12);
        }}
        scrollEventThrottle={32}
      >
        {phase === 'building' && <BuildProgress steps={steps} station={station} />}

        {phase === 'review' && draft && (
          // the songs are picked and found on Spotify: reorder or drop some, then the hosts write the talks
          <FadeIn>
            <Text style={styles.reviewTitle}>Tonight's playlist</Text>
            <Text style={styles.reviewHint}>Tap a cover to hear 30 seconds of it. Hold a song (or its ≡) and drag it to move it, or drop one with ✕. The hosts write their talks for this exact order.</Text>
            <DragList
              items={draft}
              keyOf={(t) => t.id}
              onMove={r.reorderDraft}
              onDragging={setDragging}
              liftedStyle={styles.rowLifted}
              renderRow={(t, i, drag) => (
              <View style={styles.row}>
                {/* tap the cover for a 30-second preview (Deezer), for the songs you don't know */}
                <Pressable
                  onPress={() => pv.toggleFind(t.id, async () => previewOf(t.artist, cleanTitle(t.name), await isrcOf(t.id)))}
                  hitSlop={6}
                  accessibilityLabel={`${pv.is(t.id) ? 'Stop' : 'Play'} a preview of ${t.name}`}
                >
                  {t.image ? <Image source={{ uri: t.image }} style={styles.rowCover} /> : <View style={[styles.rowCover, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />}
                  <View style={[styles.rowPlay, pv.is(t.id) && styles.rowPlaying]}>
                    {pv.finding(t.id) ? (
                      <ActivityIndicator size="small" color={colors.text} />
                    ) : (
                      <Ionicons name={pv.is(t.id) ? 'pause' : pv.noPreview(t.id) ? 'volume-mute' : 'play'} size={16} color={colors.text} />
                    )}
                  </View>
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowName, pv.is(t.id) && { color: '#5BE0A0' }]} numberOfLines={1}>
                    {t.requested ? '🎵 ' : ''}
                    {t.name}
                  </Text>
                  <Text style={styles.rowArtist} numberOfLines={1}>
                    {t.spare ? 'Spare · ' : ''}
                    {pv.noPreview(t.id) ? `${pv.noPreview(t.id)} · ` : ''}
                    {t.artist}
                  </Text>
                  {pv.is(t.id) && (
                    <View style={styles.previewBar}>
                      <View style={[styles.previewFill, { width: `${pv.progress * 100}%` }]} />
                    </View>
                  )}
                </View>
                {/* ≡ drags straight away; holding anywhere on the row works too */}
                <View
                  {...drag.handle}
                  hitSlop={8}
                  accessible
                  accessibilityLabel={`Move ${t.name}`}
                  accessibilityHint="Hold and drag, or use the actions to move it up or down"
                  accessibilityActions={[
                    { name: 'increment', label: 'Move up' },
                    { name: 'decrement', label: 'Move down' },
                  ]}
                  onAccessibilityAction={(e) => r.moveDraft(i, e.nativeEvent.actionName === 'increment' ? -1 : 1)}
                >
                  <Ionicons name="reorder-three" size={26} color={drag.lifted ? '#5BE0A0' : colors.muted} />
                </View>
                <Pressable
                  onPress={() => {
                    if (pv.is(t.id)) stopPreview();
                    r.dropDraft(i);
                  }}
                  hitSlop={6}
                  disabled={draft.length === 1}
                  accessibilityLabel={`Drop ${t.name}`}
                >
                  <Ionicons name="close" size={20} color={colors.muted} />
                </Pressable>
              </View>
            )}
            />
            <PillButton label="＋ Add a song" onPress={() => setPicking('add')} ghost style={{ alignSelf: 'flex-start', marginTop: 12 }} />
            <View style={styles.after}>
              <PillButton
                label="Write the show"
                onPress={() => {
                  stopPreview();
                  r.writeDraft();
                }}
              />
              <PillButton
                label="Back"
                onPress={() => {
                  stopPreview();
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

            {/* the player: frosted glass tinted with the cover's colours, the song, the progress line, the controls */}
            {/* no live blur: under it the cover cloud turns all the time, and a blur over moving pictures is
                redone every frame (the phone got hot). The cloud is already soft; a tint looks the same */}
            <Glass radius={28} style={styles.player} fill="rgba(30, 29, 29, 0.3)">
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
                  <ProgressLine
                    progress={progress}
                    durationMs={current.track.durationMs}
                    onSeek={r.seek}
                    skin={skin}
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
              {/* the booth's ticket: in the station's colours and letters, lit while the hosts talk */}
              <Pressable
                style={[
                  styles.pill,
                  { backgroundColor: skin.panel, borderColor: speaking ? skin.accent : skin.border, borderRadius: Math.min(22, skin.radius * 2) },
                  speaking && { boxShadow: `0 0 14px ${skin.glow ?? skin.accent}88` },
                ]}
                onPress={() => setTalkOpen((o) => !o)}
                accessibilityLabel="What the hosts said"
              >
                <Text style={[styles.pillText, { fontFamily: skin.promptFont, color: speaking ? skin.text : skin.said }]} numberOfLines={1}>
                  {onMic.talk[0]
                    ? `${onMic.label === 'News' ? '📰' : onMic.label === 'Commercial' ? '📢' : onMic.label === 'Goodbye' ? '👋' : '🎙️'} ${onMic.talk[0].text.replace(/<[^>]+>/g, '').trim()}`
                    : '🎵 Just the music'}
                </Text>
              </Pressable>
              {phase === 'onair' && (
                <Tap
                  icon={r.requesting ? 'hourglass-outline' : 'musical-note-outline'}
                  label={r.requesting ? 'The hosts are getting your request ready' : 'Request a song'}
                  onPress={() => setPicking('request')} // more requests can join the line while one is being made
                  small
                />
              )}
              <Tap icon="ellipsis-horizontal" label="More" onPress={more} small />
            </View>

            {/* the booth: who's on the mic, the ON AIR light, the talk as a teleprompter (the pill folds it) */}
            {talkOpen && onMic.talk.length > 0 && (
              <Booth skin={skin} talk={onMic.talk} label={onMic.label} speaking={speaking} talkAt={r.talkAt} showNames={!!show.station.sidekick || !!show.guest || !!show.regular} />
            )}

            {/* the whole show as a cassette strip: tap a song to play it, a talk marker to hear it again */}
            <ShowTape skin={skin} show={show} index={r.index} progress={progress} speaking={speaking} onJump={phase === 'onair' ? r.jumpTo : undefined} />

            {/* live lyrics: the line being sung, tap one to jump there */}
            {phase === 'onair' && (
              <LyricsCard
                track={current.track}
                progress={progress}
                running={!paused && !speaking}
                paused={paused}
                palette={palette}
                skin={skin}
                onSeek={r.seek}
                onTogglePause={r.togglePause}
              />
            )}

            {/* credits and the artist's card, folded until opened */}
            <SongAbout track={current.track} />

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
      </BlurSource>

      {/* the header floats over the page, so the cover's glow isn't cut off at a line; once the page
          scrolls under it, it turns into frosted glass (like the other pages' top bars) */}
      <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
        {scrolled && <FrostedGlass target={blur} style={StyleSheet.absoluteFill} />}
        <IconButton icon="chevron-down" label="Close" onPress={close} />
        <View style={styles.barMid}>
          <View style={styles.onAir}>
            {phase === 'onair' && !paused && <Pulse style={[styles.dot, { backgroundColor: skin.air }]} />}
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
    </Animated.View>
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
  screen: { flex: 1, backgroundColor: WASH_BASE },
  bar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
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
  pill: { flex: 1, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1 },
  pillText: { fontSize: 13 },
  done: { fontFamily: fonts.sansRegular, fontSize: 15, lineHeight: 22, color: colors.muted, marginTop: 10 },
  reviewTitle: { fontFamily: fonts.display, fontSize: 26, color: colors.text, marginBottom: 6 },
  reviewHint: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: colors.muted, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingHorizontal: 10, borderRadius: radius.sm },
  rowLifted: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: radius.sm },
  rowName: { fontFamily: fonts.sans, fontSize: 15, color: colors.text },
  rowCover: { width: 44, height: 44, borderRadius: 6 },
  rowPlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  rowPlaying: { backgroundColor: 'rgba(0,0,0,0.55)' },
  previewBar: { height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginTop: 5, overflow: 'hidden' },
  previewFill: { height: 2, backgroundColor: '#5BE0A0' },
  rowArtist: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted, marginTop: 2 },
  after: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 22 },
  idle: { paddingTop: 40 },
});
