import { busyTone, splitBeeps } from './phoneLine';

/*
 * The radio's sound effects, made on the phone (no files, no downloads): the studio phone ringing, a phone
 * buzzing, the doorbell, a knock, Downstairs Teyze's broom on her ceiling, a dead phone line, a spoon in a tea glass, a tesbih, a
 * lighter and a cigarette. The writer puts
 * a tag in a line ("<sfx:ring>"); the tag never reaches the voice: the sound plays before the line (a tag in
 * its first half) or after it (in its second half). 16-bit mono PCM; pure, so it's tested.
 */

export type Sfx = 'ring' | 'buzz' | 'doorbell' | 'knock' | 'ceiling' | 'busy' | 'tea' | 'tesbih' | 'cigarette';
export const SFX: Sfx[] = ['ring', 'buzz', 'doorbell', 'knock', 'ceiling', 'busy', 'tea', 'tesbih', 'cigarette'];

function pcm(rate: number, seconds: number, sample: (t: number, i: number) => number): Uint8Array {
  const n = Math.round(rate * seconds);
  const out = new Uint8Array(n * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < n; i++) view.setInt16(i * 2, Math.round(Math.max(-1, Math.min(1, sample(i / rate, i))) * 32767), true);
  return out;
}

/** Soft in and out over `edge` seconds, so nothing clicks. */
const envelope = (t: number, len: number, edge = 0.01) => Math.min(1, t / edge, (len - t) / edge);

/** An old phone's bell, "brrring… brrring": 440 + 480 Hz trembling 20 times a second, two rings. */
function ring(rate: number): Uint8Array {
  return pcm(rate, 3, (t) => {
    const on = t < 1.1 || (t >= 1.6 && t < 2.7);
    if (!on) return 0;
    const local = t < 1.1 ? t : t - 1.6;
    const tremble = 0.5 + 0.5 * Math.sign(Math.sin(2 * Math.PI * 20 * t));
    return (Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 480 * t)) * 0.16 * tremble * envelope(local, 1.1);
  });
}

/** A phone vibrating on a table: a rough 170 Hz hum, two bursts. */
function buzz(rate: number): Uint8Array {
  return pcm(rate, 1.1, (t) => {
    const on = t < 0.4 || (t >= 0.6 && t < 1.0);
    if (!on) return 0;
    const local = t < 0.4 ? t : t - 0.6;
    const s = Math.sin(2 * Math.PI * 170 * t);
    return (Math.sign(s) * 0.6 + s * 0.4) * 0.22 * envelope(local, 0.4, 0.02);
  });
}

/** "Ding-dong": two bell notes (E5, C5) with an overtone, ringing out. */
function doorbell(rate: number): Uint8Array {
  const note = (t: number, f: number) => (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 2.76 * t)) * Math.exp(-t * 2.6);
  return pcm(rate, 1.8, (t) => 0.3 * (note(t, 659) * envelope(t, 10, 0.005) + (t >= 0.55 ? note(t - 0.55, 523) * envelope(t - 0.55, 10, 0.005) : 0)));
}

/** Knuckles on a door (three dull knocks), or a broom on the ceiling from below (three deeper, heavier thumps). */
function thumps(rate: number, deep: boolean): Uint8Array {
  const gap = deep ? 0.42 : 0.24;
  const pitch = deep ? 70 : 140;
  return pcm(rate, gap * 3 + 0.3, (t) => {
    let v = 0;
    for (let k = 0; k < 3; k++) {
      const local = t - k * gap;
      if (local < 0 || local > 0.25) continue;
      const decay = Math.exp(-local * (deep ? 22 : 38));
      // a low body (the wood) and a short click on top
      v += (Math.sin(2 * Math.PI * pitch * local) * 0.8 + (Math.random() * 2 - 1) * 0.35 * Math.exp(-local * 120)) * decay;
    }
    return v * (deep ? 0.5 : 0.42);
  });
}

/**
 * A teaspoon stirring sugar in a tulip tea glass: quick little clinks of thin glass (a few high, slightly
 * out-of-tune partials that ring for a moment), a bit uneven, the way a hand stirs. Çaycı Cengiz's sound.
 */
function tea(rate: number): Uint8Array {
  // when each clink lands, and how hard (a fixed pattern: the same stir every time, no randomness in the timing)
  const clinks: [number, number][] = [
    [0.0, 0.9], [0.17, 0.6], [0.31, 0.85], [0.46, 0.55], [0.6, 0.8], [0.75, 0.5], [0.88, 0.75], [1.03, 0.45], [1.15, 0.7], [1.42, 1],
  ];
  const partials: [number, number][] = [[2950, 1], [4420, 0.55], [6180, 0.3], [7900, 0.15]];
  return pcm(rate, 1.9, (t) => {
    let v = 0;
    for (const [at, hard] of clinks) {
      const local = t - at;
      if (local < 0 || local > 0.35) continue;
      const ring = Math.exp(-local * 26) * Math.min(1, local / 0.0008);
      // each clink a hair higher or lower, like a spoon hitting a slightly different spot
      const tune = 1 + (at * 7.3 % 1 - 0.5) * 0.03;
      for (const [f, a] of partials) v += Math.sin(2 * Math.PI * f * tune * local) * a * ring * hard;
    }
    return v * 0.16;
  });
}

/**
 * A tesbih between the fingers, the kahvehane way: beads dropping one by one onto the others with a dry little
 * clack (stone or amber: a short knock with a woody ring around 1.8–3.4 kHz), steady, then a quick run of
 * three as the thumb flicks them, and the tassel end. Kederli Kemal's sound.
 */
function tesbih(rate: number): Uint8Array {
  const clacks: [number, number][] = [
    [0.0, 0.8], [0.34, 0.7], [0.66, 0.85], [0.98, 0.65], [1.3, 0.8], [1.5, 0.55], [1.58, 0.6], [1.66, 0.7], [2.0, 0.75], [2.33, 0.9],
  ];
  const partials: [number, number][] = [[1850, 1], [2620, 0.6], [3380, 0.35]];
  const rnd = noiseFrom(0x2545f491); // the same tesbih every time
  return pcm(rate, 2.6, (t) => {
    let v = 0;
    for (const [at, hard] of clacks) {
      const local = t - at;
      if (local < 0 || local > 0.09) continue;
      const tune = 1 + ((at * 5.1) % 1 - 0.5) * 0.06; // no two beads quite alike
      const body = partials.reduce((sum, [f, a]) => sum + Math.sin(2 * Math.PI * f * tune * local) * a, 0) * Math.exp(-local * 70);
      const click = rnd() * Math.exp(-local * 600) * 0.6; // the hard tick of bead on bead
      v += (body + click) * hard;
    }
    return v * 0.2;
  });
}

/** A fixed little noise source (xorshift), so a sound is the same every time. */
function noiseFrom(seed: number): () => number {
  let x = seed;
  return () => ((x ^= x << 13), (x ^= x >>> 17), (x ^= x << 5), ((x >>> 0) / 4294967296) * 2 - 1);
}

/**
 * Lighting one up: the lighter's wheel scratching the flint (a gritty little scrape), the flame catching (a
 * soft whoosh), then a long drag: the paper and tobacco crackling quietly as it burns. Kederli Kemal's sound.
 */
function cigarette(rate: number): Uint8Array {
  const rnd = noiseFrom(0x1f2e3d4c);
  let low = 0; // a one-pole low-pass for the whoosh and the drag
  let high = 0; // and a high-pass (the noise minus its low part) for the scrape
  const crackles = Array.from({ length: 26 }, (_, k) => 0.75 + k * 0.05 + (((k * 7919) % 13) / 13) * 0.04); // when the paper pops
  return pcm(rate, 2.3, (t) => {
    const n = rnd();
    low += (n - low) * 0.06;
    high = n - low;
    let v = 0;
    // the wheel: two quick scrapes, 50 ms each, the second strikes
    for (const at of [0, 0.12]) {
      const local = t - at;
      if (local >= 0 && local < 0.05) v += high * 0.9 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 180 * local)) * envelope(local, 0.05, 0.005);
    }
    // the flame: a whoosh that swells and settles
    const flame = t - 0.17;
    if (flame >= 0 && flame < 0.55) v += low * 2.4 * Math.sin(Math.PI * Math.min(1, flame / 0.55)) * Math.exp(-flame * 2);
    // the drag: a quiet breath of burning, with little pops of crackle
    const drag = t - 0.7;
    if (drag >= 0 && drag < 1.5) {
      v += low * 1.1 * envelope(drag, 1.5, 0.25);
      for (const at of crackles) {
        const local = t - at;
        if (local >= 0 && local < 0.012) v += n * 0.5 * Math.exp(-local * 400);
      }
    }
    return v * 0.5;
  });
}

/** The sound, as 16-bit mono PCM at `rate`. */
export function sfxPcm(kind: Sfx, rate: number): Uint8Array {
  switch (kind) {
    case 'ring':
      return ring(rate);
    case 'buzz':
      return buzz(rate);
    case 'doorbell':
      return doorbell(rate);
    case 'knock':
      return thumps(rate, false);
    case 'ceiling':
      return thumps(rate, true);
    case 'busy':
      return busyTone(rate);
    case 'tea':
      return tea(rate);
    case 'tesbih':
      return tesbih(rate);
    case 'cigarette':
      return cigarette(rate);
  }
}

/**
 * A line's sound effects taken out: "<sfx:ring> Alo, Gebze Rock?" → before: ring, text "Alo, Gebze Rock?".
 * A spoken "düt düt düt" at the end counts as the busy tone too (that's how the writers used to do it).
 */
export function splitSfx(text: string): { text: string; before: Sfx[]; after: Sfx[] } {
  const before: Sfx[] = [];
  const after: Sfx[] = [];
  const tag = /<sfx:([a-z]+)>/gi;
  const plainLength = text.replace(tag, '').trim().length;
  let seen = 0; // characters of words before the tag
  let last = 0;
  for (const m of text.matchAll(tag)) {
    seen += text.slice(last, m.index).length;
    last = (m.index ?? 0) + m[0].length;
    const kind = m[1].toLowerCase() as Sfx;
    if (!SFX.includes(kind)) continue;
    (seen <= plainLength / 2 ? before : after).push(kind);
  }
  const words = text.replace(tag, ' ').replace(/\s+/g, ' ').trim();
  const beeps = splitBeeps(words);
  if (beeps.beeps && !after.includes('busy')) after.push('busy');
  return { text: beeps.text, before, after };
}
