import Ionicons from './Icon';
import { useKeepAwake } from 'expo-keep-awake';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Image, StyleSheet, View } from 'react-native';
import { FadeIn, PressScale } from './motion';
import { useBackdrop } from '../lib/backdrop';
import { useRadioDock } from '../lib/radioEngine';
import { colors, radius } from '../lib/theme';
import { showAlert } from '../lib/dialog';

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
    showAlert(`Never play "${name}"?`, "It won't come back on Lifelog Radio. If it's playing now, we skip it.", [
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

/**
 * The radio's background (the playlist look, which the player uses too): the song's colour at the top,
 * fading into near-black. A new song's colour cross-fades in.
 */
export function ColourWash({ glow }: { glow: string | null }) {
  const c = glow ?? 'rgb(150, 90, 190)'; // the cover's own colour, as it is (light ones too: the text over it copes)
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: WASH_BASE }]} pointerEvents="none">
      <FadeIn key={c} from={0} style={StyleSheet.absoluteFill}>
        <LinearGradient
          colors={[withAlpha(c, 0.75), withAlpha(c, 0.25), 'rgba(0,0,0,0)']}
          locations={[0, 0.35, 0.7]}
          style={StyleSheet.absoluteFill}
        />
      </FadeIn>
    </View>
  );
}
export const WASH_BASE = '#0B0B0B';

/**
 * The whole app's background while a show plays: the playlist look in the song's colour. Off air,
 * the colour picked in Settings (or the plain background). Reads only the dock state, so it doesn't redraw every second.
 */
export function ShowWash() {
  const { phase, glow } = useRadioDock();
  const chosen = useBackdrop(); // Settings → Me → Background, for when nothing plays
  if (phase === 'onair') return <ColourWash glow={glow} />;
  if (chosen) return <ColourWash glow={chosen} />;
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} pointerEvents="none" />;
}

/** 3:56 */
export const duration = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

const styles = StyleSheet.create({
  cover: { width: '100%', aspectRatio: 1, borderRadius: radius.lg, backgroundColor: colors.raised },
  coverWrap: { marginBottom: 0 },
  halo: { borderRadius: radius.lg },
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


/**
 * The player's moving light: the album cover shrunk to a small picture and stretched over the screen,
 * which makes a soft cloud in the cover's real colours, slowly turning and zooming. The trick Apple
 * Music and Spotify use: no blur is ever computed (a tiny picture stretched IS the blur), the GPU
 * just draws one picture at an angle. `moving` false holds it still (paused, or when the top bar
 * frosts over it). A new song's cloud fades in over the old one.
 */
export function CoverCloud({ uri, moving }: { uri: string; moving: boolean }) {
  const spin = useRef(new Animated.Value(0)).current;
  const zoom = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!moving) return;
    const loops = [
      Animated.loop(Animated.timing(spin, { toValue: 1, duration: 60_000, easing: Easing.linear, useNativeDriver: true })),
      Animated.loop(
        Animated.sequence([
          Animated.timing(zoom, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(zoom, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [moving, spin, zoom]);
  const { width, height } = Dimensions.get('window');
  const size = Math.hypot(width, height) * 1.25; // turns without its corners ever showing
  return (
    <View style={[StyleSheet.absoluteFill, cloud.wrap]} pointerEvents="none">
      <FadeIn key={uri} from={0} style={[cloud.center, { width: size, height: size }]}>
        <Animated.View
          style={{
            width: size,
            height: size,
            transform: [
              { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
              { scale: zoom.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }) },
            ],
          }}
        >
          {/* decoded small (resizeMethod) and blurred once while decoding, then stretched: a stretched
              tiny picture is the soft cloud, so nothing is blurred again while it moves */}
          <Image source={{ uri }} resizeMethod="resize" blurRadius={8} style={{ width: CLOUD_PX, height: CLOUD_PX, transform: [{ scale: size / CLOUD_PX }], left: size / 2 - CLOUD_PX / 2, top: size / 2 - CLOUD_PX / 2 }} />
        </Animated.View>
      </FadeIn>
      {/* darker towards the bottom, so the player's text stays readable over any cover */}
      <LinearGradient colors={['rgba(11,11,11,0.15)', 'rgba(11,11,11,0.55)', 'rgba(11,11,11,0.92)']} locations={[0, 0.45, 0.85]} style={StyleSheet.absoluteFill} />
    </View>
  );
}
const CLOUD_PX = 48; // small enough that the one-time blur costs nothing, big enough to stretch smoothly

const cloud = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: WASH_BASE },
  center: { position: 'absolute' },
});
