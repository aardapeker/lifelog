import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors } from '../lib/theme';

/*
 * Tracing Beam (after Aceternity UI): the journal's days hang on a thin timeline at the left, each
 * with a dot (in the day's mood colour), and a beam of light runs down that line as you scroll
 * through your old notes: a cyan head with a fading purple tail, reaching the bottom at the end.
 */

/** Where the line sits, from the list's left edge. */
export const RAIL_X = 7;
// Aceternity's stops, top to bottom: nothing, then indigo, then the cyan head (colour only near the end)
const BEAM = ['rgba(174,72,255,0)', '#6344F5', '#18CCFC'] as const;

/** One stretch of the timeline: the line, a dot at the top, and the content beside it. */
export function TimelineItem({ dot, children, last }: { dot?: string | null; children: ReactNode; last?: boolean }) {
  return (
    <View style={styles.item}>
      <View style={[styles.rail, last && { bottom: 0 }]} pointerEvents="none" />
      <View style={styles.ring} pointerEvents="none">
        <View style={[styles.core, { backgroundColor: dot ?? '#10B981' }]} />
      </View>
      {children}
    </View>
  );
}

/**
 * The beam itself, fixed on screen over the line (pass the list's left padding as `left`). Like
 * Aceternity's: a comet with a bright cyan head and a purple tail fading to nothing, following the
 * scroll on a soft spring (their stiffness 500 / damping 90, so it trails your finger by about half
 * a second), its head travelling down the screen as you go deeper into your past.
 *  - `firstDot`: where the first day's dot is on screen before scrolling (the beam starts there and
 *    scrolls up with it, so it never crosses the header)
 *  - `top` / `bottom`: the space taken by the header bar and the tab bar, which it stays between
 *  - `end`: how far the list can scroll
 */
export function Beam({ y, left, firstDot, top, bottom, end }: { y: Animated.Value; left: number; firstDot: number; top: number; bottom: number; end: number }) {
  const [screen, setScreen] = useState(0);
  const lag = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const id = y.addListener(({ value }) =>
      Animated.spring(lag, { toValue: value, stiffness: 500, damping: 90, mass: 1, useNativeDriver: true }).start(),
    );
    return () => y.removeListener(id);
  }, [y, lag]);

  const room = Math.max(1, screen - top - bottom); // the most the beam can light
  const lift = Math.max(1, firstDot - top); // scrolling this far brings the first dot up to the header
  const reach = Math.max(lift + 1, end * 0.8); // like theirs, the head reaches the bottom a bit before the end
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={(e) => setScreen(e.nativeEvent.layout.height)}>
      {screen > 0 && (
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            left: left + RAIL_X - 0.25,
            width: 2,
            height: room,
            // the start rides up with the first dot, then stays under the header
            transform: [{ translateY: y.interpolate({ inputRange: [0, lift], outputRange: [firstDot, top], extrapolate: 'clamp' }) }],
          }}
        >
          <Animated.View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              transformOrigin: 'top',
              transform: [{ scaleY: lag.interpolate({ inputRange: [0, 24, reach], outputRange: [0.001, 0.08, 1], extrapolate: 'clamp' }) }],
            }}
          >
            <LinearGradient colors={BEAM} locations={[0, 0.675, 1]} style={[StyleSheet.absoluteFill, styles.beam]} />
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  item: { paddingLeft: 26 },
  rail: { position: 'absolute', left: RAIL_X, top: 14, bottom: -24, width: 1.5, backgroundColor: 'rgba(255,255,255,0.10)' },
  ring: {
    position: 'absolute',
    left: RAIL_X - 6.25,
    top: 6,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
  },
  core: { width: 6, height: 6, borderRadius: 3 },
  beam: { borderRadius: 1, boxShadow: '0 0 6px rgba(24,204,252,0.45)' },
});
