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
  const { phase, glow, deep, music } = useRadioDock();
  const chosen = useBackdrop(); // Settings → Me → Background, for when nothing plays
  if (phase === 'onair')
    return (
      <>
        <ColourWash glow={glow} />
        <StageLights on={music} glow={glow} deep={deep} />
      </>
    );
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
 * Stage lights while a song plays: three soft lights in the cover's colours drifting slowly across
 * the background, each on its own loop (7, 11 and 13 s) so they never move in step, breathing a
 * little. They fade in when the music starts and out for talks or pause. All native-driven.
 */
function StageLights({ on, glow, deep }: { on: boolean; glow: string | null; deep: string | null }) {
  const fade = useRef(new Animated.Value(0)).current;
  const loops = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: on ? 1 : 0, duration: on ? 1400 : 700, useNativeDriver: true }).start();
  }, [on, fade]);
  useEffect(() => {
    if (!on) return;
    const runs = loops.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: [7000, 11000, 13000][i], easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: [7000, 11000, 13000][i], easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ),
    );
    runs.forEach((r) => r.start());
    return () => runs.forEach((r) => r.stop());
  }, [on, loops]);

  const a = glow ?? 'rgb(150, 90, 190)';
  const b = deep ?? a;
  const { width, height } = Dimensions.get('window');
  // where each light swings between (fractions of the screen), its colour and how big its glow is
  const lights = [
    { color: a, from: [0.1, 0.12], to: [0.85, 0.3], spread: 160, alpha: 0.7 },
    { color: b, from: [0.9, 0.55], to: [0.15, 0.4], spread: 200, alpha: 0.6 },
    { color: 'rgb(255, 255, 255)', from: [0.3, 0.05], to: [0.65, 0.2], spread: 100, alpha: 0.16 }, // a white spotlight sweeping the top
  ];
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]} pointerEvents="none">
      {lights.map((l, i) => {
        const t = loops[i];
        return (
          <Animated.View
            key={i}
            style={[
              stage.light,
              {
                backgroundColor: withAlpha(l.color, l.alpha),
                boxShadow: `0 0 ${l.spread}px ${l.spread * 0.8}px ${withAlpha(l.color, l.alpha)}`,
                opacity: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.65, 1, 0.65] }),
                transform: [
                  { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [l.from[0] * width, l.to[0] * width] }) },
                  { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [l.from[1] * height, l.to[1] * height] }) },
                  { scale: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.9, 1.25, 0.9] }) },
                ],
              },
            ]}
          />
        );
      })}
    </Animated.View>
  );
}

const stage = StyleSheet.create({
  // a tiny dot: all you see is its glow (a bigger one showed as a disc in the middle of the light)
  light: { position: 'absolute', left: -1, top: -1, width: 2, height: 2, borderRadius: 1 },
});
