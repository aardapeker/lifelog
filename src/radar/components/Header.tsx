import { router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type Ionicons from '../../components/Icon';
import { IconButton } from '../../components/ui';
import { colors, fonts } from '../theme';

/** Radar's top bar, the same as Lifelog's pages: round glass buttons and a centred title. */
export function Header({ title, right }: { title: string; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
      <HeaderIcon icon="arrow-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/insights'))} />
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.right}>{right ?? <View style={{ width: 44 }} />}</View>
    </View>
  );
}

export function HeaderIcon({ icon, label, onPress }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  return <IconButton icon={icon} label={label} onPress={onPress} />;
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: colors.ink },
  title: { flex: 1, color: colors.paper, fontSize: 16, fontFamily: fonts.sans, textAlign: 'center' },
  right: { flexDirection: 'row', gap: 8, minWidth: 44, justifyContent: 'flex-end' },
});
