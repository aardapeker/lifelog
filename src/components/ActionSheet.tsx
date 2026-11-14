import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius } from '../lib/theme';
import Ionicons from './Icon';
import { haptic } from './motion';

/*
 * A menu that slides up from the bottom. Instead of Alert.alert for menus: Android's alert shows at
 * most 3 buttons (a 4th, often Cancel, silently disappears) and can't be dismissed by tapping
 * outside, which trapped you in the player's ⋯ menu. This one always closes: tap outside, Cancel,
 * or the back button.
 */

export type SheetAction = {
  label: string;
  icon?: string;
  onPress: () => void;
  destructive?: boolean;
};

export function ActionSheet({ visible, title, actions, onClose }: { visible: boolean; title?: string; actions: SheetAction[]; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const pick = (a: SheetAction) => {
    haptic.tick();
    onClose();
    a.onPress();
  };
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close the menu">
        {/* taps on the sheet itself don't close it */}
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]} onPress={() => {}}>
          <View style={styles.handle} />
          {!!title && (
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
          )}
          {actions.map((a) => (
            <Pressable key={a.label} onPress={() => pick(a)} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} accessibilityRole="button">
              {!!a.icon && <Ionicons name={a.icon as never} size={21} color={a.destructive ? colors.danger : colors.text} />}
              <Text style={[styles.label, a.destructive && { color: colors.danger }]}>{a.label}</Text>
            </Pressable>
          ))}
          <Pressable onPress={onClose} style={({ pressed }) => [styles.cancel, pressed && styles.rowPressed]} accessibilityRole="button">
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: 12, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 10 },
  title: { fontFamily: fonts.sans, fontSize: 14, color: colors.muted, textAlign: 'center', paddingHorizontal: 12, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 15, borderRadius: radius.sm },
  rowPressed: { backgroundColor: colors.raised },
  label: { fontFamily: fonts.sans, fontSize: 16, color: colors.text },
  cancel: { marginTop: 6, paddingVertical: 15, borderRadius: radius.sm, alignItems: 'center', backgroundColor: colors.raised },
  cancelText: { fontFamily: fonts.sans, fontSize: 16, color: colors.text },
});
