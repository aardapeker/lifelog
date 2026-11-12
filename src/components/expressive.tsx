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

/** Bar heights that look like a song's waveform: made up, but the same every time for one song. */
function waveform(seed: string, n: number): number[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rand = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
  const raw = Array.from({ length: n }, () => 0.15 + rand() * 0.85);
  // smoothed a little, with a quieter intro and outro, like real music
  return raw.map((v, i) => {
    const avg = (v * 2 + (raw[i - 1] ?? v) + (raw[i + 1] ?? v)) / 4;
    const edge = Math.min(1, (i + 1) / 6, (n - i) / 6);
    return Math.max(0.12, avg * (0.45 + 0.55 * edge));
  });
}

const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

/**
 * The song's progress as a waveform (played bars bright, the rest dim), with the time on both sides
 * underneath. Tap or drag along it to jump in the song (`onSeek` gets 0..1 when you let go).
 */
export function SeekBar({
  progress,
  durationMs,
  seed,
  onSeek,
  disabled,
}: {
  progress: number;
  durationMs: number;
  seed: string;
  onSeek: (frac: number) => void;
  disabled?: boolean;
}) {
  const BARS = 54;
  const HEIGHT = 34;
  const [width, setWidth] = useState(0);
  const [drag, setDragState] = useState<number | null>(null); // where your finger is, while dragging
  const dragRef = useRef<number | null>(null); // the same, for the release (state may not have caught up)
  const setDrag = (v: number | null) => {
    dragRef.current = v;
    setDragState(v);
  };
  const bars = useRef<{ seed: string; h: number[] }>({ seed: '', h: [] });
  if (bars.current.seed !== seed) bars.current = { seed, h: waveform(seed, BARS) };
  const at = (x: number) => Math.max(0, Math.min(1, x / Math.max(1, width)));
  const shown = drag ?? Math.max(0, Math.min(1, progress));
  return (
    <View style={{ marginTop: 18 }}>
      <View
        style={{ height: HEIGHT, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => !disabled}
        onMoveShouldSetResponder={() => !disabled}
        onResponderTerminationRequest={() => false} // keep the drag even if the page wants to scroll
        onResponderGrant={(e) => setDrag(at(e.nativeEvent.locationX))}
        onResponderMove={(e) => setDrag(at(e.nativeEvent.locationX))}
        onResponderRelease={() => {
          if (dragRef.current !== null) onSeek(dragRef.current);
          setDrag(null);
        }}
        onResponderTerminate={() => setDrag(null)}
        accessibilityRole="adjustable"
        accessibilityLabel="Song position"
      >
        {bars.current.h.map((v, i) => (
          <View
            key={i}
            pointerEvents="none"
            style={{
              width: 3,
              height: Math.max(3, v * HEIGHT),
              borderRadius: 1.5,
              backgroundColor: i / BARS < shown ? colors.text : 'rgba(255,255,255,0.28)',
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        <Animated.Text style={{ color: drag !== null ? colors.text : colors.muted, fontSize: 12, fontFamily: 'Inter_500Medium' }}>
          {fmt(shown * durationMs)}
        </Animated.Text>
        <Animated.Text style={{ color: colors.muted, fontSize: 12, fontFamily: 'Inter_500Medium' }}>{fmt(durationMs)}</Animated.Text>
      </View>
    </View>
  );
}
