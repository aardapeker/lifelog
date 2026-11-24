import { useMemo, useRef } from 'react';
import { Animated, PanResponder, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

/**
 * Swipe down to close, like a music app's player: a clearly downward drag at the top of the page pulls the
 * whole screen down with the finger; far (140 px) or fast enough, it slides away and `close` runs, otherwise it
 * springs back. It only takes over when the page is scrolled to its top, the drag is mostly vertical and
 * `blocked()` is false (a playlist row being held), so scrolling, seeking and reordering still work.
 *
 * Put `style` on the screen's Animated.View with `panHandlers`, and `onScroll` on its ScrollView.
 */
export function useSwipeToClose(close: () => void, blocked: () => boolean = () => false) {
  const { height } = useWindowDimensions();
  const scrollY = useRef(0);
  const pull = useRef(new Animated.Value(0)).current;
  const latest = useRef({ close, blocked });
  latest.current = { close, blocked };
  const panHandlers = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_e, g) => !latest.current.blocked() && scrollY.current <= 0 && g.dy > 14 && g.dy > Math.abs(g.dx) * 2,
        onPanResponderMove: (_e, g) => pull.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_e, g) => {
          if (g.dy > 140 || g.vy > 1) Animated.timing(pull, { toValue: height, duration: 180, useNativeDriver: true }).start(() => latest.current.close());
          else Animated.spring(pull, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        },
        onPanResponderTerminate: () => Animated.spring(pull, { toValue: 0, useNativeDriver: true }).start(),
      }).panHandlers,
    [height, pull],
  );
  return {
    panHandlers,
    style: { transform: [{ translateY: pull }] },
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollY.current = e.nativeEvent.contentOffset.y;
    },
  };
}
