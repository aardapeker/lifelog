/*
 * Makes a voice sound like it's coming down a phone line: radio callers and live reports.
 * A phone only carries roughly 300–3400 Hz, so the bass and the highs go, the voice gets a little
 * crunch (soft clipping) and a faint hiss under it. Works on 16-bit mono PCM, little-endian.
 */

/** One RBJ biquad filter (low-pass or high-pass), run over the samples in place. */
function biquad(x: Float32Array, rate: number, kind: 'low' | 'high', freq: number): void {
  const w = (2 * Math.PI * freq) / rate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * Math.SQRT1_2); // Q = 0.707, no resonance bump
  const a0 = 1 + alpha;
  const [b0, b1, b2] = kind === 'low' ? [(1 - cos) / 2, 1 - cos, (1 - cos) / 2] : [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = y;
    x[i] = y;
  }
}

/** The phone-line version of `pcm` (same length, same rate). */
export function phoneFilter(pcm: Uint8Array, rate: number): Uint8Array {
  const n = Math.floor(pcm.length / 2);
  const src = new DataView(pcm.buffer, pcm.byteOffset, n * 2);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = src.getInt16(i * 2, true) / 32768;
  // two passes each way: a steeper edge, closer to a real phone band
  biquad(x, rate, 'high', 350);
  biquad(x, rate, 'high', 350);
  biquad(x, rate, 'low', 3200);
  biquad(x, rate, 'low', 3200);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(x[i]));
  const drive = peak > 0 ? 2.2 / peak : 1; // the loudest part hits the clipper the same way on any clip
  const level = 0.8 / Math.tanh(2.2);
  const out = new Uint8Array(n * 2);
  const dst = new DataView(out.buffer);
  let seed = 12345; // a fixed little noise generator: the same hiss every time, no Math.random
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const hiss = ((seed / 0x7fffffff) * 2 - 1) * 0.006;
    const y = Math.tanh(x[i] * drive) * level + hiss;
    dst.setInt16(i * 2, Math.max(-32768, Math.min(32767, Math.round(y * 32767))), true);
  }
  return out;
}
