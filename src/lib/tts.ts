import { fetch } from 'expo/fetch';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Speech from 'expo-speech';
import { jsonHeaders } from './gemini';
import { getKey } from './keys';

/*
 * A voice that sounds like a person: Gemini's text-to-speech (same Gemini key as everything else).
 * The style is plain English ("warm late-night radio DJ"), the language is detected from the text.
 * If there's no key or the call fails, Android's own (robotic) voice steps in, so the show goes on.
 */

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
// newest first; the first one that works on this key is remembered for the session
const MODELS = ['gemini-3.8-flash-tts', 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts'];

export type VoiceStyle = { voice: string; style: string };
/** One spoken line; `speaker` is the persona's name when a show has two voices. */
export type SpokenLine = { speaker: string; text: string };
type Cast = (VoiceStyle & { name: string })[];

/** Speaker ids must be simple: "Kaan \"Riff\" Demir" → "Speaker1"-style, stable per cast slot. */
const speakerOf = (name: string, cast: { name: string }[]) => `Speaker${Math.max(0, cast.findIndex((c) => c.name === name)) + 1}`;
const styleOf = (name: string, cast: Cast) => (cast.find((c) => c.name === name) ?? cast[0]).style;

/** The newer Interactions API (what Google documents for its current TTS models). Returns WAV bytes. */
async function viaInteractions(apiKey: string, model: string, lines: SpokenLine[], cast: Cast): Promise<Uint8Array> {
  const duo = cast.length > 1;
  const res = await fetch(`${BASE}/interactions`, {
    method: 'POST',
    headers: jsonHeaders(apiKey),
    body: JSON.stringify({
      model,
      input: [
        {
          type: 'user_input',
          content: lines.map((l) => ({
            type: 'text',
            text: l.text,
            annotations: [
              { type: 'speech_metadata', style: styleOf(l.speaker, cast), ...(duo ? { speaker: speakerOf(l.speaker, cast) } : {}) },
            ],
          })),
        },
      ],
      response_format: { type: 'audio' },
      generation_config: {
        speech_config: duo
          ? { mode: 'conversational', speakers: cast.map((c) => ({ speaker: speakerOf(c.name, cast), voice: c.voice })) }
          : [{ voice: cast[0].voice }],
      },
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);
  const json = (await res.json()) as { steps?: { type: string; content?: { type: string; data?: string; mime_type?: string }[] }[] };
  const audio = (json.steps ?? [])
    .filter((s) => s.type === 'model_output')
    .flatMap((s) => s.content ?? [])
    .filter((c) => c.type === 'audio' && c.data)
    .pop();
  if (!audio?.data) throw new Error('no audio in the reply');
  const bytes = fromBase64(audio.data);
  return isWav(bytes) ? bytes : wav(bytes, 24000);
}

/** The classic generateContent route (responseModalities AUDIO). Returns WAV bytes. */
async function viaGenerate(apiKey: string, model: string, lines: SpokenLine[], cast: Cast): Promise<Uint8Array> {
  const duo = cast.length > 1;
  const voiceOf = (v: string) => ({ prebuiltVoiceConfig: { voiceName: v } });
  const direction = cast.map((c) => `${duo ? speakerOf(c.name, cast) : 'Read'} as ${c.style}`).join('; ');
  const script = lines.map((l) => (duo ? `${speakerOf(l.speaker, cast)}: ${l.text}` : l.text)).join('\n');
  const res = await fetch(`${BASE}/models/${model}:generateContent`, {
    method: 'POST',
    headers: jsonHeaders(apiKey),
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${direction}.\n\n${script}` }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: duo
          ? {
              multiSpeakerVoiceConfig: {
                speakerVoiceConfigs: cast.map((c) => ({ speaker: speakerOf(c.name, cast), voiceConfig: voiceOf(c.voice) })),
              },
            }
          : { voiceConfig: voiceOf(cast[0].voice) },
      },
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[];
  };
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  if (!part?.data) throw new Error('no audio in the reply');
  const bytes = fromBase64(part.data);
  const rate = Number(/rate=(\d+)/.exec(part.mimeType ?? '')?.[1] ?? 24000);
  return isWav(bytes) ? bytes : wav(bytes, rate);
}

type Route = { model: string; call: typeof viaInteractions };
const ROUTES: Route[] = MODELS.flatMap((model) => [
  { model, call: viaInteractions },
  { model, call: viaGenerate },
]);
let working: Route | null = null; // the route that worked last time
let failure: { at: number; message: string } | null = null; // everything failed: don't hammer the API

/** One voice, one or more lines: tries every route (remembering what works) and returns WAV bytes. */
async function voiceBytes(apiKey: string, lines: SpokenLine[], cast: Cast): Promise<Uint8Array> {
  if (failure && Date.now() - failure.at < 3 * 60_000) throw new Error(failure.message);
  const errors: string[] = [];
  for (const route of working ? [working, ...ROUTES.filter((r) => r !== working)] : ROUTES) {
    try {
      const bytes = await route.call(apiKey, route.model, lines, cast);
      working = route;
      failure = null;
      return bytes;
    } catch (e) {
      errors.push(`${route.model} (${route.call === viaInteractions ? 'interactions' : 'generate'}): ${e instanceof Error ? e.message : e}`);
      if (/\b(401|403)\b/.test(String(e)) && /API key/i.test(String(e))) break; // a bad key fails everywhere
    }
  }
  failure = { at: Date.now(), message: `Natural voice failed. ${errors.join(' | ')}` };
  throw new Error(failure.message);
}

/**
 * Turns one or two people talking into a .wav file in the cache and returns its uri.
 * Every line is voiced on its own, in its speaker's voice (Gemini's two-speaker mode sometimes
 * dropped the second person), then the lines are joined with short pauses, like a real exchange.
 */
export async function synthesize(lines: SpokenLine[], cast: Cast): Promise<string> {
  const apiKey = await getKey('gemini');
  if (!apiKey) throw new Error('A natural voice needs a Gemini key.');
  const voiceFor = (name: string) => cast.find((c) => c.name === name) ?? cast[0];
  const parts = await Promise.all(lines.map((l) => voiceBytes(apiKey, [l], [voiceFor(l.speaker)])));
  const file = new File(Paths.cache, `voice-${Date.now()}-${Math.round(Math.random() * 1e6)}.wav`);
  file.create();
  await file.write(joinWavs(parts, 0.35));
  return file.uri;
}

// ── bytes ──

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = new Map([...B64].map((c, i) => [c, i]));

function fromBase64(s: string): Uint8Array {
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

const isWav = (b: Uint8Array) => b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46;

/** Wraps raw 16-bit mono PCM in a WAV header so the player can open it. */
export function wav(pcm: Uint8Array, rate: number): Uint8Array {
  const out = new Uint8Array(44 + pcm.length);
  const v = new DataView(out.buffer);
  const str = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

export type Talking = { done: Promise<boolean>; stop: () => void }; // done: true if it finished, false if stopped

/**
 * Plays a voice clip and reports when it's over. The "finished" event doesn't always arrive on
 * Android, so it also watches the position itself, with a hard stop after 90 s: a clip can never
 * leave the show hanging.
 */
export function playClip(uri: string): Talking {
  const player = createAudioPlayer(uri);
  let settle: (finished: boolean) => void = () => {};
  const done = new Promise<boolean>((r) => (settle = r));
  let over = false;
  let started = false;
  const end = (finished: boolean) => {
    if (over) return;
    over = true;
    clearTimeout(guard);
    clearInterval(watch);
    sub.remove();
    try {
      player.remove();
    } catch {}
    settle(finished);
  };
  const guard = setTimeout(() => end(true), 90_000);
  const sub = player.addListener('playbackStatusUpdate', (s) => {
    if (s.playing) started = true;
    if (s.didJustFinish || (started && s.isLoaded && s.duration > 0 && !s.playing && s.currentTime >= s.duration - 0.3)) {
      end(true);
    }
  });
  const watch = setInterval(() => {
    try {
      if (player.playing) started = true;
      const d = player.duration;
      if (started && d > 0 && !player.playing && player.currentTime >= d - 0.3) end(true);
    } catch {}
  }, 400);
  radioAudioMode().finally(() => player.play());
  return {
    done,
    stop: () => {
      try {
        player.pause();
      } catch {}
      end(false);
    },
  };
}

/** The audio settings for the radio voices: keep playing in the background, mix with Spotify. */
export const radioAudioMode = () =>
  setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'mixWithOthers' }).catch(
    () => {},
  );

/** Android's built-in voice, the fallback. */
export function speakRobot(text: string, language: string): Talking {
  let settle: (finished: boolean) => void = () => {};
  const done = new Promise<boolean>((r) => (settle = r));
  Speech.speak(text, { language, onDone: () => settle(true), onError: () => settle(true), onStopped: () => settle(false) });
  return { done, stop: () => Speech.stop() };
}

/** Deletes the voice clips left in the cache. */
export function clearClips(): void {
  try {
    for (const f of Paths.cache.list()) {
      if (f instanceof File && /^voice-.*\.wav$/.test(f.name)) f.delete();
    }
  } catch {}
}

/** Where the samples start in a WAV file, and its sample rate. */
function pcmOf(w: Uint8Array): { pcm: Uint8Array; rate: number } {
  const v = new DataView(w.buffer, w.byteOffset, w.byteLength);
  let rate = 24000;
  let o = 12;
  while (o + 8 <= w.length) {
    const id = String.fromCharCode(w[o], w[o + 1], w[o + 2], w[o + 3]);
    const size = v.getUint32(o + 4, true);
    if (id === 'fmt ') rate = v.getUint32(o + 12, true);
    if (id === 'data') return { pcm: w.subarray(o + 8, Math.min(w.length, o + 8 + size)), rate };
    o += 8 + size + (size % 2);
  }
  return { pcm: w.subarray(44), rate };
}

/** Joins WAV clips (16-bit mono) into one, with `gap` seconds of silence between them. */
export function joinWavs(clips: Uint8Array[], gap: number): Uint8Array {
  if (clips.length === 1) return clips[0];
  const parts = clips.map(pcmOf);
  const rate = parts[0]?.rate ?? 24000;
  const silence = new Uint8Array(Math.round(rate * gap) * 2);
  const total = parts.reduce((n, p, i) => n + p.pcm.length + (i ? silence.length : 0), 0);
  const pcm = new Uint8Array(total);
  let o = 0;
  parts.forEach((p, i) => {
    if (i) o += silence.length;
    pcm.set(p.pcm, o);
    o += p.pcm.length;
  });
  return wav(pcm, rate);
}
