import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { close, useDialog, type DialogButton } from '../lib/dialog';
import { colors, fonts, radius } from '../lib/theme';
import { FadeIn, haptic } from './motion';

/** Draws lib/dialog's popups. Rendered once, at the app's root. */
export function DialogHost() {
  const d = useDialog();
  if (!d) return null;
  // the main action on top, Cancel always last
  const buttons = [...d.buttons.filter((b) => b.style !== 'cancel'), ...d.buttons.filter((b) => b.style === 'cancel')];
  const press = (b: DialogButton) => {
    haptic.tick();
    close(d, b);
  };
  const side = buttons.length === 2 && buttons.every((b) => b.text.length <= 12); // two short ones side by side
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => close(d)}>
      <Pressable style={styles.backdrop} onPress={() => close(d)} accessibilityLabel="Close">
        <FadeIn key={d.id} style={styles.wrap}>
          {/* taps on the card itself don't close it */}
          <Pressable style={styles.card} onPress={() => {}} accessibilityRole="alert">
            <Text style={styles.title}>{d.title}</Text>
            {!!d.message && (
              <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 2 }}>
                <Text style={styles.message} selectable>
                  {d.message}
                </Text>
              </ScrollView>
            )}
            <View style={[styles.buttons, side && styles.buttonsSide]}>
              {(side ? [...buttons].reverse() : buttons).map((b, i) => {
                const main = !side ? i === 0 && b.style !== 'cancel' : b.style !== 'cancel';
                return (
                  <Pressable
                    key={b.text}
                    onPress={() => press(b)}
                    style={({ pressed }) => [
                      styles.button,
                      side && { flex: 1 },
                      b.style === 'destructive' ? styles.danger : main ? styles.main : styles.plain,
                      pressed && { opacity: 0.7 },
                    ]}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.buttonText, b.style === 'destructive' && { color: colors.accentText }, main && b.style !== 'destructive' && { color: colors.accentText }]}>
                      {b.text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </FadeIn>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  wrap: { width: '100%' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', maxHeight: '86%' },
  title: { fontFamily: fonts.display, fontSize: 21, lineHeight: 27, color: colors.text },
  scroll: { marginTop: 10, flexGrow: 0 },
  message: { fontFamily: fonts.sansRegular, fontSize: 15, lineHeight: 22, color: colors.muted },
  buttons: { gap: 10, marginTop: 20 },
  buttonsSide: { flexDirection: 'row' },
  button: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: radius.pill, alignItems: 'center' },
  main: { backgroundColor: colors.accent },
  plain: { backgroundColor: colors.raised },
  danger: { backgroundColor: colors.danger },
  buttonText: { fontFamily: fonts.sans, fontSize: 15, color: colors.text, textAlign: 'center' },
});
