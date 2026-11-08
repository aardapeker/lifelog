import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius } from '../lib/theme';
import { FadeIn, PressScale } from './motion';
import { Glass } from './Glass';

type Action = { icon: keyof typeof Ionicons.glyphMap; label: string; hint: string; go: () => void };

const ACTIONS: Action[] = [
  { icon: 'create-outline', label: 'Write', hint: 'A new entry', go: () => router.push('/note/new') },
  { icon: 'mic-outline', label: 'Voice note', hint: 'Talk, it becomes text', go: () => router.push({ pathname: '/note/[id]', params: { id: 'new', voice: '1' } }) },
  { icon: 'image-outline', label: 'Photo', hint: 'An entry from a picture', go: () => router.push({ pathname: '/note/[id]', params: { id: 'new', photo: '1' } }) },
  { icon: 'flag-outline', label: 'Milestone', hint: 'A big moment', go: () => router.push('/milestone/new') },
  { icon: 'radio-outline', label: 'Radio', hint: 'Start a show', go: () => router.navigate('/radio') },
  { icon: 'chatbubble-ellipses-outline', label: 'Ask', hint: 'A new chat', go: () => router.navigate({ pathname: '/chat', params: { new: '1' } }) },
];

/** The ＋ in the middle of the tab bar: everything you can start, one tap away. */
export function CreateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => {}} style={{ paddingBottom: insets.bottom + 100, paddingHorizontal: 16 }}>
          {open && (
            <FadeIn from={40}>
              <Glass radius={28} style={styles.sheet}>
                <Text style={styles.title}>Start something</Text>
                <View style={styles.grid}>
                  {ACTIONS.map((a) => (
                    <PressScale
                      key={a.label}
                      style={styles.cell}
                      scaleTo={0.92}
                      accessibilityLabel={`${a.label}: ${a.hint}`}
                      onPress={() => {
                        onClose();
                        setTimeout(a.go, 120);
                      }}
                    >
                      <View style={styles.icon}>
                        <Ionicons name={a.icon} size={24} color={colors.text} />
                      </View>
                      <Text style={styles.label}>{a.label}</Text>
                      <Text style={styles.hint} numberOfLines={2}>
                        {a.hint}
                      </Text>
                    </PressScale>
                  ))}
                </View>
              </Glass>
            </FadeIn>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { padding: 20 },
  title: { fontFamily: fonts.serif, fontSize: 20, color: colors.text, marginBottom: 14, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 },
  cell: { width: '33.33%', alignItems: 'center', paddingHorizontal: 4 },
  icon: { width: 58, height: 58, borderRadius: radius.md, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: fonts.sans, fontSize: 14, color: colors.text, marginTop: 8 },
  hint: { fontFamily: fonts.sansRegular, fontSize: 11, color: colors.muted, textAlign: 'center', marginTop: 2 },
});
