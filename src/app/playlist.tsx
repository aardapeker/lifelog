import { router } from 'expo-router';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Glass, GlassArea } from '../components/Glass';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '../components/Icon';
import { PressScale } from '../components/motion';
import { ColourWash, duration, Heart, showName, WASH_BASE } from '../components/radioParts';
import { IconButton, PillButton } from '../components/ui';
import { useRadio } from '../lib/radioEngine';
import { colors, fonts, radius } from '../lib/theme';

/**
 * The show's playlist on its own page: covers, lengths, the one playing now. Tap a song to jump to it
 * (after the show: to play the show again from there); long-press for "don't play this song".
 */
export default function PlaylistScreen() {
  const insets = useSafeAreaInsets();
  const { show, index, phase, palette, current, paused, hearts, banned, toggleHeart, ban, jumpTo, replay, keepLive, liveKept, save, togglePause, skip } = useRadio();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/onair'));

  return (
    <View style={styles.screen}>
      <GlassArea>
      {/* the song's colour at the top, fading into black (like the light from the cover) */}
      <ColourWash glow={palette?.glow ?? null} />
      <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
        <IconButton icon="chevron-down" label="Close" onPress={close} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.barSmall}>{phase === 'done' ? "TONIGHT'S SET" : 'UP NEXT'}</Text>
          <Text style={styles.barTitle} numberOfLines={1}>
            {show ? showName(show) : ''}
          </Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      {show ? (
        <ScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 130 }]}>
          {phase === 'done' && <Text style={styles.hint}>Tap a song to play the show again from there.</Text>}
          {show.slots.map((s, i) => {
            const now = i === index && phase === 'onair';
            const gone = banned.has(s.track.id);
            return (
              <PressScale
                key={s.track.id}
                scaleTo={0.98}
                style={[styles.row, i > 0 && styles.divider, now && styles.rowNow]}
                onPress={() => {
                  if (phase === 'onair') {
                    if (i !== index) jumpTo(i, false);
                  } else replay(i);
                  close();
                }}
                onLongPress={() =>
                  !gone &&
                  Alert.alert(`Never play "${s.track.name}"?`, "It won't come back on Lifelog Radio. If it's playing now, we skip it.", [
                    { text: 'Cancel', style: 'cancel' },
                    { text: "Don't play it", style: 'destructive', onPress: () => ban(s.track) },
                  ])
                }
                accessibilityLabel={`Play ${s.track.name}`}
              >
                {s.track.image ? <Image source={{ uri: s.track.image }} style={styles.cover} /> : <View style={styles.cover} />}
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.name, i < index && phase === 'onair' && { color: colors.muted }, gone && styles.gone]}
                    numberOfLines={1}
                  >
                    {s.track.name}
                  </Text>
                  <Text style={styles.artist} numberOfLines={1}>
                    {now ? '▶ Now playing · ' : ''}
                    {s.track.artist}
                  </Text>
                </View>
                <Text style={styles.time}>{s.track.durationMs ? duration(s.track.durationMs) : ''}</Text>
                <Heart on={hearts.has(s.track.id)} onPress={() => toggleHeart(s.track)} size={20} />
              </PressScale>
            );
          })}
          <Text style={styles.small}>Long-press a song to never play it again.</Text>
          <View style={styles.after}>
            <PillButton label={liveKept ? 'Show saved ✓' : 'Save show'} onPress={keepLive} ghost={liveKept} />
            <PillButton label="Save to Spotify" onPress={save} ghost />
          </View>
        </ScrollView>
      ) : (
        <View style={styles.list}>
          <Ionicons name="radio-outline" size={28} color={colors.muted} />
          <Text style={styles.hint}>No show on air.</Text>
        </View>
      )}

      {/* the song on air, floating on frosted glass at the bottom */}
      {phase === 'onair' && current && (
        <Glass blur radius={24} style={[styles.mini, { bottom: insets.bottom + 16 }]} fill="rgba(24, 23, 23, 0.9)">
          <View style={styles.miniRow}>
            {current.track.image ? <Image source={{ uri: current.track.image }} style={styles.miniCover} /> : <View style={styles.miniCover} />}
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {current.track.name}
              </Text>
              <Text style={styles.artist} numberOfLines={1}>
                {current.track.artist}
              </Text>
            </View>
            <IconButton icon={paused ? 'play' : 'pause'} label={paused ? 'Play' : 'Pause'} onPress={togglePause} />
            <IconButton icon="play-skip-forward" label="Next song" onPress={skip} />
          </View>
        </Glass>
      )}
      </GlassArea>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: WASH_BASE },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10 },
  barSmall: { fontFamily: fonts.sans, fontSize: 11, letterSpacing: 1.2, color: colors.muted },
  barTitle: { fontFamily: fonts.sans, fontSize: 15, color: colors.text, marginTop: 2 },
  list: { paddingHorizontal: 16, paddingTop: 6 },
  hint: { fontFamily: fonts.sansRegular, fontSize: 14, color: colors.muted, marginBottom: 10, marginLeft: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 10, borderRadius: radius.md },
  rowNow: { backgroundColor: 'rgba(255,255,255,0.10)' },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.12)', borderRadius: 0 },
  mini: { position: 'absolute', left: 14, right: 14 },
  miniRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 },
  miniCover: { width: 50, height: 50, borderRadius: 12, backgroundColor: colors.raised },
  cover: { width: 58, height: 58, borderRadius: 14, backgroundColor: colors.raised },
  name: { fontFamily: fonts.sans, fontSize: 16, color: colors.text },
  gone: { color: colors.muted, textDecorationLine: 'line-through' },
  artist: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted, marginTop: 3 },
  time: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.muted, minWidth: 34, textAlign: 'right' },
  small: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted, marginTop: 14, marginLeft: 6 },
  after: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18, marginLeft: 6 },
});
