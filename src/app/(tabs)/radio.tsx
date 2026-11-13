import Ionicons from '../../components/Icon';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass, GlassArea } from '../../components/Glass';
import { FadeIn, Pulse, PressScale, stagger } from '../../components/motion';
import { ago, showName, ShowWash } from '../../components/radioParts';
import { StationArt } from '../../components/StationArt';
import { Chip } from '../../components/ui';
import { useRadio } from '../../lib/radioEngine';
import { STATIONS } from '../../lib/stations';
import { colors, fonts, radius, TAB_BAR_SPACE } from '../../lib/theme';
import { Avatar, Bell } from '../../components/TopBar';

/**
 * The Radio tab: the stations as a grid of cards (tap one for its options), and the shows you've
 * heard on their own tab. While a show is being made or on air, a card on top takes you back to it.
 */
export default function RadioHome() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'stations' | 'recent' | 'saved'>('stations');
  const { history, loadHistory, playPast, forgetShow, keepShow, phase, show, current, paused } = useRadio();
  const saved = history.filter((h) => h.kept); // 🔖 kept for good
  useFocusEffect(useCallback(() => { loadHistory(); }, [loadHistory])); // Settings may have changed how long shows are kept

  const live = phase === 'building' || phase === 'review' || phase === 'onair';
  const resume = (id: string, fromStart: boolean) => {
    playPast(id, fromStart);
    router.push('/onair');
  };

  return (
    <View style={styles.screen}>
      {/* behind the glass, NOT inside the blur area: when a show goes on air this tab (hidden under the
          player) re-colours its background, and a live blur re-capturing that crashed the app (GPU
          driver, SIGSEGV) right after "Write the show". The sheet is see-through glass instead. */}
      <ShowWash />
      <GlassArea style={{ paddingTop: insets.top + 8 }}>
        <View style={styles.bar}>
          <Avatar size={44} />
          <Text style={styles.barTitle}>Radio</Text>
          <Bell />
        </View>

        <Glass radius={28} style={styles.sheet} fill="rgba(18, 18, 18, 0.55)">
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 + TAB_BAR_SPACE + insets.bottom }]}>
            <Text style={styles.title}>Tune In</Text>

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
                      <Text style={styles.nowSmall}>{phase === 'onair' ? 'ON AIR' : phase === 'review' ? 'YOUR PLAYLIST IS READY' : 'PREPARING YOUR SHOW'}</Text>
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
                  <Ionicons name="chevron-forward" size={20} color={colors.muted} />
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
                      <StationArt station={st} size={30} style={styles.tile} />
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
                return (
                  <View key={h.id} style={styles.past}>
                    {cover ? <Image source={{ uri: cover }} style={styles.pastCover} /> : <View style={styles.pastCover} />}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pastName} numberOfLines={1}>
                        {showName(h.show)}
                      </Text>
                      <Text style={styles.pastSub} numberOfLines={1}>
                        {h.kept ? 'Saved · ' : ''}
                        {h.show.station.name} · {ago(h.savedAt)} · {open ? `song ${h.index + 1}/${h.show.slots.length}` : 'finished'}
                      </Text>
                      <View style={styles.pastActions}>
                        {open ? (
                          <>
                            <Chip label="Resume" active onPress={() => resume(h.id, false)} />
                            <Chip label="From the start" onPress={() => resume(h.id, true)} />
                          </>
                        ) : (
                          <Chip label="Play again" active onPress={() => resume(h.id, true)} />
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
              })
            )}
          </ScrollView>
        </Glass>
      </GlassArea>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 14 },
  barTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.text },
  sheet: { flex: 1, marginBottom: -40 },
  content: { padding: 20 },
  title: { fontFamily: fonts.display, letterSpacing: -0.4, fontSize: 40, lineHeight: 46, color: colors.text, marginBottom: 18, marginLeft: 4 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14 },
  cell: { width: '48.2%' },
  tile: { aspectRatio: 1.45 },
  empty: { fontFamily: fonts.sansRegular, fontSize: 15, lineHeight: 22, color: colors.muted, marginTop: 8 },
  now: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    marginBottom: 18,
  },
  nowCover: { width: 54, height: 54, borderRadius: 12, backgroundColor: colors.raised },
  nowCoverEmpty: { alignItems: 'center', justifyContent: 'center' },
  nowTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.danger },
  nowSmall: { fontFamily: fonts.sans, fontSize: 11, letterSpacing: 1, color: colors.muted },
  nowName: { fontFamily: fonts.sans, fontSize: 16, color: colors.text, marginTop: 2 },
  nowArtist: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted, marginTop: 1 },
  past: { flexDirection: 'row', gap: 14, padding: 14, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: 10 },
  pastCover: { width: 56, height: 56, borderRadius: 12, backgroundColor: colors.raised },
  pastName: { fontFamily: fonts.sans, fontSize: 16, color: colors.text },
  pastSub: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted, marginTop: 2 },
  pastActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  pastIcons: { gap: 16, alignItems: 'center' },
});
