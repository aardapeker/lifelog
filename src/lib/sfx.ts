import { busyTone, splitBeeps } from './phoneLine';
import { RECORDED_RATE, RECORDINGS } from './sfxRecordings';

/*
 * The radio's sound effects: the studio phone ringing, a phone buzzing, the doorbell, a knock, the neighbour
 * banging on the ceiling, a dead phone line, a spoon in a tea glass, a tesbih, a lighter and a cigarette, a guitar
 * riff, a laughing and a clapping crowd, the ad break's jingle, the news music. All recordings (sfxRecordings.ts,
 * free sounds Arda found on Pixabay) except the busy tone, which is just beeps (phoneLine.ts). The writer puts a
 * tag in a line ("<sfx:ring>"); the tag never reaches the voice: the sound plays before the line (a tag in its
 * first half) or after it (in its second half). 16-bit mono PCM; pure, so it's tested.
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
/** A recorded sound as PCM at `rate`: decoded once each, resampled if the voices come at another rate. */
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

/** The sound, as 16-bit mono PCM at `rate`. */
export function sfxPcm(kind: Sfx, rate: number): Uint8Array {
  return kind === 'busy' ? busyTone(rate) : recorded(kind, rate);
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
