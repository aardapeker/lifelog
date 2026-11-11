import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Ionicons from './Icon';
import { colors, fonts } from '../lib/theme';
import type { Station } from '../lib/stations';

/*
 * While a show is being made: a list of what's happening, like a log. Finished steps get a ✓ and
 * fade back; the running one has four pulsing dots and its words ripple with light. The long step
 * (the writer at work) cycles through little behind-the-scenes lines and shows how long it's been.
 */

const WARM = '#E8825A'; // the one warm colour on the screen: "something is happening"

function labelOf(key: string, st: Station, tr: boolean): string {
  const host = st.host.name;
  const side = st.sidekick?.name ?? host;
  const L: Record<string, [string, string]> = {
    journal: ['Reading your journal', 'Günlüğün okunuyor'],
    favourites: ['Digging through your favourites', 'Favori şarkıların karıştırılıyor'],
    writing: [`${host} is writing the show`, `${host} programı yazıyor`],
    songs: ['Finding the songs on Spotify', "Şarkılar Spotify'da aranıyor"],
    voice: [`${host} & ${side} are warming up the mic`, `${host} ve ${side} mikrofonu ısıtıyor`],
  };
  if (!st.sidekick) L.voice = [`${host} is warming up the mic`, `${host} mikrofonu ısıtıyor`];
  return (L[key] ?? [key, key])[tr ? 1 : 0];
}

/** Little lines for the long wait while the script is written, changing every few seconds. */
function asides(st: Station, tr: boolean): string[] {
  const host = st.host.name;
  const side = st.sidekick?.name;
  return tr
    ? [
        'Bu haftanın notlarına bakılıyor',
        `${host} açılış cümlesini düşünüyor`,
        side ? `${side} sahte bir reklam yazıyor` : 'Sahte bir reklam yazılıyor',
        'Şakalar deneniyor, kötüleri atılıyor',
        'Şarkı sırası ayarlanıyor',
        'Haberler hayatından seçiliyor',
      ]
    : [
        'Looking at this week’s notes',
        `${host} is thinking of an opening line`,
        side ? `${side} is writing a fake ad` : 'Writing a fake ad',
        'Testing jokes, throwing out the bad ones',
        'Putting the songs in order',
        'Picking the news from your life',
      ];
}

/** Four dots in a square, lighting up one after another. */
function Dots() {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(t, { toValue: 4, duration: 1200, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [t]);
  // clockwise: top-left, top-right, bottom-right, bottom-left
  const order = [0, 1, 3, 2];
  return (
    <View style={styles.dots}>
      {[0, 1, 2, 3].map((i) => {
        const k = order.indexOf(i);
        const opacity = t.interpolate({
          inputRange: [0, k, k + 0.5, k + 1, 4],
          outputRange: k === 0 ? [1, 1, 0.55, 0.25, 0.25] : [0.25, 0.25, 1, 0.55, 0.25],
          extrapolate: 'clamp',
        });
        return <Animated.View key={i} style={[styles.dot, { opacity }]} />;
      })}
    </View>
  );
}

/** Words with a wave of light running through them, letter by letter. */
function Ripple({ text, style }: { text: string; style?: object }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    t.setValue(0);
    const loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: 1800, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [t, text]);
  const chars = useMemo(() => Array.from(text), [text]);
  const n = chars.length + 8; // the wave starts before the first letter and leaves after the last
  // each letter is its own small view (Android can't animate letters nested inside one Text)
  return (
    <View style={styles.ripple}>
      {chars.map((c, i) => {
        const at = (i + 4) / n;
        const opacity = t.interpolate({
          inputRange: [0, Math.max(0, at - 0.12), at, Math.min(1, at + 0.12), 1],
          outputRange: [0.45, 0.45, 1, 0.45, 0.45],
          extrapolate: 'clamp',
        });
        return (
          <Animated.Text key={i} style={[style, { opacity }]}>
            {c === ' ' ? '\u00A0' : c}
          </Animated.Text>
        );
      })}
    </View>
  );
}

/** A finished step: slides in, then settles grey with a check. */
function Done({ text }: { text: string }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, [a]);
  return (
    <Animated.View style={[styles.row, { opacity: a.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] }) }]}>
      <View style={styles.icon}>
        <Ionicons name="checkmark" size={16} color={colors.ok} />
      </View>
      <Text style={styles.doneText}>{text}</Text>
    </Animated.View>
  );
}

export function BuildProgress({ steps, station }: { steps: { key: string; detail?: string }[]; station: Station }) {
  const tr = station.lang === 'tr';
  const current = steps.at(-1);
  // the clock for the running step, and the rotating aside while the writer works
  const [since, setSince] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => setSince(Date.now()), [current?.key]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const secs = Math.max(0, Math.floor((now - since) / 1000));
  const lines = useMemo(() => asides(station, tr), [station, tr]);
  const aside = current?.key === 'writing' ? lines[Math.floor(secs / 6) % lines.length] : current?.detail;
  const clock = secs >= 5 ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : '';

  return (
    <View style={styles.wrap}>
      <Text style={styles.station}>
        {station.emoji} {station.name} {station.freq}
      </Text>
      {steps.slice(0, -1).map((s) => (
        <Done key={s.key} text={labelOf(s.key, station, tr)} />
      ))}
      {current ? (
        <View style={styles.row}>
          <View style={styles.icon}>
            <Dots />
          </View>
          <View style={{ flex: 1 }}>
            <Ripple key={current.key} text={labelOf(current.key, station, tr)} style={styles.nowText} />
            {(aside || clock) && (
              <Text style={styles.aside}>
                {aside}
                {aside && clock ? ' · ' : ''}
                {clock}
              </Text>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.row}>
          <View style={styles.icon}>
            <Dots />
          </View>
          <Ripple text={tr ? 'Hazırlanıyor' : 'Getting ready'} style={styles.nowText} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 8 },
  station: { fontFamily: fonts.sans, fontSize: 13, letterSpacing: 0.3, color: colors.muted, marginBottom: 18 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  icon: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  doneText: { flex: 1, fontFamily: fonts.sansRegular, fontSize: 16, lineHeight: 22, color: colors.muted },
  nowText: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 22, color: colors.text },
  aside: { fontFamily: fonts.serifItalic, fontSize: 13, lineHeight: 19, color: colors.muted, marginTop: 4 },
  ripple: { flexDirection: 'row', flexWrap: 'wrap', flexShrink: 1 },
  dots: { width: 14, height: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: WARM },
});
