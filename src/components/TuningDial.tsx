import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { skinOf } from '../lib/skins';
import type { Station } from '../lib/stations';
import { colors, fonts, frost, radius } from '../lib/theme';

/*
 * The Radio tab's tuning dial: the stations as marks on an old radio's scale, fine ticks between them, and a
 * glowing needle in the colour of the station it's on (the one on air, else the last one you heard). Tap a mark
 * and the needle sweeps over to it before the station opens, the one moment of motion on the page.
 *
 * The marks sit in frequency order but evenly spaced (Night Shift FM's 23.3 would squash the rest into a
 * corner of a true-to-scale dial); the ticks are the dial's texture, not a scale.
 */

const PAD = 22; // room at the ends, so the first and last labels fit
const TICK_EVERY = 7;

export function TuningDial({ stations, on, onTune }: { stations: Station[]; on: string | null; onTune: (s: Station) => void }) {
  const marks = [...stations].sort((a, b) => Number(a.freq) - Number(b.freq));
  const [width, setWidth] = useState(0);
  const at = (i: number) => (marks.length < 2 ? width / 2 : PAD + (i * (width - PAD * 2)) / (marks.length - 1));
  const [tuned, setTuned] = useState<string | null>(on);
  useEffect(() => setTuned(on), [on]);
  const index = Math.max(0, marks.findIndex((m) => m.key === tuned));
  const needle = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);

  useEffect(() => {
    if (!width) return;
    const x = at(index);
    if (!placed.current) {
      needle.setValue(x); // first draw: straight there, no sweep
      placed.current = true;
    } else Animated.spring(needle, { toValue: x, useNativeDriver: true, speed: 14, bounciness: 6 }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, index]);

  const accent = tuned ? skinOf(tuned).accent : colors.text;
  const ticks = width ? Math.floor((width - PAD * 2) / TICK_EVERY) + 1 : 0;

  return (
    <View style={styles.dial} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {/* the frequencies, above their marks */}
      <View style={styles.labels}>
        {width > 0 &&
          marks.map((m, i) => {
            const active = m.key === tuned;
            return (
              <Pressable
                key={m.key}
                onPress={() => {
                  setTuned(m.key);
                  setTimeout(() => onTune(m), 260); // let the needle land first
                }}
                hitSlop={{ top: 12, bottom: 40 }}
                style={[styles.label, { left: at(i) - 26 }]}
                accessibilityRole="button"
                accessibilityLabel={`${m.name}, ${m.freq}`}
              >
                <Text style={[styles.freq, active && { color: skinOf(m.key).accent, fontFamily: fonts.sans }]}>{m.freq}</Text>
              </Pressable>
            );
          })}
      </View>
      {/* the scale: fine ticks, a taller one at each station */}
      <View style={styles.scale} pointerEvents="none">
        {Array.from({ length: ticks }, (_, k) => (
          <View key={k} style={[styles.tick, { left: PAD + k * TICK_EVERY }, k % 5 === 0 && styles.tickMid]} />
        ))}
        {width > 0 &&
          marks.map((m, i) => <View key={m.key} style={[styles.tickStation, { left: at(i) - 1, backgroundColor: m.key === tuned ? skinOf(m.key).accent : 'rgba(255,255,255,0.55)' }]} />)}
        {/* the needle, glowing in the station's colour */}
        {width > 0 && (
          <Animated.View
            style={[
              styles.needle,
              { backgroundColor: accent, boxShadow: `0 0 10px 1px ${accent}`, transform: [{ translateX: Animated.subtract(needle, 1) }] },
            ]}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dial: { height: 78, borderRadius: radius.md, ...frost, marginBottom: 18, overflow: 'hidden' },
  labels: { height: 30 },
  label: { position: 'absolute', top: 10, width: 52, alignItems: 'center' },
  freq: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.muted, fontVariant: ['tabular-nums'] },
  scale: { flex: 1 },
  tick: { position: 'absolute', bottom: 14, width: 1, height: 8, backgroundColor: 'rgba(255,255,255,0.18)' },
  tickMid: { height: 13, backgroundColor: 'rgba(255,255,255,0.3)' },
  tickStation: { position: 'absolute', bottom: 14, width: 2, height: 22, borderRadius: 1 },
  needle: { position: 'absolute', left: 0, top: 2, bottom: 6, width: 2, borderRadius: 1 },
});
