import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, fonts, radius } from '../lib/theme';
import { haptic, PressScale } from './motion';

type IconName = ComponentProps<typeof Ionicons>['name'];

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
      onPress={() => {
        haptic.tap();
        props.onPress();
      }}
      accessibilityLabel={props.label}
      hitSlop={6}
      scaleTo={0.88}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: light ? colors.accent : colors.raised,
      }}
    >
      <Ionicons name={props.icon} size={size * 0.45} color={light ? colors.accentText : colors.text} />
    </PressScale>
  );
}

/** White pill (primary) or outlined pill (secondary). */
export function PillButton(props: {
  label: string;
  onPress: () => void;
  ghost?: boolean;
  full?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressScale
      onPress={() => {
        haptic.press();
        props.onPress();
      }}
      disabled={props.disabled}
      style={[
        styles.pill,
        props.ghost && styles.pillGhost,
        props.full && styles.pillFull,
        props.disabled && { opacity: 0.6 },
        props.style,
      ]}
    >
      <Text style={[styles.pillText, props.ghost && { color: colors.text }]}>{props.label}</Text>
    </PressScale>
  );
}

export function Chip(props: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <PressScale
      onPress={() => {
        haptic.tap();
        props.onPress?.();
      }}
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
  pill: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 22,
    paddingVertical: 12,
    alignItems: 'center',
  },
  pillGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.line },
  pillFull: { alignSelf: 'stretch', paddingVertical: 17 },
  pillText: { fontFamily: fonts.sans, fontSize: 15, color: colors.accentText },

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

  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: fonts.serif, fontSize: 24, color: colors.text },
});
