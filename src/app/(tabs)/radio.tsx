import Ionicons from '../../components/Icon';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurSource, GlassArea, useBlurSource, useTabBlurSource } from '../../components/Glass';
import { bigTitleMotion, CollapsingHeader, useCollapsingHeader } from '../../components/CollapsingHeader';
import { FadeIn, Pulse, PressScale, stagger } from '../../components/motion';
import { ago, showName, ShowWash, useResumeShow } from '../../components/radioParts';
import { StationArt } from '../../components/StationArt';
import { TuningDial } from '../../components/TuningDial';
import { Chip } from '../../components/ui';
import { useRadio } from '../../lib/radioEngine';
import { STATIONS } from '../../lib/stations';
import { skinOf } from '../../lib/skins';
import { colors, fonts, frost, radius, TAB_BAR_SPACE } from '../../lib/theme';
import { TopBar } from '../../components/TopBar';
import { showAlert } from '../../lib/dialog';
import { useFirstFrame } from '../../lib/perf';

/**
 * The Radio tab: the stations as a grid of cards (tap one for its options), and the shows you've
 * heard on their own tab. While a show is being made or on air, a card on top takes you back to it.
 */
export default function RadioHome() {
  useFirstFrame('Radio'); // Settings → Privacy → Speed
  const insets = useSafeAreaInsets();
  const blur = useBlurSource(); // for the tab bar's and the slim top bar's frosted glass
  useTabBlurSource(blur);
  const { y, onScroll } = useCollapsingHeader(); // like Life: the big title scrolls away into a slim glass bar
  const [tab, setTab] = useState<'stations' | 'recent' | 'saved'>('stations');
  const { history, loadHistory, forgetShow, keepShow, phase, show, current, paused, togglePause, skip } = useRadio();
  const saved = history.filter((h) => h.kept); // 🔖 kept for good
  // each station's last show, for the line under its tile ("Last show 2 h ago")
  const lastOf = (key: string) => history.filter((h) => h.show.station.key === key).reduce<number | null>((a, h) => Math.max(a ?? 0, h.savedAt), null);
  useFocusEffect(useCallback(() => { loadHistory(); }, [loadHistory])); // Settings may have changed how long shows are kept

  const live = phase === 'building' || phase === 'review' || phase === 'onair';
  const resume = useResumeShow();

  return (
    <View style={styles.screen}>
      {/* behind the glass, NOT inside the blur area: when a show goes on air this tab (hidden under the
          player) re-colours its background, and a live blur re-capturing that crashed the app (GPU
          driver, SIGSEGV) right after "Write the show". The sheet is see-through glass instead. */}
      <ShowWash />
      <BlurSource target={blur}>
      <GlassArea>
          <Animated.ScrollView
            style={{ flex: 1 }}
            onScroll={onScroll}
            scrollEventThrottle={16}
            contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: 40 + TAB_BAR_SPACE + insets.bottom }]}
          >
            {/* the same top as Life (Arda: the small "Radio", a glass panel and a big "Tune In" were too much) */}
            <TopBar kicker="Tune in" title={<Animated.Text style={[styles.title, bigTitleMotion(y)]}>Radio</Animated.Text>} />

            {/* the dial: the needle on the station that's on air (or the last one heard); tap a mark to tune in */}
            <TuningDial
              stations={STATIONS}
              on={(live && show?.station.key) || history[0]?.show.station.key || null}
              onTune={(st) => router.push(`/station/${st.key}`)}
            />

            {/* the show in progress, one tap away */}
            {live && (
              <FadeIn>
                <PressScale style={styles.now} scaleTo={0.98} onPress={() => router.push('/onair')} accessibilityLabel="Open the show">
                  {phase === 'onair' && current?.track.image ? (
                    <Image source={{ uri: current.track.image }} style={styles.nowCover} />
                  ) : (
                    <View style={[styles.nowCover, styles.nowCoverEmpty]}>
                      <Ionicons name="radio-outline" size={22} color={colors.text} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <View style={styles.nowTag}>
                      {phase === 'onair' && !paused && <Pulse style={styles.dot} />}
                      <Text style={styles.nowSmall}>{phase === 'onair' ? `On air, ${show?.station.name ?? ''}` : phase === 'review' ? 'Your playlist is ready' : 'Preparing your show'}</Text>
                    </View>
                    <Text style={styles.nowName} numberOfLines={1}>
                      {phase === 'onair' && current ? current.track.name : show ? showName(show) : 'Warming up the mic…'}
                    </Text>
                    {phase === 'onair' && current && (
                      <Text style={styles.nowArtist} numberOfLines={1}>
                        {current.track.artist}
                      </Text>
                    )}
                  </View>
                  {phase === 'onair' ? (
                    // the show's own controls, without opening the player
                    <View style={styles.nowControls}>
                      <Pressable onPress={togglePause} hitSlop={8} style={styles.nowPlay} accessibilityLabel={paused ? 'Play' : 'Pause'}>
                        <Ionicons name={paused ? 'play' : 'pause'} size={20} color={colors.bg} />
                      </Pressable>
                      <Pressable onPress={skip} hitSlop={8} accessibilityLabel="Next song">
                        <Ionicons name="play-forward" size={22} color={colors.text} />
                      </Pressable>
                    </View>
                  ) : (
                    <Ionicons name="chevron-forward" size={20} color={colors.muted} />
                  )}
                </PressScale>
              </FadeIn>
            )}

            <View style={styles.tabs}>
              <Chip label="Stations" active={tab === 'stations'} onPress={() => setTab('stations')} />
              <Chip label={history.length ? `Recent · ${history.length}` : 'Recent'} active={tab === 'recent'} onPress={() => setTab('recent')} />
              <Chip label={saved.length ? `Saved · ${saved.length}` : 'Saved'} active={tab === 'saved'} onPress={() => setTab('saved')} />
            </View>

            {tab === 'stations' ? (
              <View style={styles.grid}>
                {STATIONS.map((st, i) => (
                  <FadeIn key={st.key} delay={stagger(i, 50)} style={styles.cell}>
                    <PressScale scaleTo={0.96} onPress={() => router.push(`/station/${st.key}`)} accessibilityLabel={`${st.name} ${st.freq}`}>
                      <StationArt station={st} size={30} label="freq" style={styles.tile} />
                      <Text style={styles.tileName} numberOfLines={1}>
                        {st.name}
                      </Text>
                      <Text style={styles.tileLine} numberOfLines={2}>
                        {st.tagline}
                      </Text>
                      {lastOf(st.key) != null && <Text style={styles.tileLast}>Last show {ago(lastOf(st.key)!)}</Text>}
                    </PressScale>
                  </FadeIn>
                ))}
              </View>
            ) : (tab === 'saved' ? saved : history).length === 0 ? (
              <Text style={styles.empty}>
                {tab === 'saved'
                  ? 'No saved shows yet. Tap Save show in the player (or 🔖 on a recent show) to keep one for good, with its voices.'
                  : 'No shows yet. Pick a station and go on air: every show you hear is kept here for a while.'}
              </Text>
            ) : (
              (tab === 'saved' ? saved : history).map((h) => {
                const open = !h.done && h.index < h.show.slots.length;
                const cover = h.show.slots[Math.min(h.index, h.show.slots.length - 1)]?.track.image;
                const heard = open ? h.index / Math.max(1, h.show.slots.length) : 1;
                const accent = skinOf(h.show.station.key).accent;
                // a slim row: tap it for the show's page (its songs, resume or play again); ▶ carries on straight away
                // (or plays it again); the bar shows how far you got
                return (
                  <PressScale
                    key={h.id}
                    style={styles.past}
                    scaleTo={0.98}
                    onPress={() => router.push({ pathname: '/show/[id]', params: { id: h.id } })}
                    accessibilityLabel={`${showName(h.show)}: its songs, resume or play again`}
                  >
                    {cover ? <Image source={{ uri: cover }} style={styles.pastCover} /> : <View style={styles.pastCover} />}
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={styles.pastName} numberOfLines={2}>
                        {showName(h.show)}
                      </Text>
                      <Text style={styles.pastSub} numberOfLines={2}>
                        <Text style={{ color: accent }}>{h.show.station.name}</Text>
                        {`, ${ago(h.savedAt)}${open ? `, song ${h.index + 1} of ${h.show.slots.length}` : ''}`}
                      </Text>
                      <View style={styles.pastTrack}>
                        <View style={[styles.pastHeard, { width: `${Math.round(heard * 100)}%`, backgroundColor: accent }]} />
                      </View>
                    </View>
                    <View style={styles.pastIcons}>
                      <Pressable onPress={() => resume(h.id, !open)} hitSlop={8} accessibilityLabel={open ? 'Resume' : 'Play again'}>
                        <Ionicons name={open ? 'play' : 'refresh'} size={18} color={colors.text} />
                      </Pressable>
                      <Pressable onPress={() => keepShow(h.id, !h.kept)} hitSlop={8} accessibilityLabel={h.kept ? 'Unsave show' : 'Save show'}>
                        <Ionicons name={h.kept ? 'bookmark' : 'bookmark-outline'} size={18} color={h.kept ? colors.text : colors.muted} />
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          h.kept
                            ? showAlert('Delete this saved show?', 'Its script and voices are deleted from your phone.', [
                                { text: 'Keep it', style: 'cancel' },
                                { text: 'Delete', style: 'destructive', onPress: () => forgetShow(h.id) },
                              ])
                            : forgetShow(h.id)
                        }
                        hitSlop={8}
                        accessibilityLabel="Delete show"
                      >
                        <Ionicons name="close" size={18} color={colors.muted} />
                      </Pressable>
                    </View>
                  </PressScale>
                );
              })
            )}
          </Animated.ScrollView>
      </GlassArea>
      </BlurSource>
      <CollapsingHeader title="Radio" y={y} blur={blur} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20 },
  title: { fontFamily: fonts.display, letterSpacing: -0.4, fontSize: 34, color: colors.text },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 22 },
  cell: { width: '48.2%' },
  tile: { aspectRatio: 1.45 },
  tileName: { fontFamily: fonts.sans, fontSize: 15, color: colors.text, marginTop: 10, marginLeft: 2 },
  tileLine: { fontFamily: fonts.sansRegular, fontSize: 12, lineHeight: 16, color: colors.muted, marginTop: 2, marginLeft: 2 },
  tileLast: { fontFamily: fonts.sansRegular, fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4, marginLeft: 2 },
  nowControls: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  nowPlay: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  empty: { fontFamily: fonts.sansRegular, fontSize: 15, lineHeight: 22, color: colors.muted, marginTop: 8 },
  now: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: radius.md,
    ...frost, // glass, like Life's cards
    marginBottom: 18,
  },
  nowCover: { width: 54, height: 54, borderRadius: 12, backgroundColor: colors.raised },
  nowCoverEmpty: { alignItems: 'center', justifyContent: 'center' },
  nowTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.danger },
  nowSmall: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted },
  nowName: { fontFamily: fonts.sans, fontSize: 16, color: colors.text, marginTop: 2 },
  nowArtist: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted, marginTop: 1 },
  past: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 12, borderRadius: radius.md, ...frost, marginBottom: 8 }, // glass, like Life's cards
  pastCover: { width: 52, height: 52, borderRadius: 10, backgroundColor: colors.raised },
  pastName: { fontFamily: fonts.sans, fontSize: 15, color: colors.text },
  pastSub: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted },
  pastTrack: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden', marginTop: 4 },
  pastHeard: { height: 3, borderRadius: 2 },
  pastIcons: { flexDirection: 'row', gap: 16, alignItems: 'center', paddingLeft: 4 },
});
