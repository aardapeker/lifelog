import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const ICONS: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'book-outline', label: 'Journal' },
  chat: { icon: 'chatbubble-outline', label: 'Chat' },
  insights: { icon: 'sparkles-outline', label: 'Insights' },
  settings: { icon: 'person-outline', label: 'Settings' },
};

/**
 * Our own floating pill, centered with flexbox. The library's tab bar ignored
 * left/width on Android and stuck to the left edge, so we draw it ourselves.
 * Active tab = white circle with a dark icon, like the reference.
 */
function FloatingTabBar({ state, navigateToTab }: TabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + 14 }]}>
      <View style={styles.pill}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const meta = ICONS[route.name] ?? { icon: 'ellipse-outline', label: route.name };
          const onPress = () => {
            if (!focused) navigateToTab(route.key);
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityLabel={meta.label}
              accessibilityState={{ selected: focused }}
              style={[styles.item, focused && styles.itemActive]}
            >
              <Ionicons name={meta.icon} size={21} color={focused ? colors.accentText : colors.text} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
    >
      <Tabs.Screen name="index" options={{ title: 'Journal' }} />
      <Tabs.Screen name="chat" options={{ title: 'Chat' }} />
      <Tabs.Screen name="insights" options={{ title: 'Insights' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    gap: 16,
    padding: 8,
    borderRadius: 31,
    backgroundColor: colors.raised,
    elevation: 8,
  },
  item: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  itemActive: { backgroundColor: colors.accent },
});
