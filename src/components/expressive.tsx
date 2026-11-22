import Ionicons from './Icon';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View, type LayoutChangeEvent } from 'react-native';
import { colors } from '../lib/theme';
import { PressScale } from './motion';

/*
 * Bits of Google's "Material 3 Expressive" style: shapes that morph with their state,
 * and a progress line that waves while the music plays.
 */

/** Play / pause that morphs: a circle while playing, a soft square when paused. */
export function MorphPlayButton({ playing, onPress, size = 68 }: { playing: boolean; onPress: () => void; size?: number }) {
  const shape = useRef(new Animated.Value(playing ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(shape, { toValue: playing ? 1 : 0, useNativeDriver: false, speed: 14, bounciness: 10 }).start();
  }, [playing, shape]);
  const borderRadius = shape.interpolate({ inputRange: [0, 1], outputRange: [size * 0.3, size / 2] });
  const rotate = shape.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '0deg'] });
  return (
    <PressScale onPress={onPress} scaleTo={0.9} accessibilityLabel={playing ? 'Pause' : 'Play'}>
      <Animated.View
        style={{
          width: size,
          height: size,
          borderRadius,
          backgroundColor: colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ rotate }],
        }}
      >
        <Ionicons name={playing ? 'pause' : 'play'} size={size * 0.4} color={colors.accentText} />
      </Animated.View>
    </PressScale>
  );
}

const DOTS = 64;
const AMP = 3.5;
const SAMPLES = Array.from({ length: 13 }, (_, k) => k / 12); // smooth enough to read as a sine

/** The song's progress: the played part waves (while playing), the rest is a flat line. */
export function WavyProgress({ progress, playing }: { progress: number; playing: boolean }) {
  const [width, setWidth] = useState(0);
  const phase = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!playing) return;
    const loop = Animated.loop(
      Animated.timing(phase, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [playing, phase]);

  const done = Math.max(0, Math.min(1, progress));
  const step = width / DOTS;
  return (
    <View style={{ height: AMP * 2 + 6, marginTop: 20 }} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 &&
        Array.from({ length: DOTS }, (_, i) => {
          const played = i / DOTS < done;
          // each dot rides the same wave, shifted by its position; the phase moves the wave along
          const y = phase.interpolate({ inputRange: SAMPLES, outputRange: SAMPLES.map((p) => Math.sin((i / 6 - p) * 2 * Math.PI) * AMP) });
          return (
            <Animated.View
              key={i}
              style={{
                position: 'absolute',
                left: i * step,
                top: AMP + 1,
                width: Math.max(2, step * 0.75),
                height: 3,
                borderRadius: 1.5,
                backgroundColor: played ? colors.text : colors.line,
                transform: [{ translateY: played && playing ? y : 0 }],
              }}
            />
          );
        })}
    </View>
  );
}
