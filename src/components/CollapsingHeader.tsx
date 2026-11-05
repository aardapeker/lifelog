import { useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../lib/theme';
import { Glass } from './Glass';

/*
 * Magazine-masthead scrolling: the big title fades and shrinks as you scroll, and a slim
 * frosted-glass bar with the same title slides in at the top.
 */

const SHOW_AT = 70; // px scrolled before the slim bar appears

/** The scroll position, and the onScroll to give an Animated.ScrollView / Animated.FlatList. */
export function useCollapsingHeader() {
  const y = useRef(new Animated.Value(0)).current;
  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y } } }], { useNativeDriver: true });
  return { y, onScroll };
}

/** Style for the big title in the content: fades out and shrinks a little as it scrolls away. */
export function bigTitleMotion(y: Animated.Value) {
  return {
    opacity: y.interpolate({ inputRange: [0, SHOW_AT], outputRange: [1, 0], extrapolate: 'clamp' }),
    transform: [
      { scale: y.interpolate({ inputRange: [-80, 0, SHOW_AT], outputRange: [1.12, 1, 0.92], extrapolate: 'clamp' }) },
    ],
    transformOrigin: 'left center',
  } as const;
}

/** The slim glass bar. Render it after the list, so it sits on top. */
export function CollapsingHeader({ title, y }: { title: string; y: Animated.Value }) {
  const insets = useSafeAreaInsets();
  const opacity = y.interpolate({ inputRange: [SHOW_AT - 20, SHOW_AT + 10], outputRange: [0, 1], extrapolate: 'clamp' });
  const shift = y.interpolate({ inputRange: [SHOW_AT - 20, SHOW_AT + 10], outputRange: [-10, 0], extrapolate: 'clamp' });
  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { opacity }]}>
      <Glass radius={0} style={{ paddingTop: insets.top + 6, paddingBottom: 12 }}>
        <Animated.Text style={[styles.title, { transform: [{ translateY: shift }] }]} numberOfLines={1}>
          {title}
        </Animated.Text>
      </Glass>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0 },
  title: { fontFamily: fonts.serif, fontSize: 19, color: colors.text, textAlign: 'center', paddingHorizontal: 60 },
});
