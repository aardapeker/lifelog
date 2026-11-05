import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { inflate } from 'pako';

/*
 * The colours of an album cover, for the Radio screen's glow. The cover is shrunk to a few
 * pixels on the phone, saved as PNG, and decoded here in plain JS (no native colour library).
 */

export type Palette = { glow: string; deep: string };

const cache = new Map<string, Palette | null>();
const SIZE = 8;

export async function albumColors(url: string | null): Promise<Palette | null> {
  if (!url) return null;
  if (cache.has(url)) return cache.get(url)!;
  let palette: Palette | null = null;
  try {
    const file = new File(Paths.cache, `cover-${hash(url)}.jpg`);
    if (!file.exists) await File.downloadFileAsync(url, file);
    const img = await ImageManipulator.manipulate(file.uri).resize({ width: SIZE, height: SIZE }).renderAsync();
    const saved = await img.saveAsync({ format: SaveFormat.PNG, base64: true });
    palette = pick(decodePng(fromBase64(saved.base64 ?? '')));
    try {
      file.delete();
    } catch {}
  } catch {
    palette = null;
  }
  cache.set(url, palette);
  return palette;
}

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36);

type Rgb = [number, number, number];

/** The most vivid colour for the glow, and a darkened average for depth. */
export function pick(pixels: Rgb[]): Palette | null {
  if (!pixels.length) return null;
  const score = ([r, g, b]: Rgb) => {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max ? (max - min) / max : 0;
    return sat * (max / 255) * (max > 30 ? 1 : 0.2);
  };
  const vivid = pixels.reduce((best, p) => (score(p) > score(best) ? p : best), pixels[0]);
  const avg = pixels.reduce<Rgb>((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]).map((v) => v / pixels.length) as Rgb;
  const css = ([r, g, b]: Rgb, k = 1) => `rgb(${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(b * k)})`;
  return { glow: css(vivid), deep: css(avg, 0.45) };
}

// ── a tiny PNG reader: 8-bit RGB/RGBA, non-interlaced (what the manipulator writes) ──

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = new Map([...B64].map((c, i) => [c, i]));

export function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      ((B64_INDEX.get(clean[i]) ?? 0) << 18) |
      ((B64_INDEX.get(clean[i + 1]) ?? 0) << 12) |
      ((B64_INDEX.get(clean[i + 2]) ?? 0) << 6) |
      (B64_INDEX.get(clean[i + 3]) ?? 0);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

export function decodePng(png: Uint8Array): Rgb[] {
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let o = 8; // signature
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Uint8Array[] = [];
  while (o + 8 <= png.length) {
    const len = v.getUint32(o);
    const type = String.fromCharCode(png[o + 4], png[o + 5], png[o + 6], png[o + 7]);
    const data = png.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      width = v.getUint32(o + 8);
      height = v.getUint32(o + 12);
      colorType = png[o + 17];
      if (png[o + 16] !== 8 || png[o + 20] !== 0) return []; // only 8-bit, non-interlaced
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    o += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!bpp || !width) return [];
  const joined = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
  idat.reduce((at, d) => (joined.set(d, at), at + d.length), 0);
  const raw = inflate(joined);
  const stride = width * bpp;
  const rows: Uint8Array[] = [];
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      const add = [0, a, b, (a + b) >> 1, paeth][filter] ?? 0;
      line[x] = (line[x] + add) & 255;
    }
    rows.push(line);
    prev = line;
  }
  const out: Rgb[] = [];
  for (const row of rows) for (let x = 0; x < width; x++) out.push([row[x * bpp], row[x * bpp + 1], row[x * bpp + 2]]);
  return out;
}
