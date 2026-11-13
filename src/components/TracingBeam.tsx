import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors } from '../lib/theme';

/*
 * Tracing Beam (after Aceternity UI): the journal's days hang on a thin timeline at the left, each
 * with a dot (in the day's mood colour), and a beam of light grows down that line as you scroll
 * through your old notes, purple into cyan, reaching the bottom of the screen at the end of the list.
 */

/** Where the line sits, from the list's left edge. */
export const RAIL_X = 7;
const BEAM = ['rgba(174,72,255,0)', '#AE48FF', '#6344F5', '#18CCFC'] as const;

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
 * The beam itself, fixed on screen over the line (pass the list's left padding as `left`). It grows
 * with how far you've scrolled (`y`, the scroll offset) through the list's content.
 */
export function Beam({ y, left, top = 0 }: { y: Animated.Value; left: number; top?: number }) {
  const [screen, setScreen] = useState(0);
  return (
    <View style={[StyleSheet.absoluteFill, { top }]} pointerEvents="none" onLayout={(e) => setScreen(e.nativeEvent.layout.height)}>
      {screen > 0 && (
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            left: left + RAIL_X - 0.5,
            width: 2.5,
            height: screen,
            transformOrigin: 'top',
            // a little scrolling already lights the top; deep in your past, it reaches the bottom
            transform: [{ scaleY: y.interpolate({ inputRange: [0, 80, screen * 6], outputRange: [0.001, 0.12, 1], extrapolate: 'clamp' }) }],
          }}
        >
          <LinearGradient colors={BEAM} locations={[0, 0.15, 0.7, 1]} style={[StyleSheet.absoluteFill, styles.beam]} />
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
  beam: { borderRadius: 2, boxShadow: '0 0 8px rgba(174,72,255,0.6)' },
});
