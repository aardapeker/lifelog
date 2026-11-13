import { router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '../../components/Icon';
import { colors } from '../theme';

/** Radar's top bar inside Lifelog (Lifelog hides the stack header): back, a title, a few icons. */
export function Header({ title, right }: { title: string; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 6 }]}>
      <HeaderIcon icon="arrow-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/insights'))} />
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

export function HeaderIcon({ icon, label, onPress }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={styles.icon}>
      <Ionicons name={icon} size={22} color={colors.paper} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 4, backgroundColor: colors.ink },
  title: { flex: 1, color: colors.paper, fontSize: 20, fontWeight: '700', marginLeft: 4 },
  right: { flexDirection: 'row', gap: 2 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
