import Ionicons from './Icon';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
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
      onPress={props.onPress}
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

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: fonts.display, letterSpacing: -0.4, fontSize: 24, color: colors.text },
});
