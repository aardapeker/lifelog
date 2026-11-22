import type { Palette } from './albumColors';

/*
 * Colours from the song's cover, for the player's cards: the lyrics card is a flat shade of it (like
 * Spotify's), and "On the mic" is glass tinted with the same shade, so the screen is one theme per song.
 */

const rgbOf = (c: string) => (c.match(/\d+(\.\d+)?/g) ?? ['80', '70', '90']).slice(0, 3).map(Number);

/** a + (b − a)·t, as "rgb(…)" */
export function mix(a: string, b: string, t: number): string {
  const x = rgbOf(a);
  const y = rgbOf(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(', ')})`;
}

export const alpha = (c: string, a: number) => `rgba(${rgbOf(c).join(', ')}, ${a})`;

/** The cover's card colour (a deep, saturated shade of it) and a light tint for text on it. */
export function coverTones(p: Palette | null) {
  const glow = p?.glow ?? 'rgb(150, 110, 140)';
  const deep = p?.deep ?? 'rgb(40, 30, 40)';
  const bg = mix(deep, glow, 0.4);
  return { bg, line: alpha(mix(glow, 'rgb(255, 255, 255)', 0.55), 0.9) };
}
