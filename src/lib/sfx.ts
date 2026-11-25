import { busyTone, splitBeeps } from './phoneLine';

/*
 * The radio's sound effects, made on the phone (no files, no downloads): the studio phone ringing, a phone
 * buzzing, the doorbell, a knock, Downstairs Teyze's broom on her ceiling, a dead phone line, a spoon in a tea glass, a tesbih, a
 * lighter and a cigarette, a guitar riff, the ad break's jingle, the news sting. The writer puts
 * a tag in a line ("<sfx:ring>"); the tag never reaches the voice: the sound plays before the line (a tag in
 * its first half) or after it (in its second half). 16-bit mono PCM; pure, so it's tested.
 */

export type Sfx = 'ring' | 'buzz' | 'doorbell' | 'knock' | 'ceiling' | 'busy' | 'tea' | 'tesbih' | 'cigarette' | 'riff' | 'jingle' | 'news';
export const SFX: Sfx[] = ['ring', 'buzz', 'doorbell', 'knock', 'ceiling', 'busy', 'tea', 'tesbih', 'cigarette', 'riff', 'jingle', 'news'];

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
 * A teaspoon stirring sugar in a tulip tea glass, then the two taps on the rim (tık tık) to shake the drops off:
 * Çaycı Cengiz's sound. The stir is not a row of separate taps (that's what it sounded like): the spoon circles
 * about three times a second, brushing the glass on both sides, so the clinks come fast, uneven and overlapping
 * (thin glass rings on), over the scrape of spoon and sugar on the bottom and the swirl of the tea.
 */
function tea(rate: number): Uint8Array {
  const rnd = noiseFrom(0x7f4a7c15); // the same stir every time
  const REV = 3.1; // turns a second
  // the clinks: two a turn (both sides of the glass), each a little early or late and softer or harder
  const clinks: [number, number, number][] = [];
  for (let k = 0; k < 6; k++)
    for (const side of [0, 0.5]) {
      const at = (k + side) / REV + (((k * 7 + side * 10) % 5) - 2) * 0.012;
      clinks.push([at, side ? 0.55 + ((k * 3) % 4) * 0.08 : 0.8 + ((k * 5) % 3) * 0.08, 1 + (((k * 11 + side * 6) % 7) - 3) * 0.006]);
    }
  const stirEnd = clinks[clinks.length - 1][0] + 0.05;
  const taps: [number, number, number][] = [[stirEnd + 0.28, 1.25, 1.01], [stirEnd + 0.5, 1.1, 0.995]]; // tık tık on the rim
  const glass: [number, number][] = [[3120, 1], [4580, 0.6], [6350, 0.32], [8100, 0.14]];
  const ping = (local: number, hard: number, tune: number, decay: number) => {
    const env = Math.exp(-local * decay) * Math.min(1, local / 0.0006);
    let v = 0;
    for (const [f, a] of glass) v += Math.sin(2 * Math.PI * f * tune * local) * a;
    return v * env * hard;
  };
  let low = 0; // the swirl: noise through a soft low-pass
  let prev = 0; // the scrape: noise minus its low part (a high-pass)
  let high = 0;
  const seconds = taps[1][0] + 0.7;
  return pcm(rate, seconds, (t) => {
    const n = rnd() * 2 - 1;
    low += (n - low) * 0.03;
    high = 0.85 * (high + n - prev);
    prev = n;
    let v = 0;
    if (t < stirEnd) {
      const circle = Math.abs(Math.sin(Math.PI * REV * t)); // louder as the spoon sweeps the bottom
      const fade = Math.min(1, t / 0.08, (stirEnd - t) / 0.15);
      v += (high * 0.09 * (0.4 + 0.6 * circle) + low * 0.5 * (0.5 + 0.5 * circle)) * fade;
    }
    for (const [at, hard, tune] of clinks) {
      const local = t - at;
      if (local >= 0 && local < 0.45) v += ping(local, hard, tune, 11) * 0.55;
    }
    for (const [at, hard, tune] of taps) {
      const local = t - at;
      if (local >= 0 && local < 0.7) v += ping(local, hard, tune, 6.5) * 0.7;
    }
    return v * 0.3;
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

/**
 * One plucked string (Karplus–Strong: a burst of noise running round a delay line one period long, softened
 * every pass, the way a real string loses its highs), `seconds` long. `damp` < 1 mutes it (a palm on the strings).
 */
function pluck(rate: number, freq: number, seconds: number, damp: number, rnd: () => number): Float32Array {
  const out = new Float32Array(Math.round(rate * seconds));
  const period = Math.max(2, Math.round(rate / freq));
  const line = Float32Array.from({ length: period }, () => rnd());
  for (let i = 0; i < out.length; i++) {
    const k = i % period;
    const next = line[(k + 1) % period];
    out[i] = line[k];
    line[k] = 0.5 * (line[k] + next) * 0.996 * damp;
  }
  return out;
}

/**
 * Riff's guitar: a short, original rock lick on a distorted electric (power chords: root, fifth, octave).
 * Three palm-muted chugs on E, a jump up to G and A, then a big open E5 left ringing. Gebze Rock's sound.
 */
function riff(rate: number): Uint8Array {
  const rnd = noiseFrom(0x5eed5);
  const total = Math.round(rate * 2.4);
  const mix = new Float32Array(total);
  const E2 = 82.41;
  const chord = (at: number, root: number, seconds: number, muted: boolean) => {
    for (const [ratio, gain] of [[1, 1], [1.5, 0.8], [2, 0.6]] as const) {
      const s = pluck(rate, root * ratio, seconds, muted ? 0.985 : 1, rnd);
      const from = Math.round(rate * at);
      for (let i = 0; i < s.length && from + i < total; i++) mix[from + i] += s[i] * gain * envelope(i / rate, seconds, 0.004);
    }
  };
  // chug chug chug, G5, A5, then E5 rings out
  chord(0.0, E2, 0.16, true);
  chord(0.2, E2, 0.16, true);
  chord(0.4, E2, 0.16, true);
  chord(0.62, E2 * 1.189, 0.28, false); // G
  chord(0.95, E2 * 1.335, 0.28, false); // A
  chord(1.3, E2, 1.1, false);
  // the amp: drive it into soft clipping, then take the fizz off the top
  let low = 0;
  return pcm(rate, 2.4, (_t, i) => {
    const driven = Math.tanh(mix[i] * 6);
    low += (driven - low) * 0.35;
    return low * 0.3;
  });
}

/**
 * The ad break's jingle: a cheesy, happy TV-ad tune on a plucked ukulele-ish string (the riff's Karplus–Strong
 * string, high and bright), "ba-da-ba-ba-BAAA" up a major chord to a high note that rings, a bass pluck under the
 * first and last notes and a clap on the off-beats. Bouncy and silly, so it says "advert" (a phone's bell-like
 * chime said "new message"). Original, under two seconds.
 */
function jingle(rate: number): Uint8Array {
  const rnd = noiseFrom(0x3c6ef372);
  const total = Math.round(rate * 1.7);
  const mix = new Float32Array(total);
  const C5 = 523.25;
  const add = (at: number, f: number, seconds: number, gain: number) => {
    const s = pluck(rate, f, seconds, 1, rnd);
    const from = Math.round(rate * at);
    for (let i = 0; i < s.length && from + i < total; i++) mix[from + i] += s[i] * gain * envelope(i / rate, seconds, 0.003);
  };
  // the tune: C E G A G, then up to a high C that rings out
  const tune: [number, number, number][] = [
    [0.0, C5, 0.16], [0.15, C5 * 1.26, 0.16], [0.3, C5 * 1.498, 0.16], [0.45, C5 * 1.682, 0.12], [0.57, C5 * 1.498, 0.2], [0.8, C5 * 2, 0.85],
  ];
  for (const [at, f, len] of tune) add(at, f, len, 0.9);
  add(0.8, C5 * 2 * 1.26, 0.85, 0.45); // a third on top of the last note
  add(0.0, C5 / 4, 0.4, 0.8); // the bass
  add(0.8, C5 / 4, 0.85, 0.8);
  const claps = [0.3, 0.57];
  return pcm(rate, 1.7, (t, i) => {
    let v = mix[i] * 0.55;
    for (const at of claps) if (t >= at && t < at + 0.12) v += (rnd() * 2 - 1) * 0.18 * Math.exp(-(t - at) * 30);
    return v;
  });
}

/**
 * The news sting: the parody bulletin's fanfare. Two short brass stabs on G, then the band lands on a big C chord
 * that swells and rings out, with a bass note, a kick on each hit and a clap on the landing ("ta-ta, TAAA!"). The
 * brass is a bright, buzzy tone whose top fades as it holds (a filter closing), with a little vibrato on the long
 * chord. Original, under two seconds.
 */
function news(rate: number): Uint8Array {
  const G3 = 196, C4 = 261.63;
  const third = 1.2599, fifth = 1.4983;
  // [when, root, how long, loud]: stab, stab, the landing
  const hits: [number, number, number, number][] = [
    [0.0, G3, 0.14, 0.85],
    [0.19, G3, 0.14, 0.85],
    [0.4, C4, 1.25, 1],
  ];
  // one brass voice: harmonics 1/n (a saw, but only up to 9: no fizz), the higher ones fading first
  const brass = (t: number, f: number, len: number, vib: boolean) => {
    const wobble = vib && t > 0.35 ? 1 + 0.006 * Math.sin(2 * Math.PI * 5.5 * t) : 1;
    let v = 0;
    for (let n = 1; n <= 9; n++) v += (Math.sin(2 * Math.PI * f * wobble * n * t) / n) * Math.exp(-t * n * (len > 0.5 ? 0.55 : 2.2));
    return v * envelope(t, len, 0.012) * (len > 0.5 ? Math.exp(-Math.max(0, t - 0.5) * 1.6) : 1);
  };
  const chord = (t: number, f: number, len: number, vib: boolean) => brass(t, f, len, vib) + brass(t, f * third, len, vib) * 0.8 + brass(t, f * fifth, len, vib) * 0.8 + brass(t, f * 2, len, vib) * 0.5;
  const kick = (t: number) => Math.sin(2 * Math.PI * (48 * t + (90 / 28) * (1 - Math.exp(-t * 28)))) * Math.exp(-t * 11);
  const rnd = noiseFrom(0x6a09e667); // the same clap every time
  return pcm(rate, 1.75, (t) => {
    let v = 0;
    for (const [at, f, len, loud] of hits) {
      const local = t - at;
      if (local < 0 || local > len) continue;
      v += chord(local, f, len, len > 0.5) * 0.11 * loud;
      v += Math.sin(2 * Math.PI * (f / 4) * local) * 0.22 * envelope(local, len, 0.01) * Math.exp(-local * 2); // the bass
    }
    for (const [at] of hits) if (t >= at && t < at + 0.35) v += kick(t - at) * 0.35;
    const clap = t - 0.4;
    const noise = rnd() * 2 - 1;
    if (clap >= 0 && clap < 0.2) v += noise * 0.22 * Math.exp(-clap * 22);
    return v * 0.8; // headroom: the landing's chord, bass, kick and clap together don't clip
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
    case 'riff':
      return riff(rate);
    case 'jingle':
      return jingle(rate);
    case 'news':
      return news(rate);
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
