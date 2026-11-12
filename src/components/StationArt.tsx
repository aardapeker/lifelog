import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import type { Station } from '../lib/stations';

/*
 * Each station's artwork: a gradient in its colours with its own logo, set in type, like the genre
 * tiles of a music app (but the station's logo instead of the word "Pop"). Drawn in code, so no image
 * files: it scales from a grid tile to the big header on the station page.
 */

type Look = {
  colors: [string, string, ...string[]];
  logo: string[]; // the logo's lines
  font: string;
  logoStyle?: TextStyle;
  glow?: string; // a neon-like glow around the letters
  tilt?: number; // degrees
  mark?: string; // a small emoji badge
};

const LOOKS: Record<string, Look> = {
  friend: {
    colors: ['#F2A65A', '#E2725B', '#8C3B4A'],
    logo: ['your', 'friend'],
    font: 'Inter_800ExtraBold_Italic',
    logoStyle: { color: '#FFF4E8', letterSpacing: -1.5, textTransform: 'lowercase' },
    mark: '🎙️',
  },
  neon: {
    colors: ['#FF2E97', '#8B2BE2', '#1B0B3A'],
    logo: ['NEON'],
    font: 'Inter_900Black_Italic',
    logoStyle: { color: '#FFE7F6', letterSpacing: 1 },
    glow: '#FF4FB8',
    mark: '🌴',
  },
  nightshift: {
    colors: ['#1D2B64', '#3A1C71', '#0B0B1A'],
    logo: ['NIGHT', 'SHIFT'],
    font: 'Inter_900Black',
    logoStyle: { color: '#C9D6FF', letterSpacing: 3 },
    glow: '#6C8CFF',
    mark: '🌙',
  },
  rock: {
    colors: ['#7A0E0E', '#2B0A0A', '#0A0A0A'],
    logo: ['GEBZE', 'ROCK'],
    font: 'Inter_900Black',
    logoStyle: { color: '#E8402E', letterSpacing: -1 },
    tilt: -6,
    mark: '🎸',
  },
  chill: {
    colors: ['#3E8EDE', '#5B5FC7', '#2A2D6E'],
    logo: ['şemistan', 'chill'],
    font: 'Inter_700Bold',
    logoStyle: { color: '#EAF2FF', letterSpacing: 0.5, textTransform: 'lowercase' },
    mark: '🐈',
  },
  arabesk: {
    colors: ['#5C0F1E', '#8E2B2B', '#C49A3A'],
    logo: ['Tuzla', 'Arabesk'],
    font: 'LibreCaslonText_400Regular_Italic',
    logoStyle: { color: '#F5D98B' },
    glow: '#F0B44C',
    mark: '🥀',
  },
};

const lookOf = (key: string) => LOOKS[key] ?? LOOKS.friend;
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
  return (
    <View style={[styles.card, style]}>
      <LinearGradient colors={l.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {/* a soft highlight, like light falling on a record sleeve */}
      <LinearGradient
        colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 0.6 }}
        style={StyleSheet.absoluteFill}
      />
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
      {l.mark && <Text style={[styles.mark, { fontSize: size * 0.7 }]}>{l.mark}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, overflow: 'hidden', padding: 14, justifyContent: 'space-between' },
  label: { fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
  freq: { fontFamily: 'Inter_500Medium', color: 'rgba(255,255,255,0.75)' },
  logo: { alignItems: 'flex-end', alignSelf: 'stretch' },
  mark: { position: 'absolute', left: 12, bottom: 10, opacity: 0.9 },
});
