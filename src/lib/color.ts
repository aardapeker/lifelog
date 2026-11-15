/** Colour helpers: "rgb(r, g, b)" / "#rrggbb" ⇄ HSL. */

export type Hsl = { h: number; s: number; l: number }; // 0–360, 0–1, 0–1

export function hslToRgb({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255);
  return `rgb(${to(r)}, ${to(g)}, ${to(b)})`;
}

/** "rgb(60, 160, 110)" (or "#3CA06E") → HSL, so the sliders start where the current colour is. */
export function toHsl(color: string): Hsl | null {
  let rgb = color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/)?.slice(1).map(Number);
  const hex = color.match(/^#([0-9a-f]{6})$/i)?.[1];
  if (!rgb && hex) rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s, l };
}
