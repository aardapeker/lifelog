// Ported from the radar repo (mobile/src/components): keep the two in step.
import Ionicons from '../../components/Icon'
import type { ComponentProps } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'

import { colors } from '../theme'

interface Props {
  label: string
  onPress: () => void
  icon?: ComponentProps<typeof Ionicons>['name']
  /** solid = main action, on = toggled (Saved), plain = outlined */
  variant?: 'solid' | 'on' | 'plain'
  disabled?: boolean
}

/** The rounded button used everywhere: actions, topic chips, toggles. */
export function Pill({ label, onPress, icon, variant = 'plain', disabled }: Props) {
  const fg = variant === 'solid' ? colors.ink : variant === 'on' ? colors.accent : colors.paper
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: variant === 'on' }}
      style={({ pressed }) => [
        styles.pill,
        variant === 'solid' && styles.solid,
        variant === 'on' && styles.on,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      {icon && <Ionicons name={icon} size={16} color={fg} />}
      <Text style={[styles.text, { color: fg }]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  pill: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  solid: { backgroundColor: colors.paper, borderColor: colors.paper },
  on: { borderColor: colors.accent },
  text: { fontWeight: '600', fontSize: 15 },
})
