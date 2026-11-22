import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { fromBase64 } from './albumColors';
import { getSetting, setSetting } from './db';
import { jsonHeaders } from './gemini';
import { getKey } from './keys';
import type { Station } from './stations';

/*
 * Each station's own sounds, made once with Google's Lyria (the Gemini key) and kept on the phone:
 * - a jingle: the station's name sung in its style ("Neon FM, ninety-eight point three"), played in the
 *   silence before the show's first talk and then before every third one;
 * - a music bed: a quiet instrumental loop under the hosts while they talk.
 * Never over Spotify: both only play while the music is paused for a talk. A talk over a song's ending or
 * intro has the song itself as its bed, so it gets neither. Pausing, skipping or ending the show stops
 * them at once.
 */

const MODEL = 'lyria-3-clip-preview'; // 30-second clips, MP3: plenty for a jingle and a loop
const URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

export type SoundKind = 'jingle' | 'bed';

/** What Lyria is asked for, per station. No artist or song names (Lyria refuses them). */
const PROMPTS: Record<string, Record<SoundKind, string>> = {
  friend: {
    jingle: "A short, warm radio station jingle. A small friendly vocal group sings \"Your Friend, eighty-eight point oh\" over acoustic guitar and handclaps. The jingle is over within the first 6 seconds, then silence.",
    bed: 'Instrumental only, no vocals. A warm, gentle loop of acoustic guitar and soft electric piano, relaxed morning coffee feel, 90 BPM, quiet and even with no big changes, made to sit softly under a radio host talking.',
  },
  neon: {
    jingle: 'A short 1980s pop radio station jingle. A bright harmonised vocal group sings "Neon FM, ninety-eight point three" with sparkling analog synths and one big gated-reverb drum hit. The jingle is over within the first 6 seconds, then silence.',
    bed: 'Instrumental only, no vocals. A soft 1980s synth-pop loop: warm analog synth pads, a light arpeggio, gentle drum machine, 116 BPM, quiet and even with no big changes, made to sit under a radio DJ talking.',
  },
  nightshift: {
    jingle: 'A short late-night radio station jingle. A deep, cool, breathy voice sings "Night Shift FM, twenty-three point three" over a dark synth bass and a slow pulse. The jingle is over within the first 6 seconds, then silence.',
    bed: 'Instrumental only, no vocals. A dark, calm late-night ambient synth loop: slow pulsing bass, soft pads, empty city at 3 am, 80 BPM, quiet and even with no big changes, made to sit under a radio host talking.',
  },
  rock: {
    jingle: 'A short rock radio station jingle. A raspy shouted gang vocal "Gebze Rock, one-oh-four!" over a big distorted electric guitar riff and a drum fill. The jingle is over within the first 6 seconds, then silence.',
    bed: 'Instrumental only, no vocals. A low, steady hard rock loop: palm-muted electric guitar riff, steady drums and bass, 110 BPM, held back and even with no solos or big changes, made to sit under a radio host talking.',
  },
  chill: {
    jingle: 'A short, soft lo-fi radio station jingle. A sleepy, gentle voice sings "Şemistan Chill, ninety-one point one" over mellow piano and vinyl crackle, ending with a soft cat meow. The jingle is over within the first 6 seconds, then silence.',
    bed: 'Instrumental only, no vocals. A lo-fi hip hop loop: dusty vinyl crackle, soft jazzy piano chords, gentle rain, relaxed drums, 75 BPM, quiet and even with no big changes, made to sit under a radio host talking.',
  },
  arabesk: {
    jingle: 'A short, dramatic Turkish arabesk radio station jingle. A male singer with emotional vibrato sings "Tuzla Arabesk FM, doksan nokta beş" with sweeping strings, bağlama and a darbuka roll. The jingle is over within the first 6 seconds, then silence.',
    bed: 'Instrumental only, no vocals. A slow, melancholic Turkish arabesk loop: an emotional string section and bağlama, soft darbuka, 80 BPM, quiet and even with no big changes, made to sit under a radio host talking.',
  },
};

const dir = () => {
  const d = new Directory(Paths.document, 'station-sounds');
  if (!d.exists) d.create({ intermediates: true });
  return d;
};
export const soundFile = (station: string, kind: SoundKind) => new File(dir(), `${station}-${kind}.mp3`);
const has = (station: string, kind: SoundKind) => {
  try {
    return soundFile(station, kind).exists;
  } catch {
    return false;
  }
};
/** Which of the station's sounds are made. */
export const soundsOf = (station: string) => ({ jingle: has(station, 'jingle'), bed: has(station, 'bed') });

/** Asks Lyria for one sound and keeps it (replacing the old one). About 30 s; it costs a few cents. */
export async function makeStationSound(station: Station, kind: SoundKind): Promise<void> {
  const apiKey = await getKey('gemini');
  if (!apiKey) throw new Error('Making station sounds needs a Gemini key (Settings → AI).');
  const prompt = PROMPTS[station.key]?.[kind];
  if (!prompt) throw new Error(`No ${kind} idea for ${station.name} yet.`);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 150_000);
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: jsonHeaders(apiKey),
      body: JSON.stringify({ model: MODEL, input: prompt, response_format: { type: 'audio' } }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      if (res.status === 429) throw new Error("Lyria said \"too many requests\" (or the free tier doesn't include music). Try again later.");
      if (res.status === 403 || /billing|permission/i.test(body)) throw new Error(`Lyria needs billing turned on for this Gemini key (${res.status}).`);
      throw new Error(`Lyria: ${res.status} ${body}`);
    }
    const json = (await res.json()) as { steps?: { type: string; content?: { type: string; data?: string }[] }[] };
    const audio = (json.steps ?? [])
      .filter((s) => s.type === 'model_output')
      .flatMap((s) => s.content ?? [])
      .filter((c) => c.type === 'audio' && c.data)
      .pop();
    if (!audio?.data) throw new Error('Lyria sent no audio back (the prompt may have been filtered).');
    const file = soundFile(station.key, kind);
    if (file.exists) file.delete();
    file.create();
    await file.write(fromBase64(audio.data));
  } catch (e) {
    throw ctrl.signal.aborted ? new Error('Lyria took too long (slow internet?). Try again.') : e;
  } finally {
    clearTimeout(timer);
  }
}

/* ── on or off (Settings live in the database; the show reads this copy) ── */

let enabled = true;
export async function loadStationSoundsSetting(db: SQLiteDatabase): Promise<boolean> {
  enabled = (await getSetting(db, 'radio.stationSounds', 'on')) !== 'off';
  return enabled;
}
export async function setStationSoundsOn(db: SQLiteDatabase, on: boolean): Promise<void> {
  enabled = on;
  await setSetting(db, 'radio.stationSounds', on ? 'on' : 'off');
}

/* ── playing them ── */

const BED_VOLUME = 0.16; // well under the voice
const JINGLE_VOLUME = 0.85;
const JINGLE_MAX_MS = 7000; // the clip is 30 s; the sung part is at the start

let bed: AudioPlayer | null = null;
let jingle: { player: AudioPlayer; cancel: () => void } | null = null;
const fades = new WeakMap<AudioPlayer, number>(); // per player: the latest fade wins (a new one stops the old one's steps)

const quietly = (f: () => void) => {
  try {
    f();
  } catch {}
};

/** Fades a player's volume to `to` over `ms`. */
function fade(player: AudioPlayer, to: number, ms: number): Promise<void> {
  const id = (fades.get(player) ?? 0) + 1;
  fades.set(player, id);
  const from = (() => {
    try {
      return player.volume;
    } catch {
      return to;
    }
  })();
  const steps = Math.max(1, Math.round(ms / 50));
  return new Promise((done) => {
    let k = 0;
    const t = setInterval(() => {
      k++;
      if (fades.get(player) !== id) {
        clearInterval(t);
        return done();
      }
      quietly(() => (player.volume = from + ((to - from) * k) / steps));
      if (k >= steps) {
        clearInterval(t);
        done();
      }
    }, 50);
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The station's jingle (if made and on), in the silence before a talk. Resolves when it's over. */
export async function playJingle(station: string): Promise<void> {
  if (!enabled || !has(station, 'jingle')) return;
  stopJingle();
  const player = createAudioPlayer(soundFile(station, 'jingle').uri);
  let cancelled = false;
  jingle = { player, cancel: () => (cancelled = true) };
  quietly(() => (player.volume = JINGLE_VOLUME));
  quietly(() => player.play());
  const started = Date.now();
  // the sung part, then a short fade (or less, if the clip ends first)
  while (!cancelled && Date.now() - started < JINGLE_MAX_MS - 1000) {
    await wait(100);
    try {
      if (player.duration > 0 && !player.playing && player.currentTime >= player.duration - 0.2) break;
    } catch {
      break;
    }
  }
  if (!cancelled) await fade(player, 0, 1000);
  quietly(() => player.remove());
  if (jingle?.player === player) jingle = null;
}
function stopJingle() {
  if (!jingle) return;
  jingle.cancel();
  const p = jingle.player;
  jingle = null;
  quietly(() => p.pause());
  quietly(() => p.remove());
}

/** The music bed fades in under the hosts (if made and on). */
export async function bedIn(station: string): Promise<void> {
  if (!enabled || !has(station, 'bed')) return;
  stopBed();
  const player = createAudioPlayer(soundFile(station, 'bed').uri);
  bed = player;
  quietly(() => (player.loop = true));
  quietly(() => (player.volume = 0));
  quietly(() => player.play());
  await fade(player, BED_VOLUME, 700);
}

/** The bed fades out (before the next song starts, so they never overlap). */
export async function bedOut(ms = 900): Promise<void> {
  const player = bed;
  if (!player) return;
  await fade(player, 0, ms);
  if (bed === player) {
    bed = null;
    quietly(() => player.pause());
    quietly(() => player.remove());
  }
}
function stopBed() {
  const player = bed;
  bed = null;
  if (!player) return;
  fades.set(player, (fades.get(player) ?? 0) + 1); // cancels a fade in progress
  quietly(() => player.pause());
  quietly(() => player.remove());
}

/** Pause, skip, the end of the show: everything stops at once. */
export function stopStationSounds(): void {
  stopJingle();
  stopBed();
}

/** Station page: hear a sound (the jingle's sung part, ten seconds of the bed). */
export async function hearStationSound(station: string, kind: SoundKind): Promise<void> {
  stopStationSounds();
  if (kind === 'jingle') {
    const was = enabled;
    enabled = true;
    try {
      await playJingle(station);
    } finally {
      enabled = was;
    }
    return;
  }
  if (!has(station, 'bed')) return;
  const player = createAudioPlayer(soundFile(station, 'bed').uri);
  bed = player;
  quietly(() => (player.volume = 0.6));
  quietly(() => player.play());
  await wait(9000);
  if (bed === player) await bedOut(1000);
}
