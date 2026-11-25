import { busyTone, splitBeeps } from './phoneLine';
import { RECORDED_RATE, RECORDINGS } from './sfxRecordings';

/*
 * The radio's sound effects, made on the phone (no files, no downloads): the studio phone ringing, a phone
 * buzzing, the doorbell, a knock, Downstairs Teyze's broom on her ceiling, a dead phone line, a spoon in a tea glass, a tesbih, a
 * lighter and a cigarette, a guitar riff, the ad break's jingle, the news sting. The writer puts
 * a tag in a line ("<sfx:ring>"); the tag never reaches the voice: the sound plays before the line (a tag in
 * its first half) or after it (in its second half). 16-bit mono PCM; pure, so it's tested.
 */

export type Sfx = 'ring' | 'buzz' | 'doorbell' | 'knock' | 'ceiling' | 'busy' | 'tea' | 'tesbih' | 'cigarette' | 'riff' | 'jingle' | 'news' | 'laugh' | 'applause';
export const SFX: Sfx[] = ['ring', 'buzz', 'doorbell', 'knock', 'ceiling', 'busy', 'tea', 'tesbih', 'cigarette', 'riff', 'jingle', 'news', 'laugh', 'applause'];

function pcm(rate: number, seconds: number, sample: (t: number, i: number) => number): Uint8Array {
  const n = Math.round(rate * seconds);
  const out = new Uint8Array(n * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < n; i++) view.setInt16(i * 2, Math.round(Math.max(-1, Math.min(1, sample(i / rate, i))) * 32767), true);
  return out;
}

/** Soft in and out over `edge` seconds, so nothing clicks. */
const envelope = (t: number, len: number, edge = 0.01) => Math.min(1, t / edge, (len - t) / edge);

/**
 * A recorded sound (sfxRecordings.ts: the phone ringing and buzzing, the doorbell, the knock, the guitar riff, the tea glass, the tesbih, Kemal's cigarette, the ceiling, the crowd, the news music), as PCM at `rate`. Decoded once each;
 * resampled if the voices come at another rate.
 */
const decoded: Partial<Record<keyof typeof RECORDINGS, Int16Array>> = {};
function recorded(kind: keyof typeof RECORDINGS, rate: number): Uint8Array {
  let src = decoded[kind];
  if (!src) {
    const bin = atob(RECORDINGS[kind]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    src = decoded[kind] = new Int16Array(bytes.buffer);
  }
  if (rate === RECORDED_RATE) return new Uint8Array(src.buffer.slice(0));
  const from = src;
  const ratio = RECORDED_RATE / rate;
  return pcm(rate, from.length / RECORDED_RATE, (_t, i) => {
    const at = i * ratio;
    const k = Math.floor(at);
    const a = from[Math.min(k, from.length - 1)];
    const b = from[Math.min(k + 1, from.length - 1)];
    return (a + (b - a) * (at - k)) / 32767;
  });
}

/** A fixed little noise source (xorshift), so a sound is the same every time. */
function noiseFrom(seed: number): () => number {
  let x = seed;
  return () => ((x ^= x << 13), (x ^= x >>> 17), (x ^= x << 5), ((x >>> 0) / 4294967296) * 2 - 1);
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
 * The ad break's jingle: a cheesy, happy TV-ad tune on a plucked ukulele-ish string (a Karplus–Strong
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

/** The sound, as 16-bit mono PCM at `rate`. */
export function sfxPcm(kind: Sfx, rate: number): Uint8Array {
  switch (kind) {
    case 'ring':
      return recorded('ring', rate); // an old phone's two rings (a recording)
    case 'buzz':
      return recorded('buzz', rate); // a phone buzzing on a table (a recording)
    case 'doorbell':
      return recorded('doorbell', rate); // ding dong (a recording)
    case 'knock':
      return recorded('knock', rate); // someone pounding on the door (a recording)
    case 'ceiling':
      return recorded('ceiling', rate); // the neighbour upstairs (a recording)
    case 'busy':
      return busyTone(rate);
    case 'tea':
      return recorded('tea', rate); // a spoon in a tea glass (a recording)
    case 'tesbih':
      return recorded('tesbih', rate); // beads on a string (a recording)
    case 'cigarette':
      return recorded('cigarette', rate); // a lighter, a drag, a breath out (a recording)
    case 'riff':
      return recorded('riff', rate); // Riff's electric guitar (a recording)
    case 'jingle':
      return jingle(rate);
    case 'news':
      return recorded('news', rate); // the news music's opening (a recording)
    case 'laugh':
      return recorded('laugh', rate); // the studio crowd laughing (a recording)
    case 'applause':
      return recorded('applause', rate); // the studio crowd clapping (a recording)
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
