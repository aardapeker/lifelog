import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useRef } from 'react';
import { Image, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRadio } from '../lib/radioEngine';
import { colors, fonts, radius, TAB_BAR_SPACE } from '../lib/theme';
import { FadeIn, PressScale } from './motion';
import { Glass } from './Glass';

const MINI_HEIGHT = 70;

/** Bottom padding for a tab screen's list: room for the tab bar, plus the docked radio when it's showing. */
export function useBottomSpace(): number {
  const { phase, miniCollapsed } = useRadio();
  return TAB_BAR_SPACE + (phase === 'onair' && !miniCollapsed ? MINI_HEIGHT : 0);
}

/**
 * The show, docked above the tab bar while it's on air (like a music app's mini player):
 * cover, song, who's talking, ⏮ ⏯ ⏭, and a thin progress line. Tap it to open the full Radio,
 * swipe it down to fold it into a small round cover; tap that to bring it back.
 */
export function MiniPlayer() {
  const { phase, show, current, index, paused, speaking, progress, togglePause, skip, previous, miniCollapsed, setMiniCollapsed } =
    useRadio();
  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 12 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_, g) => {
        if (g.dy > 25) setMiniCollapsed(true);
      },
    }),
  ).current;
  if (phase !== 'onair' || !show || !current) return null;

  if (miniCollapsed) {
    return (
      <View style={styles.bubbleRow} pointerEvents="box-none">
        <PressScale onPress={() => setMiniCollapsed(false)} scaleTo={0.9} accessibilityLabel="Show the radio player">
          <Glass radius={26} style={styles.bubble}>
            {current.track.image ? (
              <Image source={{ uri: current.track.image }} style={styles.bubbleCover} />
            ) : (
              <Text>{show.station.emoji}</Text>
            )}
            <Ionicons name={paused ? 'pause' : 'musical-notes'} size={14} color={colors.text} style={styles.bubbleIcon} />
          </Glass>
        </PressScale>
      </View>
    );
  }

  const who = speaking
    ? `${show.station.sidekick ? `${show.station.host.name} & ${show.station.sidekick.name}` : show.station.host.name} on the mic`
    : current.track.artist;

  return (
    <FadeIn from={20}>
      <View {...swipe.panHandlers}>
      <Glass radius={radius.md} style={styles.bar}>
        <Pressable style={styles.main} onPress={() => router.navigate('/radio')} accessibilityLabel="Open the radio">
          {current.track.image ? (
            <Image source={{ uri: current.track.image }} style={styles.cover} />
          ) : (
            <View style={[styles.cover, styles.coverEmpty]}>
              <Text>{show.station.emoji}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {current.track.name}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {show.station.emoji} {who} · {index + 1}/{show.slots.length}
            </Text>
          </View>
        </Pressable>
        <View style={styles.buttons}>
          <Btn icon="play-skip-back" label="Previous" onPress={previous} />
          <Btn icon={paused ? 'play' : 'pause'} label={paused ? 'Play' : 'Pause'} onPress={togglePause} big />
          <Btn icon="play-skip-forward" label="Next" onPress={skip} />
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(Math.min(1, progress) * 100)}%` }]} />
        </View>
      </Glass>
      </View>
    </FadeIn>
  );
}

function Btn({ icon, label, onPress, big }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; big?: boolean }) {
  return (
    <PressScale onPress={onPress} scaleTo={0.85} hitSlop={8} accessibilityLabel={label} style={styles.btn}>
      <Ionicons name={icon} size={big ? 26 : 20} color={colors.text} />
    </PressScale>
  );
}

const styles = StyleSheet.create({
  bubbleRow: { alignItems: 'flex-end', marginBottom: 10 },
  bubble: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  bubbleCover: { width: 44, height: 44, borderRadius: 22 },
  bubbleIcon: { position: 'absolute', right: 4, bottom: 4 },
  bar: { flexDirection: 'row', alignItems: 'center', paddingLeft: 8, paddingRight: 6, paddingVertical: 8, marginBottom: 10 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  cover: { width: 42, height: 42, borderRadius: 10 },
  coverEmpty: { backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: fonts.sans, fontSize: 14, color: colors.text },
  sub: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted, marginTop: 2 },
  buttons: { flexDirection: 'row', alignItems: 'center' },
  btn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  track: { position: 'absolute', left: 14, right: 14, bottom: 3, height: 2, borderRadius: 1, backgroundColor: colors.line },
  fill: { height: 2, borderRadius: 1, backgroundColor: colors.text },
});
