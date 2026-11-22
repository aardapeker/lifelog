import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import type { Skin } from '../lib/skins';
import { colors } from '../lib/theme';
import { ScanLines } from './booth';
import Ionicons from './Icon';

/*
 * Each station page's background (behind the show's options, never behind the player, where the
 * cover's colour cloud is the star): Friend's warm sunrise, Tuzla Arabesk's deep red with a gold frame,
 * Neon FM's synthwave sun setting on a grid, Night Shift's green CRT, Gebze Rock's hazard tape,
 * Şemistan Chill's paw prints. Still pictures from flat views and gradients: nothing moves or redraws.
 * Each one fades into the app's background, so the chips and text on top stay readable.
 */

const fade = (top: string, until = 0.6) => (
  <LinearGradient colors={[top, colors.bg]} locations={[0, until]} style={StyleSheet.absoluteFill} />
);

export function StationBackdrop({ skin }: { skin: Skin }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {skin.backdrop === 'sunrise' && <Sunrise />}
      {skin.backdrop === 'ornate' && <Ornate />}
      {skin.backdrop === 'sunset' && <Sunset />}
      {skin.backdrop === 'crt' && <Crt />}
      {skin.backdrop === 'hazard' && <Hazard />}
      {skin.backdrop === 'paws' && <Paws />}
    </View>
  );
}

/** Friend: a warm glow from the top, a soft sun in the corner. */
function Sunrise() {
  return (
    <>
      {fade('#5A3218', 0.55)}
      <View style={[s.disc, { top: -90, right: -70, width: 260, height: 260, backgroundColor: 'rgba(242, 166, 90, 0.16)' }]} />
      <View style={[s.disc, { top: -40, right: -20, width: 160, height: 160, backgroundColor: 'rgba(255, 217, 168, 0.12)' }]} />
    </>
  );
}

/** Tuzla Arabesk: deep red velvet, a double gold frame with a diamond at the top and the foot. */
function Ornate() {
  return (
    <>
      {fade('#5A0D16', 0.7)}
      <View style={[s.frame, { top: 10, left: 10, right: 10, bottom: 10, borderColor: 'rgba(201, 162, 74, 0.55)' }]} />
      <View style={[s.frame, { top: 16, left: 16, right: 16, bottom: 16, borderRadius: 20, borderColor: 'rgba(201, 162, 74, 0.25)' }]} />
      <View style={[s.diamond, { top: 4 }]} />
      <View style={[s.diamond, { bottom: 4 }]} />
    </>
  );
}

/** Neon FM: the striped sun setting on the horizon, a glowing grid floor running to it. */
const SUN = 320;
const CUTS = [0.5, 0.6, 0.68, 0.76, 0.83, 0.9]; // the stripes, down the sun (0…1), thicker towards its foot
const HORIZON = 230; // px from the bottom
function Sunset() {
  return (
    <>
      {fade('#1A0838', 0.75)}
      <View style={[s.sun, { bottom: HORIZON - SUN / 2 }]}>
        <LinearGradient colors={['#FFD23F', '#FF5FA2', '#7B2FF7']} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
        {CUTS.map((y, i) => (
          <View key={i} style={{ position: 'absolute', left: 0, right: 0, top: y * SUN, height: 3 + i * 1.8, backgroundColor: colors.bg }} />
        ))}
      </View>
      <View style={[s.floor, { height: HORIZON }]}>
        <View style={s.plane}>
          {Array.from({ length: 8 }, (_, i) => (
            <View key={`r${i}`} style={[s.grid, { top: `${(i / 7) * 100}%`, left: 0, right: 0, height: 1.5 }]} />
          ))}
          {Array.from({ length: 15 }, (_, i) => (
            <View key={`c${i}`} style={[s.grid, { left: `${(i / 14) * 100}%`, top: 0, bottom: 0, width: 1.5 }]} />
          ))}
        </View>
      </View>
    </>
  );
}

/** Night Shift: a green CRT glow with scan lines over the whole page. */
function Crt() {
  return (
    <>
      {fade('#06301A', 0.65)}
      <LinearGradient colors={['rgba(57, 255, 136, 0.08)', 'rgba(57, 255, 136, 0)']} start={{ x: 0, y: 0.5 }} end={{ x: 0.25, y: 0.5 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['rgba(57, 255, 136, 0)', 'rgba(57, 255, 136, 0.08)']} start={{ x: 0.75, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      <ScanLines lines={220} />
    </>
  );
}

/** Gebze Rock: concrete grey, hazard tape across the top and a strip across the bottom corner. */
function Hazard() {
  return (
    <>
      {fade('#34312C', 0.6)}
      <Tape style={{ top: 0, left: 0, right: 0 }} />
      <Tape style={{ bottom: 150, left: -60, width: 520, transform: [{ rotate: '-8deg' }], opacity: 0.35 }} />
    </>
  );
}
function Tape({ style }: { style: object }) {
  return (
    <View style={[s.tape, style]}>
      {Array.from({ length: 30 }, (_, i) => (
        <View key={i} style={[s.stripe, { left: i * 28 - 20 }]} />
      ))}
    </View>
  );
}

/** Şemistan Chill: warm paper light and paw prints wandering across the page. */
const PAWS: [number, number, number, number][] = [
  // [left %, top %, size, rotation°]
  [72, 3, 34, 20],
  [84, 10, 30, 35],
  [8, 30, 28, -25],
  [18, 37, 32, -10],
  [78, 55, 30, 15],
  [64, 62, 34, 30],
  [10, 78, 30, -20],
  [22, 85, 28, -5],
];
function Paws() {
  return (
    <>
      {fade('#3E2C22', 0.6)}
      {PAWS.map(([x, y, size, rot], i) => (
        <View key={i} style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, transform: [{ rotate: `${rot}deg` }] }}>
          <Ionicons name="paw" size={size} color="rgba(227, 181, 143, 0.13)" />
        </View>
      ))}
    </>
  );
}

const s = StyleSheet.create({
  disc: { position: 'absolute', borderRadius: 999 },
  frame: { position: 'absolute', borderWidth: 1.5, borderRadius: 26 },
  diamond: { position: 'absolute', alignSelf: 'center', width: 14, height: 14, transform: [{ rotate: '45deg' }], borderWidth: 1.5, borderColor: '#C9A24A', backgroundColor: '#3D070D' },
  sun: { position: 'absolute', alignSelf: 'center', width: SUN, height: SUN, borderRadius: SUN / 2, overflow: 'hidden', opacity: 0.5 },
  floor: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden', backgroundColor: colors.bg },
  plane: { position: 'absolute', left: '-60%', right: '-60%', top: 0, height: 360, opacity: 0.45, transformOrigin: 'top', transform: [{ perspective: 300 }, { rotateX: '60deg' }] },
  grid: { position: 'absolute', backgroundColor: '#FF2FD0', boxShadow: '0 0 6px #FF2FD0' },
  tape: { position: 'absolute', height: 14, overflow: 'hidden', backgroundColor: '#1B1A18' },
  stripe: { position: 'absolute', top: -10, width: 14, height: 34, backgroundColor: '#F2C230', transform: [{ rotate: '45deg' }] },
});
