import { useRef } from 'react';
import { Animated, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { usePanGesture } from 'react-native-gesture-handler';

/**
 * Swipe down to close, like a music app's player: a clearly downward drag that starts with the page scrolled to its
 * top pulls the whole screen down with the finger; far (140 px) or fast enough, it slides away and `close` runs,
 * otherwise it springs back. Not while `blocked()` (a playlist row being held), and sideways drags fail it, so
 * scrolling, seeking and reordering still work.
 *
 * Why Gesture Handler: with React Native's own PanResponder, Android's ScrollView took the touch for itself the
 * moment the finger moved (it does even at the top, for its overscroll glow), so only the parts of a page that
 * don't scroll (the top bar) could be swiped. A native pan runs alongside the scroll view instead.
 *
 * Use: wrap the screen's Animated.View (with `style`) in <GestureDetector gesture={swipe.gesture}>, and give its
 * scroll view (Gesture Handler's ScrollView) `simultaneousWith={swipe.gesture}` and `onScroll={swipe.onScroll}`.
 * A sheet that stays mounted (a Modal) calls `reset` when it opens again, or it would still be pulled down.
 */
export function useSwipeToClose(close: () => void, blocked: () => boolean = () => false) {
  const { height } = useWindowDimensions();
  const scrollY = useRef(0);
  const armed = useRef(false); // this drag started at the top: it may pull the page
  const pull = useRef(new Animated.Value(0)).current;
  const latest = useRef({ close, blocked, height });
  latest.current = { close, blocked, height };

  const home = () => Animated.spring(pull, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();

  const gesture = usePanGesture({
    runOnJS: true, // the page moves with an RN Animated value, set from JS
    activeOffsetY: 12, // a clear downward drag (an upward one is the scroll view's)
    failOffsetX: [-24, 24], // a sideways one is someone else's (seeking, a row)
    cancelsJSResponder: false, // never cut off a PanResponder underneath (the playlist's drag-to-reorder, the seek bar)
    onBegin: () => {
      armed.current = scrollY.current <= 1 && !latest.current.blocked();
    },
    onUpdate: (e) => {
      if (armed.current) pull.setValue(Math.max(0, e.translationY));
    },
    // let go: far or fast enough down, away it slides; anything else (even a drag that turned into a scroll on
    // the way back up) springs back home, so the page never stays half pulled
    onDeactivate: (e) => {
      const closing = armed.current && (e.translationY > 140 || e.velocityY > 1000);
      armed.current = false;
      if (closing) Animated.timing(pull, { toValue: latest.current.height, duration: 180, useNativeDriver: true }).start(() => latest.current.close());
      else home();
    },
    onFinalize: (e) => {
      if (!e.canceled) return;
      armed.current = false;
      home();
    },
  });

  return {
    gesture,
    style: { transform: [{ translateY: pull }] },
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollY.current = e.nativeEvent.contentOffset.y;
      // the page scrolled mid-drag (dragged back up past the start): it's a scroll now, and the page goes home
      if (scrollY.current > 1 && armed.current) {
        armed.current = false;
        home();
      }
    },
    reset: () => {
      pull.setValue(0);
      scrollY.current = 0;
    },
  };
}
