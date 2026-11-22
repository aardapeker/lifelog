import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getSetting, setSetting } from './db';
import { searchDeezer, type DzTrack } from './deezer';
import { lyricsOf } from './songFacts';

/*
 * The music under the hosts: real instrumental tracks you pick per station from Deezer. It plays only in
 * the silence between songs, while the hosts talk; never over Spotify (a talk over a song's ending or intro
 * has the song itself as its bed). Pausing, skipping or ending the show stops it at once.
 * (Lyria's jingles and beds were dropped, Nov 2026: AI elevator music, and it cost money.)
 */

const dir = () => {
  const d = new Directory(Paths.document, 'station-sounds');
  if (!d.exists) d.create({ intermediates: true });
  return d;
};

/** Clears what Lyria made before (a jingle and a bed per station). Once is enough; harmless after. */
function dropLyriaFiles(): void {
  try {
    for (const f of dir().list()) if (f instanceof File && /-(jingle|bed)\.mp3$/.test(f.name)) f.delete();
  } catch {}
}

/* ── music beds you pick from Deezer ── */

/*
 * Deezer's free 30-second previews (the same ones the song lists play). Each show uses one of the
 * station's picks, a different one each time; with none picked, the hosts talk over silence. The preview
 * is saved on the phone when you pick it (Deezer's preview links expire).
 */
export type BedPick = { id: number; title: string; artist: string; cover: string | null };

/** Search ideas per station, for the picker's chips. */
export const BED_IDEAS: Record<string, string[]> = {
  friend: ['acoustic guitar instrumental', 'coffee jazz piano', 'chill acoustic'],
  neon: ['synthwave instrumental', 'retrowave', '80s synth instrumental'],
  nightshift: ['dark ambient synth', 'darksynth instrumental', 'night drive synth'],
  rock: ['rock instrumental', 'guitar riff instrumental', 'post rock'],
  chill: ['lofi beats', 'lofi hip hop', 'rain piano'],
  arabesk: ['arabesk enstrümantal', 'bağlama taksim', 'keman taksim'],
};

const picksKey = (station: string) => `radio.beds.${station}`;
const pickFile = (station: string, id: number) => new File(dir(), `${station}-bed-${id}.mp3`);
/** A picked bed's saved preview, to hear it on the station page. */
export const bedPickUri = (station: string, id: number) => pickFile(station, id).uri;

export async function bedPicks(db: SQLiteDatabase, station: string): Promise<BedPick[]> {
  try {
    const all = JSON.parse(await getSetting(db, picksKey(station), '[]')) as BedPick[];
    return all.filter((p) => pickFile(station, p.id).exists); // a file that's gone (cleared storage) isn't a pick
  } catch {
    return [];
  }
}

/**
 * Keeps a Deezer track as one of the station's beds: its preview is saved on the phone. Returns a warning
 * when LRCLIB knows lyrics for it (someone sings: the hosts would talk over a singer), else null.
 */
export async function addBedPick(db: SQLiteDatabase, station: string, t: DzTrack): Promise<string | null> {
  if (!t.preview) throw new Error('This one has no preview on Deezer.');
  const file = pickFile(station, t.id);
  if (file.exists) file.delete();
  await File.downloadFileAsync(t.preview, file).catch((e) => {
    throw new Error(`Couldn't save the preview (${e instanceof Error ? e.message : e}). Online?`);
  });
  const picks = (await bedPicks(db, station)).filter((p) => p.id !== t.id);
  picks.push({ id: t.id, title: t.title, artist: t.artist, cover: t.album?.cover ?? null });
  await setSetting(db, picksKey(station), JSON.stringify(picks));
  return (await hasLyrics(t)) ? 'Heads-up: LRCLIB has lyrics for this one, so someone may sing under the hosts.' : null;
}

/** Does LRCLIB know lyrics for it? (someone sings in it) */
async function hasLyrics(t: DzTrack): Promise<boolean> {
  const lrc = await lyricsOf({ id: `dz${t.id}`, uri: '', name: t.title, artist: t.artist, image: null, durationMs: t.seconds * 1000 }).catch(() => null);
  return !!lrc && !lrc.instrumental && !!(lrc.syncedLyrics || lrc.plainLyrics);
}

const DEFAULTS = 3;
const defaultedKey = (station: string) => `radio.beds.${station}.defaulted`;
const defaulting = new Map<string, Promise<void>>();
/**
 * A station without picks gets 3 to start with, once: the top results of its first search idea that LRCLIB
 * has no lyrics for. Removing them all later doesn't bring them back (you chose silence).
 */
export function ensureDefaultBeds(db: SQLiteDatabase, station: string): Promise<void> {
  const running = defaulting.get(station);
  if (running) return running;
  const job = (async () => {
    if ((await getSetting(db, defaultedKey(station), '')) || (await bedPicks(db, station)).length) return;
    const idea = BED_IDEAS[station]?.[0];
    if (!idea) return;
    let added = 0;
    for (const t of await searchDeezer(idea, 12)) {
      if (added >= DEFAULTS) break;
      if (t.seconds < 60 || (await hasLyrics(t))) continue; // full tracks only, and nobody singing
      try {
        await addBedPick(db, station, t);
        added++;
      } catch {}
    }
    if (added) await setSetting(db, defaultedKey(station), '1');
  })().finally(() => defaulting.delete(station));
  defaulting.set(station, job);
  return job;
}

export async function removeBedPick(db: SQLiteDatabase, station: string, id: number): Promise<void> {
  const picks = (await bedPicks(db, station)).filter((p) => p.id !== id);
  await setSetting(db, picksKey(station), JSON.stringify(picks));
  try {
    const f = pickFile(station, id);
    if (f.exists) f.delete();
  } catch {}
}

/**
 * The show's beds: your picks in a shuffled order, a different one under each talk (each plays once, 30 s),
 * round and round; a new shuffle per show, not starting with the one the last show ended on.
 */
let deck: { station: string; uris: string[]; next: number } | null = null;
let lastBed = '';
async function shuffleBeds(db: SQLiteDatabase, station: string): Promise<void> {
  const uris = (await bedPicks(db, station)).map((p) => pickFile(station, p.id).uri);
  for (let i = uris.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [uris[i], uris[j]] = [uris[j], uris[i]];
  }
  if (uris.length > 1 && uris[0] === lastBed) uris.push(uris.shift()!);
  deck = uris.length ? { station, uris, next: 0 } : null;
}
/** The next bed for this station's talk. */
function nextBed(station: string): string | null {
  if (deck?.station !== station || !deck.uris.length) return null;
  const uri = deck.uris[deck.next % deck.uris.length];
  deck.next++;
  lastBed = uri;
  return uri;
}

/* ── on or off (Settings live in the database; the show reads this copy) ── */

let enabled = true;
export async function loadStationSoundsSetting(db: SQLiteDatabase): Promise<boolean> {
  enabled = (await getSetting(db, 'radio.stationSounds', 'on')) !== 'off';
  return enabled;
}
/** A show is starting: on or off, and the order of its beds. */
export async function prepareStationSounds(db: SQLiteDatabase, station: string): Promise<void> {
  dropLyriaFiles();
  await loadStationSoundsSetting(db);
  await ensureDefaultBeds(db, station).catch(() => {});
  await shuffleBeds(db, station);
}
export async function setStationSoundsOn(db: SQLiteDatabase, on: boolean): Promise<void> {
  enabled = on;
  await setSetting(db, 'radio.stationSounds', on ? 'on' : 'off');
}

/* ── playing them ── */

const BED_VOLUME = 0.12; // well under the voice (0.16 was a bit loud, Arda said)

let bed: AudioPlayer | null = null;
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

/** The music bed fades in under the hosts (if one is picked and it's on). It plays once, 30 s, no loop. */
export async function bedIn(station: string): Promise<void> {
  const uri = nextBed(station);
  if (!enabled || !uri) return;
  stopBed();
  const player = createAudioPlayer(uri);
  bed = player;
  quietly(() => (player.loop = false)); // once: a 30-second preview starting over broke the mood
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
  stopBed();
}
