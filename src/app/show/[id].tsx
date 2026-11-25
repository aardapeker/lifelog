import { router, useLocalSearchParams } from 'expo-router';
import { Animated, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassArea } from '../../components/Glass';
import Ionicons from '../../components/Icon';
import { PressScale } from '../../components/motion';
import { ago, ColourWash, duration, showName, useResumeShow, WASH_BASE } from '../../components/radioParts';
import { IconButton, PillButton } from '../../components/ui';
import { hslToRgb, toHsl } from '../../lib/color';
import { showAlert } from '../../lib/dialog';
import { useRadio, voicedIds } from '../../lib/radioEngine';
import { plain, skinOf } from '../../lib/skins';
import { colors, fonts, frost, radius } from '../../lib/theme';
import { useSwipeToClose } from '../../lib/useSwipeToClose';

/**
 * A show from Recent shows, before you play it: its songs (and what the hosts said before each), how far you got,
 * whether its voices are saved, and the choice: carry on, start over, or start from any song.
 */
export default function ShowScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { history, keepShow, forgetShow } = useRadio();
  const play = useResumeShow();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/radio'));
  const swipe = useSwipeToClose(close);
  const h = history.find((x) => x.id === id);

  if (!h)
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 20, paddingHorizontal: 20 }]}>
        <IconButton icon="chevron-down" label="Close" onPress={close} />
        <Text style={styles.hint}>This show isn't kept any more.</Text>
      </View>
    );

  const s = h.show;
  const n = s.slots.length;
  const open = !h.done && h.index < n; // stopped halfway: it can carry on
  const skin = skinOf(s.station.key);
  const voiced = voicedIds(history).includes(h.id);
  const cover = s.slots[Math.min(h.index, n - 1)]?.track.image ?? s.slots[0]?.track.image;
  const minutes = Math.round(s.slots.reduce((a, x) => a + (x.track.durationMs || 0), 0) / 60_000);
  const startAt = (i: number) => play(h.id, true, i);

  return (
    <Animated.View style={[styles.screen, swipe.style]} {...swipe.panHandlers}>
      <GlassArea>
        {/* the station's colour at the top, fading into black */}
        <ColourWash glow={hslToRgb(toHsl(skin.accent) ?? { h: 280, s: 0.4, l: 0.5 })} />
        <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
          <IconButton icon="chevron-down" label="Close" onPress={close} />
          <View style={{ flex: 1 }} />
          <IconButton icon={h.kept ? 'bookmark' : 'bookmark-outline'} label={h.kept ? 'Unsave the show' : 'Save the show'} onPress={() => keepShow(h.id, !h.kept)} />
        </View>

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} onScroll={swipe.onScroll} scrollEventThrottle={32}>
          {/* the show: its cover, name, station, when, how far you got */}
          <View style={styles.hero}>
            {cover ? <Image source={{ uri: cover }} style={styles.cover} /> : <View style={styles.cover} />}
            <Text style={styles.name}>{showName(s)}</Text>
            <Text style={styles.meta}>
              <Text style={{ color: skin.accent }}>{s.station.name}</Text>
              {` · ${ago(h.savedAt)} · ${n} songs · ${minutes} min`}
            </Text>
            <View style={styles.track}>
              <View style={[styles.heard, { width: `${Math.round((open ? h.index / Math.max(1, n) : 1) * 100)}%`, backgroundColor: skin.accent }]} />
            </View>
            <Text style={styles.voices}>
              {voiced ? '🎙️ Voices saved: plays without using the daily voice quota.' : "🎙️ Script only: playing it voices the talks again (uses some of today's voice quota)."}
            </Text>
          </View>

          {/* the choice */}
          <View style={styles.buttons}>
            {open && <PillButton label={`Resume · song ${h.index + 1} of ${n}`} onPress={() => play(h.id, false)} full />}
            <PillButton label={open ? 'From the start' : 'Play it again'} onPress={() => play(h.id, true)} ghost={open} full />
          </View>

          {/* the set list: tap a song to start there, with the hosts' talk before it */}
          <Text style={styles.section}>Set list</Text>
          <Text style={styles.hint}>Tap a song to start the show there, with the hosts' talk before it.</Text>
          <View style={styles.list}>
            {s.slots.map((x, i) => {
              const said = x.talk.find((l) => plain(l.text));
              const here = open && i === h.index;
              return (
                <PressScale key={`${x.track.id}${i}`} scaleTo={0.98} style={[styles.row, i > 0 && styles.divider, here && styles.rowHere]} onPress={() => startAt(i)} accessibilityLabel={`Start at ${x.track.name}`}>
                  {x.track.image ? <Image source={{ uri: x.track.image }} style={styles.thumb} /> : <View style={styles.thumb} />}
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.song, open && i < h.index && { color: colors.muted }]} numberOfLines={1}>
                      {x.track.name}
                    </Text>
                    <Text style={styles.artist} numberOfLines={1}>
                      {here ? '⏸ You stopped here · ' : ''}
                      {x.track.artist}
                    </Text>
                    {said && (
                      <Text style={styles.talk} numberOfLines={1}>
                        <Ionicons name={x.label === 'News' ? 'newspaper-outline' : x.label === 'Commercial' ? 'megaphone-outline' : 'mic-outline'} size={12} color={skin.accent} />{' '}
                        {said.speaker}: {plain(said.text)}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.time}>{x.track.durationMs ? duration(x.track.durationMs) : ''}</Text>
                </PressScale>
              );
            })}
          </View>

          <PillButton
            label="Delete the show"
            ghost
            style={{ alignSelf: 'center', marginTop: 24 }}
            onPress={() =>
              showAlert('Delete this show?', h.kept ? 'Its script and voices are deleted from your phone.' : 'It goes from Recent shows.', [
                { text: 'Keep it', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => {
                    forgetShow(h.id);
                    close();
                  },
                },
              ])
            }
          />
        </ScrollView>
      </GlassArea>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: WASH_BASE },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  content: { paddingHorizontal: 20 },
  hero: { alignItems: 'center', gap: 8, marginTop: 6 },
  cover: { width: 168, height: 168, borderRadius: radius.md, backgroundColor: colors.raised, marginBottom: 10 },
  name: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, letterSpacing: -0.3, color: colors.text, textAlign: 'center' },
  meta: { fontFamily: fonts.sansRegular, fontSize: 14, color: colors.muted, textAlign: 'center' },
  track: { alignSelf: 'stretch', height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden', marginTop: 6 },
  heard: { height: 3 },
  voices: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: colors.muted, textAlign: 'center', marginTop: 4 },
  buttons: { gap: 10, marginTop: 20 },
  section: { fontFamily: fonts.sansBold, fontSize: 17, color: colors.text, marginTop: 28 },
  hint: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted, marginTop: 4, marginBottom: 12 },
  list: { ...frost, borderRadius: radius.md, paddingHorizontal: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.sm },
  rowHere: { backgroundColor: 'rgba(255,255,255,0.08)' },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.12)', borderRadius: 0 },
  thumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: colors.raised },
  song: { fontFamily: fonts.sans, fontSize: 15, color: colors.text },
  artist: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted },
  talk: { fontFamily: fonts.sansRegular, fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  time: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted },
});
