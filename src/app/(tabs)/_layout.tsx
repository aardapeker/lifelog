import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CreateSheet } from '../../components/CreateSheet';
import { Glass } from '../../components/Glass';
import { MiniPlayer } from '../../components/MiniPlayer';
import { colors } from '../../lib/theme';
import { useKeyboardVisible } from '../../lib/useKeyboardVisible';

type IconName = ComponentProps<typeof Ionicons>['name'];
type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/** The five slots, left to right. ＋ isn't a page: it opens the Start something sheet. */
const SLOTS: ({ route: string; icon: IconName; label: string } | 'create')[] = [
  { route: 'index', icon: 'book-outline', label: 'Journal' },
  { route: 'insights', icon: 'leaf-outline', label: 'Life' },
  'create',
  { route: 'chat', icon: 'chatbubble-ellipses-outline', label: 'Friend' },
  { route: 'radio', icon: 'radio-outline', label: 'Radio' },
];

const ITEM = 46;
const PAD = 8;

/**
 * A glass bar from side to side, five slots. The active one sits in a white circle that slides
 * (and pops) between tabs; the ＋ in the middle is always a circle of its own.
 * Drawn by hand: the library's bar ignored left/width on Android.
 */
function FloatingTabBar({ state, navigateToTab }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const keyboardOpen = useKeyboardVisible();
  const [width, setWidth] = useState(0);
  const [creating, setCreating] = useState(false);
  const current = state.routes[state.index]?.name;
  const slot = Math.max(0, SLOTS.findIndex((s) => s !== 'create' && s.route === current));
  const cell = width ? (width - PAD * 2) / SLOTS.length : 0;
  const target = PAD + slot * cell + (cell - ITEM) / 2;
  const x = useRef(new Animated.Value(target)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const placed = useRef(false);
  useEffect(() => {
    if (!width) return;
    if (!placed.current) {
      placed.current = true; // first layout: just put it there
      x.setValue(target);
      return;
    }
    Animated.spring(x, { toValue: target, useNativeDriver: true, speed: 16, bounciness: 9 }).start();
    pop.setValue(0.6);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 14 }).start();
  }, [target, width, x, pop]);
  // the bar would float over the keyboard and the message box while typing
  if (keyboardOpen) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + 14 }]}>
      {/* the radio, docked above the tabs while a show is on (not on Friend: it would cover the message box; not on Radio itself) */}
      {current !== 'chat' && current !== 'radio' && (
        <View style={styles.mini}>
          <MiniPlayer />
        </View>
      )}
      <Glass radius={31} style={styles.bar}>
        <View style={styles.row} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {width > 0 && <Animated.View style={[styles.indicator, { transform: [{ translateX: x }, { scale: pop }] }]} />}
          {SLOTS.map((s) => {
            if (s === 'create') {
              return (
                <View key="create" style={styles.cell}>
                  <Pressable onPress={() => setCreating(true)} accessibilityLabel="Start something" style={styles.create}>
                    <Ionicons name="add" size={26} color={colors.text} />
                  </Pressable>
                </View>
              );
            }
            const route = state.routes.find((r) => r.name === s.route);
            const focused = current === s.route;
            return (
              <View key={s.route} style={styles.cell}>
                <Pressable
                  onPress={() => route && !focused && navigateToTab(route.key)}
                  accessibilityRole="tab"
                  accessibilityLabel={s.label}
                  accessibilityState={{ selected: focused }}
                  style={styles.item}
                >
                  <Ionicons name={s.icon} size={21} color={focused ? colors.accentText : colors.text} />
                </Pressable>
              </View>
            );
          })}
        </View>
      </Glass>
      <CreateSheet open={creating} onClose={() => setCreating(false)} />
    </View>
  );
}

export default function TabsLayout() {
  return (
    // The tab bar used to blur the screens behind it; on Android that blur crashed the app when
    // the bar came back (after the editor, after the keyboard). It keeps the glass look without it.
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg }, animation: 'shift' }}
    >
      <Tabs.Screen name="index" options={{ title: 'Journal' }} />
      <Tabs.Screen name="insights" options={{ title: 'Life' }} />
      <Tabs.Screen name="chat" options={{ title: 'Friend' }} />
      <Tabs.Screen name="radio" options={{ title: 'Radio' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16 },
  mini: { alignSelf: 'stretch' },
  bar: { elevation: 10 },
  row: { flexDirection: 'row', padding: PAD },
  cell: { flex: 1, alignItems: 'center' },
  item: { width: ITEM, height: ITEM, borderRadius: ITEM / 2, alignItems: 'center', justifyContent: 'center' },
  create: {
    width: ITEM,
    height: ITEM,
    borderRadius: ITEM / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  indicator: {
    position: 'absolute',
    left: 0,
    top: PAD,
    width: ITEM,
    height: ITEM,
    borderRadius: ITEM / 2,
    backgroundColor: colors.accent,
  },
});
