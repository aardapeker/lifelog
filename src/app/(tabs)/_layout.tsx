import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '../../components/Icon';
import { router, Tabs, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FrostedGlass, Glass, useActiveBlurSource } from '../../components/Glass';
import { MiniPlayer } from '../../components/MiniPlayer';
import { ShowWash } from '../../components/radioParts';
import { tabTapped } from '../../lib/perf';
import { ShimmerSweep } from '../../components/ui';
import { colors, fonts } from '../../lib/theme';
import { useKeyboardVisible } from '../../lib/useKeyboardVisible';

type IconName = ComponentProps<typeof Ionicons>['name'];
type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];
type Tab = { route: string; icon: IconName; label: string };

/** The five tabs, left to right. The ＋ in the middle is Write: new entries and editing. */
const SLOTS: Tab[] = [
  { route: 'index', icon: 'book-outline', label: 'Journal' },
  { route: 'insights', icon: 'leaf-outline', label: 'Life' },
  { route: 'write', icon: 'add', label: 'Write' },
  { route: 'chat', icon: 'chatbubble-ellipses-outline', label: 'Friend' },
  { route: 'radio', icon: 'radio-outline', label: 'Radio' },
];

const ITEM = 46; // a circle: an icon-only tab, the ＋, the ends of the pill
const PAD = 8;
const ICON = 21;
const GAP = 7; // icon ↔ name inside the pill
const SIDE = 16; // space at the ends of the pill
const SPRING = { useNativeDriver: true, speed: 16, bounciness: 8 } as const;
// the open tab is a glass lens, a little taller and wider than the slot, with its icon magnified
const LENS = ITEM + 12;
const LENS_TOP = (ITEM + PAD * 2 - LENS) / 2;
const LENS_GROW = 8; // wider than its slot by this much
const MAGNIFY = 1.18;

/** Where every slot sits when `active` is the open tab: the open one is a pill (icon + name), the rest share the rest. */
function slotLayout(width: number, active: number, labelW: number[]) {
  const inner = width - PAD * 2;
  const pill = Math.max(ITEM, SIDE + ICON + GAP + labelW[active] + SIDE); // at least a circle
  const rest = (inner - pill) / (SLOTS.length - 1);
  let x = PAD;
  return SLOTS.map((_, i) => {
    const w = i === active ? pill : rest;
    const slot = { left: x, width: w, center: x + w / 2 };
    x += w;
    return slot;
  });
}

/**
 * A glass bar from side to side. The open tab is a white pill with its name; tapping another one
 * shrinks the old pill back to an icon while the new one stretches open and the others slide aside.
 * The open tab is a see-through glass lens that magnifies its icon. Its moves are native (positions,
 * scales, fades); only its width springs on the JS side, since one piece of see-through glass can't
 * be stitched from parts without the joins showing.
 * Drawn by hand: the library's bar ignored left/width on Android.
 */
/** The tab bar's glass: real frosted blur of the open tab when it has a BlurSource, else tinted glass. */
function BarGlass({ children }: { children: ReactNode }) {
  const source = useActiveBlurSource();
  return source ? (
    <FrostedGlass target={source} radius={31} style={styles.bar}>
      {children}
    </FrostedGlass>
  ) : (
    <Glass radius={31} style={styles.bar}>
      {children}
    </Glass>
  );
}

const LENS_FILL = 'rgba(255,255,255,0.16)';
const LENS_RIM = 'rgba(255,255,255,0.55)';

/** How wide the lens is around a slot of this width. */
const lensW = (slot: number) => Math.max(LENS, slot + LENS_GROW);

/** The light caught on the top of the glass: bright at the rim, gone by the middle. */
function Sheen() {
  return <LinearGradient colors={['rgba(255,255,255,0.32)', 'rgba(255,255,255,0)']} style={styles.sheen} pointerEvents="none" />;
}

/** Tabs built quietly in the background after the start, one by one, so the first tap on each is instant. */
const PRELOAD: Href[] = ['/insights', '/radio', '/chat']; // the Friend's long chat is the heaviest: last

function FloatingTabBar({ state, navigateToTab }: TabBarProps) {
  const insets = useSafeAreaInsets();
  // A tab is normally built on its first tap (that was the 150-330 ms "lag" on new screens). Build
  // them while you're reading instead: a few seconds after the start, one at a time with breathing room
  // in between (all at once was a burst of work right when the phone is busiest).
  useEffect(() => {
    const timers = PRELOAD.map((href, i) => setTimeout(() => router.prefetch(href), 6000 + i * 3000)); // their data still loads only when opened
    return () => timers.forEach(clearTimeout);
  }, []);
  const keyboardOpen = useKeyboardVisible();
  const [width, setWidth] = useState(0);
  // each name's width, measured once from hidden copies (a guess until then)
  const [labelW, setLabelW] = useState(() => SLOTS.map((s) => s.label.length * 8.5));
  const current = state.routes[state.index]?.name;
  const routeActive = Math.max(0, SLOTS.findIndex((s) => s.route === current));
  // the pill moves the moment you tap (native animation), and the page switches a frame later:
  // building the next page can take a moment, but the tap never feels ignored
  const [tapped, setTapped] = useState<number | null>(null);
  useEffect(() => setTapped(null), [routeActive]);
  const active = tapped ?? routeActive;
  const layout = useMemo(() => (width ? slotLayout(width, active, labelW) : null), [width, active, labelW]);

  // animated values: per slot the icon's x and how "open" it is; the pill's two ends and middle
  const v = useRef({
    x: SLOTS.map(() => new Animated.Value(0)),
    open: SLOTS.map((_, i) => new Animated.Value(i === active ? 1 : 0)),
    left: new Animated.Value(0),
    width: new Animated.Value(LENS), // the lens's width: animated on the JS side (widths can't go native)
  }).current;

  const placed = useRef(false);
  useEffect(() => {
    if (!layout) return;
    const pill = layout[active];
    const contentW = ICON + GAP + labelW[active];
    const targets: [Animated.Value, number][] = [
      ...SLOTS.map((_, i): [Animated.Value, number] => [
        v.x[i],
        // in the pill: icon + name centered together; elsewhere: the icon centered in its slot
        i === active ? pill.center - contentW / 2 : layout[i].center - ICON / 2,
      ]),
      ...SLOTS.map((_, i): [Animated.Value, number] => [v.open[i], i === active ? 1 : 0]),
      [v.left, pill.center - lensW(pill.width) / 2],
    ];
    const width = lensW(pill.width);
    if (!placed.current) {
      placed.current = true; // first layout: just put everything there
      targets.forEach(([val, to]) => val.setValue(to));
      v.width.setValue(width);
      return;
    }
    Animated.parallel([
      ...targets.map(([val, to]) => Animated.spring(val, { toValue: to, ...SPRING })),
      // the lens is ONE see-through piece now: built from three, the joins showed as lines and a
      // rectangle in the glass. Its width springs on the JS side; the move itself stays native.
      Animated.spring(v.width, { toValue: width, ...SPRING, useNativeDriver: false }),
    ]).start();
  }, [layout, active, labelW, v]);

  // the bar would float over the keyboard and the message box while typing
  if (keyboardOpen) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + 14 }]}>
      {/* the radio, docked above the tabs while a show is on (not on Friend or Write: it would cover the typing; not on Radio itself) */}
      {current !== 'chat' && current !== 'radio' && current !== 'write' && (
        <View style={styles.mini}>
          <MiniPlayer />
        </View>
      )}
      {/* frosted: the open tab's content blurred behind it (each tab registers its BlurSource) */}
      <BarGlass>
        <View style={styles.row} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {/* hidden copies of the names, to measure them */}
          <View style={styles.measure} pointerEvents="none">
            {SLOTS.map((s, i) => (
                <Text
                  key={s.route}
                  style={styles.label}
                  onLayout={(e) => {
                    const w = Math.ceil(e.nativeEvent.layout.width);
                    setLabelW((all) => (all[i] === w ? all : all.map((x, k) => (k === i ? w : x))));
                  }}
                >
                  {s.label}
                </Text>
            ))}
          </View>

          {layout && (
            <>
              {/* the glass lens, with a sheen across its top */}
              <Animated.View style={[styles.lensSpot, { transform: [{ translateX: v.left }] }]}>
                <Animated.View style={[styles.lens, { width: v.width }]}>
                  <Sheen />
                </Animated.View>
              </Animated.View>

              {SLOTS.map((s, i) => {
                const route = state.routes.find((r) => r.name === s.route);
                const focused = i === active;
                const light = v.open[i].interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
                return (
                  <View key={s.route} style={StyleSheet.absoluteFill} pointerEvents="box-none">
                    {/* Write keeps its shimmering ring while it isn't open, so the ＋ always stands out */}
                    {s.route === 'write' && (
                      <Animated.View
                        pointerEvents="none"
                        style={[styles.ring, { opacity: light, transform: [{ translateX: Animated.add(v.x[i], (ICON - ITEM) / 2) }] }]}
                      >
                        <ShimmerSweep w={ITEM} strength={0.22} round={ITEM / 2} />
                      </Animated.View>
                    )}
                    {/* the icon: a light copy and a dark copy cross-fade as the pill arrives */}
                    <Animated.View
                      style={[
                        styles.icon,
                        // under the lens the icon is magnified, like through real glass
                        { transform: [{ translateX: v.x[i] }, { scale: v.open[i].interpolate({ inputRange: [0, 1], outputRange: [1, MAGNIFY] }) }] },
                      ]}
                      pointerEvents="none"
                    >
                      <Animated.View style={[StyleSheet.absoluteFill, styles.center, { opacity: light }]}>
                        <Ionicons name={s.icon} size={ICON} color={colors.text} />
                      </Animated.View>
                      <Animated.View style={[StyleSheet.absoluteFill, styles.center, { opacity: v.open[i] }]}>
                        <Ionicons name={s.icon} size={ICON} color={colors.text} />
                      </Animated.View>
                    </Animated.View>
                    {/* the name, riding next to the icon, fading in with the pill */}
                    <Animated.Text
                      style={[styles.label, styles.labelOn, { opacity: v.open[i], transform: [{ translateX: Animated.add(v.x[i], ICON + GAP) }] }]}
                      numberOfLines={1}
                      pointerEvents="none"
                    >
                      {s.label}
                    </Animated.Text>
                    {/* the touch area: the slot as it will be */}
                    <Pressable
                      onPress={() => {
                        if (!route || focused) return;
                        setTapped(i);
                        tabTapped(s.label); // Settings → Privacy → Speed: tap → drawn
                        setTimeout(() => navigateToTab(route.key), 16);
                      }}
                      accessibilityRole="tab"
                      accessibilityLabel={s.label}
                      accessibilityState={{ selected: focused }}
                      style={[styles.touch, { left: layout[i].left, width: layout[i].width }]}
                    />
                  </View>
                );
              })}
            </>
          )}
        </View>
      </BarGlass>
    </View>
  );
}

export default function TabsLayout() {
  return (
    // The tab bar used to blur the screens behind it; on Android that blur crashed the app when
    // the bar came back (after the editor, after the keyboard). It keeps the glass look without it.
    <View style={{ flex: 1 }}>
    {/* behind every tab: plain, or the song's colour while a show plays */}
    <ShowWash />
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      // Back goes to the tab you came from (not always to Journal), like a normal page
      backBehavior="history"
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' }, animation: 'shift' }}
    >
      <Tabs.Screen name="index" options={{ title: 'Journal' }} />
      <Tabs.Screen name="insights" options={{ title: 'Life' }} />
      <Tabs.Screen name="write" options={{ title: 'Write' }} />
      <Tabs.Screen name="chat" options={{ title: 'Friend' }} />
      <Tabs.Screen name="radio" options={{ title: 'Radio' }} />
    </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16 },
  mini: { alignSelf: 'stretch' },
  bar: { elevation: 10 },
  row: { height: ITEM + PAD * 2 },
  measure: { position: 'absolute', opacity: 0, flexDirection: 'row', top: -100 },
  lensSpot: { position: 'absolute', left: 0, top: LENS_TOP, height: LENS },
  lens: {
    height: LENS,
    borderRadius: LENS / 2,
    overflow: 'hidden',
    backgroundColor: LENS_FILL,
    borderWidth: 1,
    borderColor: LENS_RIM,
  },
  sheen: { position: 'absolute', left: 0, right: 0, top: 0, height: LENS * 0.55 },
  icon: { position: 'absolute', left: 0, top: PAD, width: ICON, height: ITEM },
  center: { alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: fonts.sansBold, fontSize: 14 }, // measured and shown bold (the lens's name)
  labelOn: { position: 'absolute', left: 0, top: PAD + (ITEM - 20) / 2, lineHeight: 20, color: colors.text },
  touch: { position: 'absolute', top: 0, bottom: 0 },
  ring: {
    position: 'absolute',
    left: 0,
    top: PAD,
    width: ITEM,
    height: ITEM,
    borderRadius: ITEM / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(255,255,255,0.10)', // glass, like the buttons
  },
});
