// Ported from the radar repo (mobile/src/components/Pill.tsx), restyled as Lifelog's buttons and chips.
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import Ionicons from '../../components/Icon';
import { PressScale } from '../../components/motion';
import { ShimmerSweep } from '../../components/ui';
import { colors, fonts, radius } from '../../lib/theme';

interface Props {
  label: string;
  onPress: () => void;
  icon?: ComponentProps<typeof Ionicons>['name'];
  /** solid = main action (Lifelog's glass shimmer button), on = selected chip (white), plain = chip */
  variant?: 'solid' | 'on' | 'plain';
  disabled?: boolean;
}

/** The rounded button used everywhere in Radar: actions, topic chips, toggles. */
export function Pill({ label, onPress, icon, variant = 'plain', disabled }: Props) {
  const [w, setW] = useState(0);
  const fg = variant === 'on' ? colors.accentText : colors.text;
  return (
    <PressScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: variant === 'on' }}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[styles.pill, variant === 'solid' ? styles.solid : variant === 'on' ? styles.on : styles.plain, disabled && { opacity: 0.5 }]}
    >
      {variant === 'solid' && <ShimmerSweep w={w} strength={0.2} />}
      {icon && <Ionicons name={icon} size={16} color={fg} />}
      <Text style={[styles.text, { color: fg }, variant === 'solid' && styles.solidText]}>{label}</Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  pill: { minHeight: 40, paddingHorizontal: 16, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 8 },
  plain: { backgroundColor: colors.raised }, // Lifelog's Chip
  on: { backgroundColor: colors.accent }, // Lifelog's active Chip
  solid: { backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', minHeight: 46, paddingHorizontal: 22 }, // Lifelog's PillButton
  text: { fontFamily: fonts.sansRegular, fontSize: 14 },
  solidText: { fontFamily: fonts.sans, fontSize: 15 },
});
