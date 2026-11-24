import { fetch } from 'expo/fetch';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import { jsonHeaders } from './gemini';
import { onBeat, waitMs } from './heartbeat';
import { phoneFilter } from './phoneLine';
import { sfxPcm, splitSfx, type Sfx } from './sfx';
import { getKey } from './keys';
import { recordUsage, textTokens } from './usage';

/*
 * A voice that sounds like a person: Gemini's text-to-speech (same Gemini key as everything else).
 * The style is plain English ("warm late-night radio DJ"), the language is detected from the text.
 * If there's no key or the call fails, the talk is skipped with a message (no robot voice), so the show goes on.
 */

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
// newest first; the first one that works on this key is remembered for the session
// only the two cheap voice models: the 3.1 preview (3x the price) and the 2.5 preview used to step in
// when their daily limits ran out, and quietly became the biggest part of the bill. When both are used
// up, the hosts skip their talks (with a message) until the quota resets.
const MODELS = ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts'];

export type VoiceStyle = { voice: string; style: string };
/** One spoken line; `speaker` is the persona's name when a show has two voices. */
export type SpokenLine = { speaker: string; text: string };
/** `phone`: this person is on a phone line (a radio caller), so their lines sound like one. */
type Cast = (VoiceStyle & { name: string; phone?: boolean })[];

/** Speaker ids must be simple: "Kaan \"Riff\" Demir" → "Speaker1"-style, stable per cast slot. */
const speakerOf = (name: string, cast: { name: string }[]) => `Speaker${Math.max(0, cast.findIndex((c) => c.name === name)) + 1}`;
const styleOf = (name: string, cast: Cast) => (cast.find((c) => c.name === name) ?? cast[0]).style;

/** The newer Interactions API (what Google documents for its current TTS models). Returns WAV bytes. */
async function viaInteractions(apiKey: string, model: string, lines: SpokenLine[], cast: Cast): Promise<Uint8Array> {
  const duo = cast.length > 1;
  const res = await voiceFetch(`${BASE}/interactions`, {
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

/**
 * The voice request, made for the servis's weak signal. A talk comes back as ~1 MB of audio, and on a
 * slow line that download alone can take minutes: the old fixed 60 s deadline cut it off every time, so
 * on slow internet no talk ever arrived (retrying didn't help, each try was cut off the same way).
 * Now it only gives up when the line is really stuck: no answer at all within 90 s, or the download
 * stopping for 30 s. A slow but moving download is allowed up to 5 minutes. (XMLHttpRequest, not fetch:
 * only it reports progress on React Native.)
 */
const FIRST_BYTE_MS = 90_000; // the voice is made before anything comes back (long talks take a while)
const STALL_MS = 30_000;
const MAX_MS = 5 * 60_000;
function voiceFetch(url: string, init: { method: string; headers: Record<string, string>; body: string }): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const startedAt = Date.now();
    let lastByte = 0; // when the last piece of the answer arrived (0: nothing yet)
    let over = false;
    const finish = (f: () => void) => {
      if (over) return;
      over = true;
      clearInterval(watch);
      f();
    };
    const watch = setInterval(() => {
      const now = Date.now();
      const why =
        now - startedAt > MAX_MS
          ? `took over ${MAX_MS / 60_000} minutes`
          : !lastByte && now - startedAt > FIRST_BYTE_MS
            ? `no answer in ${FIRST_BYTE_MS / 1000} s`
            : lastByte && now - lastByte > STALL_MS
              ? `download stalled for ${STALL_MS / 1000} s`
              : null;
      if (!why) return;
      finish(() => {
        try {
          xhr.abort();
        } catch {}
        reject(new Error(`Voice request timed out: ${why} (slow internet)`));
      });
    }, 1000);
    xhr.open(init.method, url);
    for (const [k, v] of Object.entries(init.headers)) xhr.setRequestHeader(k, v);
    xhr.onprogress = () => (lastByte = Date.now());
    xhr.onload = () => finish(() => resolve(new Response(xhr.responseText, { status: xhr.status, statusText: xhr.statusText })));
    xhr.onerror = () => finish(() => reject(new Error('Network request failed')));
    xhr.ontimeout = () => finish(() => reject(new Error('Voice request timed out (slow internet)')));
    xhr.send(init.body);
  });
}

/** The classic generateContent route (responseModalities AUDIO). Returns WAV bytes. */
async function viaGenerate(apiKey: string, model: string, lines: SpokenLine[], cast: Cast): Promise<Uint8Array> {
  const duo = cast.length > 1;
  const voiceOf = (v: string) => ({ prebuiltVoiceConfig: { voiceName: v } });
  const direction = cast.map((c) => `${duo ? speakerOf(c.name, cast) : 'Read'} as ${c.style}`).join('; ');
  const script = lines.map((l) => (duo ? `${speakerOf(l.speaker, cast)}: ${l.text}` : l.text)).join('\n');
  const res = await voiceFetch(`${BASE}/models/${model}:generateContent`, {
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
// which way of calling (interactions or generate) worked last, per model. Only the WAY is
// remembered, never the model: the preferred voice is always tried first again (a backup that
// stepped in once used to stick for the rest of the session)
const worksVia = new Map<string, Route['call']>();
// a model that just failed sits out for 2 minutes, so each talk doesn't wait on it again
const resting = new Map<string, number>();
const REST_MS = 2 * 60_000;
export const VOICE_MODELS = [
  { id: 'gemini-3.8-flash-tts', label: '3.8 Flash TTS' },
  { id: 'gemini-3.8-flash-lite-tts', label: '3.8 Flash-Lite TTS' },
];
let preferred = MODELS[0];
/** Settings → AI Models: which voice model goes first (the others stay as backups). */
export function preferVoiceModel(model: string): void {
  if (!MODELS.includes(model) || model === preferred) return;
  preferred = model;
}
/** Preferred model first, then the others; within a model, the call that worked last time first. */
const routesInOrder = () =>
  [preferred, ...MODELS.filter((m) => m !== preferred)].flatMap((model) =>
    ROUTES.filter((r) => r.model === model).sort((a, b) => Number(worksVia.get(model) === b.call) - Number(worksVia.get(model) === a.call)),
  );
let failure: { at: number; message: string } | null = null; // everything failed: don't hammer the API
// models whose DAILY quota ran out (each model has its own): skipped until tomorrow, no waiting on them
const spent = new Map<string, string>();
/**
 * Google's daily limits reset at midnight Pacific time (11:00 in Istanbul, 10:00 during US daylight time).
 * US daylight time: second Sunday of March to first Sunday of November, 2 a.m.
 */
function pacificOffsetH(at: Date): number {
  const y = at.getUTCFullYear();
  const sunday = (month: number, nth: number) => {
    const first = new Date(Date.UTC(y, month, 1)).getUTCDay();
    return 1 + ((7 - first) % 7) + (nth - 1) * 7;
  };
  const dstStart = Date.UTC(y, 2, sunday(2, 2), 10); // 2 a.m. PST = 10:00 UTC
  const dstEnd = Date.UTC(y, 10, sunday(10, 1), 9); // 2 a.m. PDT = 09:00 UTC
  return at.getTime() >= dstStart && at.getTime() < dstEnd ? -7 : -8;
}
/** Today's date in Pacific time: a model "spent" today is skipped until Google resets it. */
const today = () => {
  const now = new Date();
  return new Date(now.getTime() + pacificOffsetH(now) * 3600_000).toISOString().slice(0, 10);
};
/** When the daily voice limits come back, in the phone's own time ("11:00"). */
export function voiceQuotaReset(): string {
  const now = new Date();
  const off = pacificOffsetH(now);
  const pacific = new Date(now.getTime() + off * 3600_000);
  const midnight = Date.UTC(pacific.getUTCFullYear(), pacific.getUTCMonth(), pacific.getUTCDate() + 1) - off * 3600_000;
  const at = new Date(midnight);
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}
const offline = (e: unknown) =>
  /UnknownHost|Unable to resolve host|Network request failed|failed to fetch|SocketTimeout|ConnectException|timed? ?out/i.test(String(e));
// the prepaid balance ran out (Google says "check your plan and billing details")
const credits = (e: unknown) => /\b429\b/.test(String(e)) && /plan and billing|billing details|prepay/i.test(String(e));
// Google words it several ways: "per day", "PerDay", "per_day", "requests_per_model_per_day", "RPD"
const dailyLimit = (e: unknown) => /\b429\b/.test(String(e)) && /per[ _-]?day|perday|daily|\bRPD\b/i.test(String(e));

/**
 * "Too many requests" / "busy" (429, 503) is a speed limit, not a failure: wait and try again
 * (6 s, then 15 s) before giving up on this route. Waits survive the background (heartbeat).
 */
async function withRetry<T>(call: () => Promise<T>): Promise<T> {
  for (const pause of [6000, 15000, 0]) {
    try {
      return await call();
    } catch (e) {
      // a daily limit won't lift in 15 seconds: hand over to the next model right away
      if (!pause || !/\b(429|503)\b/.test(String(e)) || dailyLimit(e) || credits(e)) throw e; // no point waiting on an empty balance
      await waitMs(pause);
    }
  }
  throw new Error('unreachable');
}

/** Audio is billed at 25 tokens a second: count the seconds in the WAV. */
function recordVoice(model: string, lines: SpokenLine[], cast: Cast, bytes: Uint8Array) {
  recordUsage({
    provider: 'gemini',
    model,
    feature: 'voice',
    input: textTokens(lines.map((l) => l.text).join(' ') + cast.map((c) => c.style).join(' ')),
    output: wavSeconds(bytes) * 25,
  });
}

let duoMisses = 0; // two-voice requests that failed for a reason other than limits
/**
 * One request with both voices. A try only: if it fails (a model refusing the two-speaker setup,
 * say), nothing is marked as failed or resting, and the talk is voiced line by line as before.
 * After a few such misses it stops trying for this session.
 */
async function tryDuo(apiKey: string, lines: SpokenLine[], cast: Cast): Promise<Uint8Array | null> {
  if (duoMisses >= 3) return null;
  for (const route of routesInOrder()) {
    if (spent.get(route.model) === today() || Date.now() - (resting.get(route.model) ?? 0) < REST_MS) continue;
    try {
      const bytes = await withRetry(() => route.call(apiKey, route.model, lines, cast)); // a per-minute limit: wait and retry
      recordVoice(route.model, lines, cast, bytes);
      return bytes;
    } catch (e) {
      if (offline(e)) return null;
      if (dailyLimit(e)) spent.set(route.model, today());
      if (/\b429\b/.test(String(e))) continue; // a limit, not the two-speaker setup
      duoMisses++;
    }
  }
  return null;
}

/** One voice, one or more lines: tries every route (remembering what works) and returns WAV bytes. */
async function voiceBytes(apiKey: string, lines: SpokenLine[], cast: Cast): Promise<Uint8Array> {
  if (failure && Date.now() - failure.at < 20_000) throw new Error(failure.message);
  const errors: string[] = [];
  const order = routesInOrder();
  // if every model is resting, try anyway rather than going robotic
  const allResting = MODELS.every((m) => Date.now() - (resting.get(m) ?? 0) < REST_MS);
  const failedHere = new Map<string, number>();
  for (const route of order) {
    if (spent.get(route.model) === today()) continue;
    if (!allResting && !failedHere.has(route.model) && Date.now() - (resting.get(route.model) ?? 0) < REST_MS) continue;
    try {
      const bytes = await withRetry(() => route.call(apiKey, route.model, lines, cast));
      recordVoice(route.model, lines, cast, bytes);
      worksVia.set(route.model, route.call);
      resting.delete(route.model);
      failure = null;
      return bytes;
    } catch (e) {
      // no internet (a tunnel, the servis between towers): every model would fail the same way,
      // and it isn't their fault, so stop here and don't make them rest
      if (offline(e)) {
        errors.push(String(e));
        break;
      }
      if (dailyLimit(e)) spent.set(route.model, today());
      failedHere.set(route.model, (failedHere.get(route.model) ?? 0) + 1);
      // both ways failed for this model: let it rest a little, then it's first in line again
      if (failedHere.get(route.model) === ROUTES.filter((r) => r.model === route.model).length) resting.set(route.model, Date.now());
      errors.push(`${route.model} (${route.call === viaInteractions ? 'interactions' : 'generate'}): ${e instanceof Error ? e.message : e}`);
      if (/\b(401|403)\b/.test(String(e)) && /API key/i.test(String(e))) break; // a bad key fails everywhere
    }
  }
  const allSpent = MODELS.every((m) => spent.get(m) === today());
  failure = {
    at: Date.now(),
    message: errors.some(offline)
      ? '📶 No internet right now, so the hosts skip their talk. The music goes on.'
      : errors.some(credits)
      ? '💳 Out of Gemini credits for the voices. Top up in AI Studio → Billing.'
      : allSpent
        ? `🎙️ Today's voices are used up, so the hosts are quiet until ${voiceQuotaReset()}. The music goes on.`
        : `Natural voice failed. ${errors.join(' | ')}`,
  };
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
  // back-to-back lines by the same person are one request; requests go one at a time, so a show
  // stays under Gemini's per-minute limit (it was sending a burst for every talk)
  const turns: SpokenLine[] = [];
  for (const l of lines) {
    const last = turns[turns.length - 1];
    if (last && last.speaker === l.speaker) last.text = `${last.text} ${l.text}`;
    else turns.push({ ...l });
  }
  // sound effects ("<sfx:ring>", a caller's "düt düt düt"): taken out of the words, made on the phone and
  // played before or after the line, so nobody has to SAY "düt düt"
  const effects = new Map<number, { before: Sfx[]; after: Sfx[] }>();
  turns.forEach((t, k) => {
    const split = splitSfx(t.text);
    if (split.before.length || split.after.length) effects.set(k, split);
    t.text = split.text;
  });
  if (effects.size) return finish(await lineByLine(apiKey, turns, voiceFor, effects));
  const parts: Uint8Array[] = [];
  // a two-person talk goes as ONE request (both voices at once): a talk used to cost a request per
  // line, so a 16-song show ate most of the 100-a-day voice quota. If the audio comes back much too
  // short for the words (the two-speaker mode dropped someone), it's voiced line by line after all
  const speakers = cast.filter((c) => turns.some((t) => t.speaker === c.name));
  // a caller's lines get the phone sound on their own, so a talk with a caller is voiced line by line
  if (turns.length > 1 && speakers.length === 2 && !speakers.some((c) => c.phone)) {
    const both = await tryDuo(apiKey, turns, speakers);
    if (both && wavSeconds(both) >= expectedSeconds(turns) * 0.5) parts.push(both);
    else if (both) duoMisses++; // came back too short: someone was dropped
  }
  if (!parts.length) parts.push(...(await lineByLine(apiKey, turns, voiceFor, new Map())));
  return finish(parts);
}

/** Each turn voiced on its own (a caller through the phone sound), with its sound effects before and after. */
async function lineByLine(
  apiKey: string,
  turns: SpokenLine[],
  voiceFor: (name: string) => Cast[number],
  effects: Map<number, { before: Sfx[]; after: Sfx[] }>,
): Promise<Uint8Array[]> {
  const parts: Uint8Array[] = [];
  const rateNow = () => (parts.length ? pcmOf(parts[parts.length - 1]).rate : 24000);
  // the dead line is the caller's (through their phone); the rest happen in the studio
  const sound = (kind: Sfx, phone: boolean, rate: number) => {
    const raw = sfxPcm(kind, rate);
    return wav(kind === 'busy' && phone ? phoneFilter(raw, rate) : raw, rate);
  };
  for (const [k, t] of turns.entries()) {
    const phone = !!voiceFor(t.speaker).phone;
    const fx = effects.get(k);
    const voiced = t.text.trim() ? await voiceBytes(apiKey, [t], [voiceFor(t.speaker)]) : null;
    const rate = voiced ? pcmOf(voiced).rate : rateNow();
    for (const kind of fx?.before ?? []) parts.push(sound(kind, phone, rate));
    if (voiced) parts.push(phone ? onPhone(voiced) : voiced);
    for (const kind of fx?.after ?? []) parts.push(sound(kind, phone, rate));
  }
  return parts;
}

/** The talk's parts joined with short pauses, written to a .wav in the cache. */
async function finish(parts: Uint8Array[]): Promise<string> {
  const file = new File(Paths.cache, `voice-${Date.now()}-${Math.round(Math.random() * 1e6)}.wav`);
  file.create();
  await file.write(joinWavs(parts, 0.35));
  return file.uri;
}

// ── bytes ──

/** How long a 16-bit mono WAV plays. */
function wavSeconds(b: Uint8Array): number {
  const rate = new DataView(b.buffer, b.byteOffset).getUint32(24, true) || 24000;
  return Math.max(0, b.length - 44) / (rate * 2);
}
/** Roughly how long these lines take to say (about 14 characters a second, Turkish or English). */
const expectedSeconds = (lines: SpokenLine[]) => lines.reduce((n, l) => n + l.text.length, 0) / 14;

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

/** done: true if it finished, false if stopped. at: how far into the clip (0…1), for the booth's teleprompter. */
export type Talking = { done: Promise<boolean>; stop: () => void; at?: () => number };

/**
 * Plays a voice clip and reports when it's over. Three ways to notice the end, because on
 * Android the "finished" event doesn't always arrive and timers freeze in the background:
 * the player's own events, a check on every heartbeat (and a timer, in the foreground), and
 * the clip's length worked out from the file size, so a show can never hang after a talk.
 */
/** `duck`: ask Android to turn other audio (Spotify) down while this plays, for talking over a song's end. */
export function playClip(uri: string, duck = false, volume = 1): Talking {
  const player = createAudioPlayer(uri);
  player.volume = volume; // matched to the song next to it (a quiet old record gets a softer voice)
  let settle: (finished: boolean) => void = () => {};
  const done = new Promise<boolean>((r) => (settle = r));
  let over = false;
  let started = false;
  let startedAt = 0;
  // 24 kHz, 16-bit mono: 48,000 bytes a second (after the 44-byte header)
  const seconds = (() => {
    try {
      return Math.max(1, ((new File(uri).size ?? 0) - 44) / 48000);
    } catch {
      return 60;
    }
  })();
  const end = (finished: boolean) => {
    if (over) return;
    over = true;
    clearInterval(watch);
    offBeat();
    sub.remove();
    try {
      player.remove();
    } catch {}
    if (duck) radioAudioMode(); // give Spotify its full volume back
    settle(finished);
  };
  const check = () => {
    try {
      if (player.playing && !started) {
        started = true;
        startedAt = Date.now();
      }
      const d = player.duration;
      if (started && d > 0 && !player.playing && player.currentTime >= d - 0.3) return end(true);
      // past its length (+1.5 s): over, whatever the player says
      if (started && Date.now() - startedAt > seconds * 1000 + 1500) return end(true);
      // never started at all within 10 s: give up on it, the show goes on
      if (!started && Date.now() - createdAt > 10_000) return end(true);
    } catch {
      end(true);
    }
  };
  const createdAt = Date.now();
  const sub = player.addListener('playbackStatusUpdate', (s) => {
    if (s.didJustFinish) end(true);
    else check();
  });
  const watch = setInterval(check, 400);
  const offBeat = onBeat(check);
  radioAudioMode(duck).finally(() => player.play());
  return {
    done,
    stop: () => {
      try {
        player.pause();
      } catch {}
      end(false);
    },
    at: () => {
      if (over) return 1;
      if (!started) return 0;
      try {
        return Math.min(1, player.currentTime / (player.duration > 0 ? player.duration : seconds));
      } catch {
        return Math.min(1, (Date.now() - startedAt) / (seconds * 1000));
      }
    },
  };
}

/** The audio settings for the radio voices: keep playing in the background, mix with Spotify. */
export const radioAudioMode = (duck = false) =>
  setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: duck ? 'duckOthers' : 'mixWithOthers',
  }).catch(() => {});

/** Android's built-in voice, the fallback. */
/** A talk that couldn't be voiced: the hosts skip it (no robot voice) and the music goes on. */
export const skipTalk = (): Talking => ({ done: Promise.resolve(true), stop: () => {} });

/** Where a voice sample for this station, persona, voice and language is kept (made once, replayed for free). */
export function sampleFile(station: string, persona: string, voice: string, lang: string): File {
  const dir = new Directory(Paths.document, 'voice-samples');
  if (!dir.exists) dir.create({ intermediates: true });
  const safe = (x: string) => x.normalize('NFKD').replace(/[^\w-]+/g, '');
  return new File(dir, `${safe(station)}-${safe(persona)}-${safe(voice)}-${safe(lang)}.wav`);
}

/**
 * A kept clip worth playing: there, and more than a WAV header. Anything else (the empty files an
 * earlier build left behind) is deleted, so it gets voiced again instead of playing silence.
 */
export function playable(f: File): boolean {
  try {
    if (!f.exists) return false;
    if ((f.size ?? 0) > 44) return true;
    f.delete();
  } catch {}
  return false;
}

/** Moves a freshly made clip into the samples folder; if that fails, the clip still plays from the cache. */
export function keepSample(made: string, saved: File): string {
  try {
    // moveSync, not copy: in this SDK copy() is async, and deleting the clip right after it left an
    // empty file behind, so every saved talk played as silence
    new File(made).moveSync(saved, { overwrite: true });
    return playable(saved) ? saved.uri : made;
  } catch {
    return made;
  }
}

const showVoicesDir = () => new Directory(Paths.document, 'show-voices');

/** Where talk i of a kept show is saved (the newest few shows keep their voices: replays cost nothing). */
export function showVoiceFile(showId: string, i: number): File {
  const dir = new Directory(showVoicesDir(), showId.replace(/[^\w-]+/g, ''));
  if (!dir.exists) dir.create({ intermediates: true });
  return new File(dir, `${i}.wav`);
}

/** Deletes the saved voices of every show except these (a show's voices are ~20 MB). */
export function pruneShowVoices(keep: string[]): void {
  try {
    const root = showVoicesDir();
    if (!root.exists) return;
    for (const d of root.list()) if (d instanceof Directory && !keep.includes(d.name)) d.delete();
  } catch {}
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

/** The clip as if it came down a phone line. */
function onPhone(w: Uint8Array): Uint8Array {
  const { pcm, rate } = pcmOf(w);
  return wav(phoneFilter(pcm, rate), rate);
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
