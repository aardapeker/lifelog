import Ionicons from './Icon';
import { useKeepAwake } from 'expo-keep-awake';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Image, StyleSheet, View } from 'react-native';
import { FadeIn, PressScale } from './motion';
import type { Palette } from '../lib/albumColors';
import { colors, radius } from '../lib/theme';

/*
 * Pieces shared by the radio's screens (home, station, on air, playlist).
 */

/** Keeps the screen on while the show runs (the host needs the app awake to talk). */
export function KeepAwake() {
  useKeepAwake('radio');
  return null;
}

/** The show's own name, without the station repeated in front ("Neon FM 98.3: Pazar Sabahı…" → "Pazar Sabahı…"). */
export const showName = (s: { title: string; station: { name: string; freq: string } }) =>
  s.title.replace(new RegExp(`^\\s*${s.station.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s*${s.station.freq.replace('.', '\\.')})?\\s*[:·\\-–—]?\\s*`, 'i'), '') || s.title;

/** ♥ a song: it may come back in later shows. Everything else is replaced by new finds. */
export function Heart({ on, onPress, size }: { on: boolean; onPress: () => void; size: number }) {
  return (
    <PressScale onPress={onPress} scaleTo={0.8} hitSlop={10} accessibilityLabel={on ? 'Unheart this song' : 'Heart this song'}>
      <Ionicons name={on ? 'heart' : 'heart-outline'} size={size} color={on ? '#FF5A6E' : colors.muted} />
    </PressScale>
  );
}

/** 🚫 "Don't play this song": asks once, then the song never comes back on the radio. */
export function Ban({ name, onBan, size }: { name: string; onBan: () => void; size: number }) {
  const ask = () =>
    Alert.alert(`Never play "${name}"?`, "It won't come back on Lifelog Radio. If it's playing now, we skip it.", [
      { text: 'Cancel', style: 'cancel' },
      { text: "Don't play it", style: 'destructive', onPress: onBan },
    ]);
  return (
    <PressScale onPress={ask} scaleTo={0.8} hitSlop={10} accessibilityLabel={`Don't play ${name}`}>
      <Ionicons name="ban-outline" size={size} color={colors.muted} />
    </PressScale>
  );
}

export const withAlpha = (rgb: string, a: number) => rgb.replace('rgb(', 'rgba(').replace(')', `, ${a})`);

/**
 * The page's light: the album cover itself, blurred into a soft cloud of its colours, filling the
 * whole screen behind the glass (fixed while you scroll). Each new cover cross-fades in. A dark veil
 * keeps the text readable. No cover (or before it loads): the cover's two colours as a gradient.
 */
export function AlbumGlow({ palette, image }: { palette: Palette | null; image: string | null }) {
  const [layers, setLayers] = useState<{ key: string; image: string | null; p: Palette | null }[]>([]);
  useEffect(() => {
    if (!image && !palette) return;
    setLayers((l) => (l[l.length - 1]?.key === `${image}|${palette?.glow}` ? l : [...l.slice(-1), { key: `${image}|${palette?.glow}`, image, p: palette }]));
  }, [image, palette]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {layers.map(({ key, image: img, p }) => (
        <FadeIn key={key} from={0} style={StyleSheet.absoluteFill}>
          {img ? (
            <>
              <Image source={{ uri: img }} blurRadius={40} resizeMode="cover" style={[StyleSheet.absoluteFill, styles.backdrop]} />
              <LinearGradient
                colors={['rgba(29, 28, 28, 0.15)', 'rgba(29, 28, 28, 0.45)', 'rgba(29, 28, 28, 0.7)']}
                locations={[0, 0.5, 1]}
                style={StyleSheet.absoluteFill}
              />
            </>
          ) : p ? (
            <LinearGradient
              colors={[withAlpha(p.glow, 0.65), withAlpha(p.glow, 0.38), withAlpha(p.deep, 0.95)]}
              locations={[0, 0.45, 1]}
              style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]}
            />
          ) : null}
        </FadeIn>
      ))}
    </View>
  );
}

/**
 * The cover with a halo: a soft light in the cover's brightest colour glowing out from behind it,
 * like a lamp (a real blurred shadow, not a hard edge). While on air it breathes slowly (a little
 * faster while the hosts talk); paused, it rests.
 */
export function GlowingCover({ uri, glow, live, talking }: { uri: string; glow: string | null; live: boolean; talking: boolean }) {
  const breath = useRef(new Animated.Value(0.75)).current;
  useEffect(() => {
    if (!live) {
      Animated.timing(breath, { toValue: 0.55, duration: 600, useNativeDriver: true }).start();
      return;
    }
    const half = talking ? 1100 : 2200;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0.6, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [live, talking, breath]);
  const scale = breath.interpolate({ inputRange: [0.5, 1], outputRange: [0.97, 1.02] });
  return (
    <View style={styles.coverWrap}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.halo,
          { backgroundColor: glow ?? 'rgb(255, 255, 255)', boxShadow: `0 0 70px 18px ${withAlpha(glow ?? 'rgb(255, 255, 255)', 0.75)}` },
          { opacity: breath, transform: [{ scale }] },
        ]}
      />
      <Image source={{ uri }} style={styles.cover} />
    </View>
  );
}

/** 3:56 */
export const duration = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

const styles = StyleSheet.create({
  cover: { width: '100%', aspectRatio: 1, borderRadius: radius.lg, backgroundColor: colors.raised },
  coverWrap: { marginBottom: 0 },
  halo: { borderRadius: radius.lg },
  backdrop: { transform: [{ scale: 1.25 }], opacity: 0.85 }, // a little bigger: no hard blur edges at the screen's sides
});

/** "just now", "25 min ago", "3 h ago". */
export function ago(t: number): string {
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 60 * 24) return `${Math.round(min / 60)} h ago`;
  const days = Math.round(min / 1440);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
