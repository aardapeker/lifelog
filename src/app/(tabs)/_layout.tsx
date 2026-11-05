import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useEffect, useRef, type ComponentProps } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { haptic } from '../../components/motion';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../lib/theme';
import { useKeyboardVisible } from '../../lib/useKeyboardVisible';

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
 * Active tab = white circle with a dark icon, like the reference. The circle slides between tabs.
 */
const ITEM = 46;
const GAP = 16;
const PAD = 8;

function FloatingTabBar({ state, navigateToTab }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const keyboardOpen = useKeyboardVisible();
  const x = useRef(new Animated.Value(state.index * (ITEM + GAP))).current;
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.spring(x, { toValue: state.index * (ITEM + GAP), useNativeDriver: true, speed: 16, bounciness: 9 }).start();
    pop.setValue(0.6);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 14 }).start();
  }, [state.index, x, pop]);
  // the bar would float over the keyboard and the message box while typing
  if (keyboardOpen) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + 14 }]}>
      <View style={styles.pill}>
        <Animated.View style={[styles.indicator, { transform: [{ translateX: x }, { scale: pop }] }]} />
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const meta = ICONS[route.name] ?? { icon: 'ellipse-outline', label: route.name };
          const onPress = () => {
            if (focused) return;
            haptic.tap();
            navigateToTab(route.key);
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityLabel={meta.label}
              accessibilityState={{ selected: focused }}
              style={styles.item}
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
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg }, animation: 'shift' }}
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
    gap: GAP,
    padding: PAD,
    borderRadius: 31,
    backgroundColor: colors.raised,
    elevation: 8,
  },
  item: { width: ITEM, height: ITEM, borderRadius: ITEM / 2, alignItems: 'center', justifyContent: 'center' },
  indicator: {
    position: 'absolute',
    left: PAD,
    top: PAD,
    width: ITEM,
    height: ITEM,
    borderRadius: ITEM / 2,
    backgroundColor: colors.accent,
  },
});
