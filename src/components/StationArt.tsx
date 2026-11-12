import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import type { Station } from '../lib/stations';

/*
 * Each station's artwork: a gradient in its colours with its own logo, set in type, like the genre
 * tiles of a music app (but the station's logo instead of the word "Pop"). Drawn in code, so no image
 * files: it scales from a grid tile to the big header on the station page. Each has a little picture
 * behind the logo: Neon's synthwave sun, Night Shift's moon, Gebze Rock's red stage lights, an old
 * arabesk record, rain on Şemistan's window, a warm sunrise for Your Friend.
 */

type Look = {
  colors: [string, string, ...string[]];
  logo: string[]; // the logo's lines
  font: string;
  logoStyle?: TextStyle;
  glow?: string; // a neon-like glow around the letters
  tilt?: number; // degrees
};

const LOOKS: Record<string, Look> = {
  friend: {
    colors: ['#F2A65A', '#E2725B', '#8C3B4A'],
    logo: ['your', 'friend'],
    font: 'Inter_800ExtraBold_Italic',
    logoStyle: { color: '#FFF4E8', letterSpacing: -1.5, textTransform: 'lowercase' },
  },
  neon: {
    colors: ['#FF2E97', '#8B2BE2', '#1B0B3A'],
    logo: ['NEON'],
    font: 'Inter_900Black_Italic',
    logoStyle: { color: '#FFE7F6', letterSpacing: 1 },
    glow: '#FF4FB8',
  },
  nightshift: {
    colors: ['#1D2B64', '#3A1C71', '#0B0B1A'],
    logo: ['NIGHT', 'SHIFT'],
    font: 'Inter_900Black',
    logoStyle: { color: '#C9D6FF', letterSpacing: 3 },
    glow: '#6C8CFF',
  },
  rock: {
    colors: ['#7A0E0E', '#2B0A0A', '#0A0A0A'],
    logo: ['GEBZE', 'ROCK'],
    font: 'Inter_900Black',
    logoStyle: { color: '#E8402E', letterSpacing: -1 },
    tilt: -6,
  },
  chill: {
    colors: ['#3E8EDE', '#5B5FC7', '#2A2D6E'],
    logo: ['şemistan', 'chill'],
    font: 'Inter_700Bold',
    logoStyle: { color: '#EAF2FF', letterSpacing: 0.5, textTransform: 'lowercase' },
  },
  arabesk: {
    colors: ['#5C0F1E', '#8E2B2B', '#C49A3A'],
    logo: ['Tuzla', 'Arabesk'],
    font: 'LibreCaslonText_400Regular_Italic',
    logoStyle: { color: '#F5D98B' },
    glow: '#F0B44C',
  },
};

const lookOf = (key: string) => LOOKS[key] ?? LOOKS.friend;

/** Light rays fanning out from a point (a sunburst, stage lights). */
function Rays({ x, y, n, len, color, width }: { x: number; y: number; n: number; len: number; color: string; width: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <LinearGradient
          key={i}
          colors={[color, 'rgba(0,0,0,0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ position: 'absolute', left: x, top: y - width / 2, width: len, height: width, transformOrigin: 'left center', transform: [{ rotate: `${(i * 360) / n}deg` }] }}
        />
      ))}
    </>
  );
}

const dot = (x: number, y: number, r: number, style: ViewStyle) => (
  <View key={`${x},${y},${r}`} style={[{ position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: r }, style]} />
);

/** Each station's picture behind its logo, drawn for a w×h card (designed at 170×117, scaled). */
function Decor({ k, w, h }: { k: string; w: number; h: number }) {
  const u = w / 170; // the scale
  switch (k) {
    case 'friend': // a warm sunrise from the bottom corner
      return (
        <>
          <Rays x={30 * u} y={h + 10 * u} n={18} len={160 * u} color="rgba(255,240,200,0.35)" width={3 * u} />
          {dot(30 * u, h + 10 * u, 40 * u, { backgroundColor: 'rgba(255,230,180,0.35)', boxShadow: `0 0 ${40 * u}px ${20 * u}px rgba(255,220,160,0.35)` })}
        </>
      );
    case 'neon': // a synthwave sun over a striped horizon
      return (
        <>
          <View style={{ position: 'absolute', left: w * 0.62 - 34 * u, top: h * 0.62 - 34 * u, width: 68 * u, height: 68 * u, borderRadius: 34 * u, overflow: 'hidden', boxShadow: `0 0 ${30 * u}px ${6 * u}px rgba(255,79,184,0.6)` }}>
            <LinearGradient colors={['#FFD36E', '#FF4FB8']} locations={[0, 0.7]} style={StyleSheet.absoluteFill} />
          </View>
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={`s${i}`} style={{ position: 'absolute', left: 0, right: 0, top: h * 0.62 + (6 + i * 7) * u, height: (2 + i) * u, backgroundColor: '#3A0F63' }} />
          ))}
          {[0, 1, 2, 3].map((i) => (
            <View key={`g${i}`} style={{ position: 'absolute', left: 0, right: 0, top: h * 0.82 + i * 7 * u, height: 1, backgroundColor: 'rgba(255,79,184,0.6)' }} />
          ))}
        </>
      );
    case 'nightshift': // a crescent moon and a few stars
      return (
        <>
          {[[20, 60], [60, 88], [100, 34], [140, 90], [34, 96], [84, 70], [150, 40]].map(([x, y]) => dot(x * u, y * u, 1.2 * u, { backgroundColor: '#FFFFFF', opacity: 0.8 }))}
          {dot(28 * u, h - 24 * u, 16 * u, { backgroundColor: '#E8ECFF', boxShadow: `0 0 ${24 * u}px ${8 * u}px rgba(160,180,255,0.55)` })}
          {dot(21 * u, h - 28 * u, 14 * u, { backgroundColor: '#2A2466' })}
        </>
      );
    case 'rock': // red stage lights bursting out
      return (
        <>
          <Rays x={w * 0.55} y={h * 0.55} n={22} len={170 * u} color="rgba(255,70,40,0.35)" width={4 * u} />
          {dot(w * 0.55, h * 0.55, 20 * u, { backgroundColor: 'rgba(255,90,40,0.45)', boxShadow: `0 0 ${40 * u}px ${18 * u}px rgba(255,60,30,0.45)` })}
        </>
      );
    case 'chill': // soft light and rain on the window
      return (
        <>
          {dot(30 * u, 30 * u, 50 * u, { backgroundColor: 'rgba(160,200,255,0.35)', boxShadow: `0 0 ${50 * u}px ${30 * u}px rgba(160,200,255,0.3)` })}
          {dot(w - 20 * u, h - 10 * u, 45 * u, { backgroundColor: 'rgba(120,110,255,0.35)', boxShadow: `0 0 ${50 * u}px ${30 * u}px rgba(120,110,255,0.3)` })}
          {Array.from({ length: Math.ceil(w / (19 * u)) }, (_, i) => (
            <View key={`r${i}`} style={{ position: 'absolute', left: (10 + i * 19) * u, top: ((i * 37) % 60) * u, width: 1.5 * u, height: 22 * u, backgroundColor: 'rgba(255,255,255,0.35)', transform: [{ rotate: '12deg' }] }} />
          ))}
        </>
      );
    case 'arabesk': // an old record, gold grooves
      return (
        <>
          {[56, 44, 32, 20].map((r, i) => dot(28 * u, h - 8 * u, r * u, { backgroundColor: i % 2 ? '#2A0A10' : '#1A0508', borderWidth: 1, borderColor: 'rgba(240,180,76,0.35)' }))}
          {dot(28 * u, h - 8 * u, 8 * u, { backgroundColor: '#C49A3A' })}
        </>
      );
    default:
      return null;
  }
}
export const stationColors = (key: string) => lookOf(key).colors;

/**
 * The artwork. `size` is the logo's font size: about 30 for a grid tile, 54 for the station page.
 * `label` puts the station's name and frequency small in the top-left corner (like "Pop" on a genre tile).
 */
export function StationArt({
  station,
  size = 30,
  label = true,
  style,
}: {
  station: Station;
  size?: number;
  label?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const l = lookOf(station.key);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  return (
    <View style={[styles.card, style]} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <LinearGradient colors={l.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {/* a soft highlight, like light falling on a record sleeve */}
      <LinearGradient
        colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 0.6 }}
        style={StyleSheet.absoluteFill}
      />
      {box && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Decor k={station.key} w={box.w} h={box.h} />
        </View>
      )}
      {label && (
        <Text style={[styles.label, { fontSize: Math.max(13, size * 0.45) }]} numberOfLines={1}>
          {station.name} <Text style={styles.freq}>{station.freq}</Text>
        </Text>
      )}
      <View style={[styles.logo, l.tilt ? { transform: [{ rotate: `${l.tilt}deg` }] } : null]}>
        {l.logo.map((line) => (
          <Text
            key={line}
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[
              { fontFamily: l.font, fontSize: size, lineHeight: size * 1.05 },
              l.logoStyle,
              l.glow ? { textShadowColor: l.glow, textShadowRadius: size * 0.45, textShadowOffset: { width: 0, height: 0 } } : null,
            ]}
          >
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, overflow: 'hidden', padding: 14, justifyContent: 'space-between' },
  label: { fontFamily: 'Inter_700Bold', color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  freq: { fontFamily: 'Inter_500Medium', color: 'rgba(255,255,255,0.75)' },
  logo: { alignItems: 'flex-end', alignSelf: 'stretch' },
});
