import Ionicons from './Icon';
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts, radius } from '../lib/theme';
import { Glass } from './Glass';
import { PressScale } from './motion';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * A small "!" next to a setting: tap it and a card explains how the feature works.
 * `points` are short lines shown as a list under the title.
 */
export function InfoButton(props: { title: string; points: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`How ${props.title} works`}>
        <Ionicons name="alert-circle-outline" size={18} color={colors.muted} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.infoBackdrop} onPress={() => setOpen(false)}>
          {/* taps on the card itself don't close it */}
          <Pressable onPress={() => {}} style={styles.infoCardWrap}>
            <Glass radius={28} fill="rgba(39,38,38,0.97)" style={styles.infoCard}>
              <View style={styles.infoHead}>
                <Ionicons name="alert-circle-outline" size={22} color={colors.text} />
                <Text style={styles.infoTitle}>{props.title}</Text>
              </View>
              {props.points.map((t, i) => (
                <View key={i} style={styles.infoPoint}>
                  <Text style={styles.infoDot}>•</Text>
                  <Text style={styles.infoText}>{t}</Text>
                </View>
              ))}
              <PillButton label="Got it" onPress={() => setOpen(false)} full style={{ marginTop: 18 }} />
            </Glass>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

/** Round icon button, like the back/bell buttons in the reference. */
export function IconButton(props: {
  icon: IconName;
  onPress: () => void;
  label: string;
  variant?: 'raised' | 'light';
  size?: number;
}) {
  const size = props.size ?? 44;
  const light = props.variant === 'light';
  return (
    <PressScale
      onPress={props.onPress}
      accessibilityLabel={props.label}
      hitSlop={6}
      scaleTo={0.88}
      style={{ width: size, height: size }}
    >
      {light ? (
        <View style={[styles.round, { borderRadius: size / 2, backgroundColor: colors.accent }]}>
          <Ionicons name={props.icon} size={size * 0.45} color={colors.accentText} />
        </View>
      ) : (
        <Glass radius={size / 2} style={styles.round}>
          <Ionicons name={props.icon} size={size * 0.45} color={colors.text} />
        </Glass>
      )}
    </PressScale>
  );
}

/** White pill (primary) or outlined pill (secondary). */
/**
 * The app's buttons, Aceternity-style. The main one (default) is "Border Magic": a dark pill whose thin
 * border has a light running around it. `ghost` (the secondary one) is "Shimmer": a dark pill with a
 * soft light sweeping across it now and then. Both animate natively, so they cost the app nothing.
 */
export function PillButton(props: {
  label: string;
  onPress: () => void;
  ghost?: boolean;
  full?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  return (
    <PressScale
      onPress={props.onPress}
      disabled={props.disabled}
      onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={[styles.pill, props.ghost ? styles.pillGhost : styles.pillMagic, props.full && styles.pillFull, props.disabled && { opacity: 0.5 }, props.style]}
    >
      {props.ghost ? <Shimmer w={box.w} /> : <RunningBorder w={box.w} h={box.h} />}
      <Text style={[styles.pillText, props.ghost && styles.pillTextGhost]}>{props.label}</Text>
    </PressScale>
  );
}

/** Border Magic: a big gradient turning behind the button, seen only through its 1.5px edge. */
function RunningBorder({ w, h }: { w: number; h: number }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 3200, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  if (!w) return null;
  const side = Math.hypot(w, h) + 4; // covers every corner while it turns
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <View style={[StyleSheet.absoluteFill, { borderRadius: radius.pill, overflow: 'hidden' }]} pointerEvents="none">
      <Animated.View style={{ position: 'absolute', width: side, height: side, left: (w - side) / 2, top: (h - side) / 2, transform: [{ rotate }] }}>
        <LinearGradient colors={['#E2CBFF', '#393BB2', '#1A1A3A', '#393BB2', '#E2CBFF']} style={StyleSheet.absoluteFill} />
      </Animated.View>
      {/* the button's face, leaving only the edge lit */}
      <View style={[StyleSheet.absoluteFill, styles.magicFace]} />
    </View>
  );
}

/** Shimmer: a soft band of light crossing the button every few seconds. */
function Shimmer({ w }: { w: number }) {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(x, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(1400),
        Animated.timing(x, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [x]);
  if (!w) return null;
  const band = Math.max(60, w * 0.5);
  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [-band, w] });
  return (
    <View style={[StyleSheet.absoluteFill, { borderRadius: radius.pill, overflow: 'hidden' }]} pointerEvents="none">
      <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, width: band, transform: [{ translateX }, { skewX: '-20deg' }] }}>
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.14)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

export function Chip(props: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <PressScale
      onPress={props.onPress}
      style={[styles.chip, props.active && styles.chipActive]}
    >
      <Text style={[styles.chipText, props.active && styles.chipTextActive]}>{props.label}</Text>
    </PressScale>
  );
}

/** Small serif label over a value, like "Trip Duration / 10 days". */
export function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue}>{value}</Text>
    </View>
  );
}

export type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'ok'; msg: string } | { kind: 'err'; msg: string };

export function StatusLine({ status }: { status: Status }) {
  if (status.kind === 'idle') return null;
  if (status.kind === 'busy') return <ActivityIndicator color={colors.text} style={styles.status} />;
  return (
    <Text style={[styles.status, { color: status.kind === 'ok' ? colors.ok : colors.danger }]}>{status.msg}</Text>
  );
}

export function SectionTitle({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  infoBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  infoCardWrap: { alignSelf: 'stretch' },
  infoCard: { padding: 22 },
  infoHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  infoTitle: { flex: 1, fontFamily: fonts.display, fontSize: 19, color: colors.text },
  infoPoint: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  infoDot: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, color: colors.muted },
  infoText: { flex: 1, fontFamily: fonts.serif, fontSize: 14, lineHeight: 21, color: colors.text },
  round: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pill: {
    borderRadius: radius.pill,
    paddingHorizontal: 22,
    paddingVertical: 12,
    alignItems: 'center',
    overflow: 'hidden',
  },
  pillMagic: { backgroundColor: '#0B0B1E' },
  magicFace: { margin: 1.5, borderRadius: radius.pill, backgroundColor: '#0B0B1E' },
  pillGhost: { backgroundColor: '#05070C', borderWidth: 1, borderColor: '#1E293B' },
  pillFull: { alignSelf: 'stretch', paddingVertical: 17 },
  pillText: { fontFamily: fonts.sans, fontSize: 15, color: '#FFFFFF' },
  pillTextGhost: { color: '#CBD5E1' },

  chip: {
    backgroundColor: colors.raised,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  chipActive: { backgroundColor: colors.accent },
  chipText: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.text },
  chipTextActive: { fontFamily: fonts.sans, color: colors.accentText },

  tile: { backgroundColor: colors.raised, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 10 },
  tileLabel: { fontFamily: fonts.serif, fontSize: 14, color: colors.muted, marginBottom: 4 },
  tileValue: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.text },

  status: { marginTop: 10, fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 19, alignSelf: 'flex-start' },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: fonts.display, letterSpacing: -0.4, fontSize: 24, color: colors.text },
});
