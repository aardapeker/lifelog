import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getSetting, setSetting } from './db';
import { onBeat } from './heartbeat';
import { searchDeezer, type DzTrack } from './deezer';
import { getPlannerSettings } from './planner';
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

/*
 * A station's own starter beds, picked by Arda (Neon FM: his synthwave Spotify list, Nov 2026). They're found
 * on Deezer by artist and title; a station without a list gets the top results of its first search idea.
 */
const STARTERS: Record<string, { artist: string; title: string }[]> = {
  neon: [
    { artist: 'The Motion', title: 'Where Is My Mind? - Retrowave' },
    { artist: 'Mr.Kitty', title: 'After Dark' },
    { artist: 'Casa Noir', title: 'Resonance' },
    { artist: 'Øneheart', title: 'snowfall' },
    { artist: 'VØJ', title: 'Memory Reboot' },
    { artist: 'Home', title: 'Resonance' },
  ],
};
/** Bumped when a station's starter list changes: it replaces that station's beds once. */
const STARTERS_VERSION = '2';
const loose = (x: string) => x.toLowerCase().normalize('NFKD').replace(/[^a-z0-9ø]+/g, '');

async function findStarter(want: { artist: string; title: string }): Promise<DzTrack | null> {
  const name = loose(want.title.split(' - ')[0]);
  const found = (await searchDeezer(`${want.artist} ${want.title}`, 10)).filter((t) => t.preview);
  return found.find((t) => loose(t.artist).includes(loose(want.artist)) && loose(t.title).startsWith(name)) ?? null;
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
    const starters = STARTERS[station];
    if (starters) {
      if ((await getSetting(db, defaultedKey(station), '')) === STARTERS_VERSION) return;
      const picked = (await Promise.all(starters.map((w) => findStarter(w).catch(() => null)))).filter((t): t is DzTrack => !!t);
      if (!picked.length) return; // offline: try again next show
      for (const p of await bedPicks(db, station)) await removeBedPick(db, station, p.id); // the list replaces what was there, once
      let added = 0;
      for (const t of picked) await addBedPick(db, station, t).then(() => added++, () => null);
      if (added) await setSetting(db, defaultedKey(station), STARTERS_VERSION);
      return;
    }
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
 * The show's beds: your picks in a shuffled order, a different one under each talk (looping under it),
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
  showRate = await slowRate(db, station);
  const w = await resolveWeather(db, await stationWeather(db, station));
  showWeather = await weatherSound(w).catch(() => null);
}
/*
 * "Slowed": the bed played slower with its pitch dropping along (no pitch correction), like the
 * "slowed + reverb" edits: deeper and dreamier. Per station; 1 = normal.
 */
export const SLOW_RATES = [
  { rate: 1, label: 'Normal' },
  { rate: 0.9, label: 'Slowed a bit' },
  { rate: 0.85, label: 'Slowed' },
  { rate: 0.8, label: 'Very slowed' },
] as const;
/** A station that starts slowed until you pick its speed: Neon FM, the slowest (Arda's pick). */
const DEFAULT_SLOW: Record<string, number> = { neon: 0.8 };
const slowKey = (station: string) => `radio.slowed.${station}`;
let showRate = 1;
export async function slowRate(db: SQLiteDatabase, station: string): Promise<number> {
  const r = Number(await getSetting(db, slowKey(station), String(DEFAULT_SLOW[station] ?? 1)));
  return SLOW_RATES.some((x) => x.rate === r) ? r : 1;
}
export const setSlowRate = (db: SQLiteDatabase, station: string, rate: number) => setSetting(db, slowKey(station), String(rate));

/*
 * The station's weather: an ambience under the hosts with the music bed (rain, a storm, wind, birds on a
 * sunny morning, crickets at night; or the room: an old computer's fan, a buzzing amp, vinyl crackle), or the real weather where you are right now (open-meteo, the place
 * set for "Plan my day"). The sounds are long nature recordings on Deezer: the first 30-second preview
 * found is saved once and shared by all stations. It loops (rain doesn't mind) and stays quieter than the bed.
 */
export type WeatherKind = 'none' | 'rain' | 'storm' | 'wind' | 'sunny' | 'night' | 'computer' | 'amp' | 'vinyl' | 'live';
/** `fits`: the title has to say it's that sound (the first "night sounds" hit had a voice talking in it). */
export const WEATHERS: { key: WeatherKind; label: string; query?: string; fits?: RegExp }[] = [
  { key: 'none', label: 'None' },
  { key: 'rain', label: '🌧 Rainy', query: 'rain sounds', fits: /rain/i },
  { key: 'storm', label: '⛈ Stormy', query: 'thunderstorm sounds', fits: /thunder|storm/i },
  { key: 'wind', label: '🌬 Windy', query: 'wind sounds', fits: /wind/i },
  { key: 'sunny', label: '☀️ Sunny', query: 'birds singing morning nature sounds', fits: /bird/i },
  { key: 'night', label: '🌙 Night', query: 'crickets chirping night', fits: /cricket/i },
  // not weather, the room: Arda's ideas
  { key: 'computer', label: '🖥️ Old computer', query: 'old computer fan hum sound', fits: /computer|fan|hum/i },
  { key: 'amp', label: '🔊 Amp hum', query: 'guitar amp hum buzz sound', fits: /amp|hum|buzz/i },
  { key: 'vinyl', label: '📀 Vinyl crackle', query: 'vinyl crackle sound', fits: /vinyl|crackle/i },
  { key: 'live', label: '📍 Real weather' },
];
/** Titles that give away a voice or music on top: guided meditations, sleep stories, songs. */
const VOICED = /meditat|guided|story|stories|affirmation|hypno|whisper|asmr|talk|spoken|voice|lullaby|song|feat\.|remix|piano|guitar(?! amp)|music|mix\b/i;
const weatherKey = (station: string) => `radio.weather.${station}`;
export async function stationWeather(db: SQLiteDatabase, station: string): Promise<WeatherKind> {
  const w = (await getSetting(db, weatherKey(station), 'none')) as WeatherKind;
  return WEATHERS.some((x) => x.key === w) ? w : 'none';
}
export const setStationWeather = (db: SQLiteDatabase, station: string, w: WeatherKind) => setSetting(db, weatherKey(station), w);

/** Right now where you are (Plan my day's place): storm, rain, wind, sunny, night, or none. */
async function liveWeather(db: SQLiteDatabase): Promise<WeatherKind> {
  const { lat, lon } = await getPlannerSettings(db);
  if (lat == null || lon == null) return 'none';
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code,wind_speed_10m,is_day`);
  if (!res.ok) return 'none';
  const c = ((await res.json()) as { current?: { weather_code?: number; wind_speed_10m?: number; is_day?: number } }).current;
  const code = c?.weather_code ?? 0;
  if (code >= 95) return 'storm';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((c?.wind_speed_10m ?? 0) >= 30 || (code >= 71 && code <= 77) || code === 85 || code === 86) return 'wind';
  if (!c?.is_day) return 'night';
  return code <= 1 ? 'sunny' : 'none';
}

// v2: the files picked before the title check are left behind (and deleted), so each is chosen again
const weatherFile = (w: WeatherKind) => new File(dir(), `weather2-${w}.mp3`);
function dropOldWeather(): void {
  try {
    for (const f of dir().list()) if (f instanceof File && /^weather-[a-z]+\.mp3$/.test(f.name)) f.delete();
  } catch {}
}
/** The ambience's recording, saved the first time it's needed. */
async function weatherSound(w: WeatherKind): Promise<string | null> {
  const kind = WEATHERS.find((x) => x.key === w);
  if (!kind?.query) return null;
  dropOldWeather();
  const file = weatherFile(w);
  if (file.exists) return file.uri;
  const found = (await searchDeezer(kind.query, 25)).filter((x) => x.preview && x.seconds >= 60 && !VOICED.test(`${x.title} ${x.album?.title ?? ''}`));
  let t = found.find((x) => kind.fits?.test(x.title));
  for (const x of t ? [] : found) if (!(await hasLyrics(x))) { t = x; break; } // nothing named right: at least nobody singing
  if (!t?.preview) return null;
  await File.downloadFileAsync(t.preview, file);
  return file.uri;
}
/** What the station's weather is right now (the real weather resolved), for the station page. */
export async function resolveWeather(db: SQLiteDatabase, w: WeatherKind): Promise<WeatherKind> {
  return w === 'live' ? liveWeather(db).catch(() => 'none' as const) : w;
}
/** Station page: the ambience's recording, to hear it. */
export const weatherPreview = (w: WeatherKind) => weatherSound(w).catch(() => null);

let showWeather: string | null = null; // this show's ambience file

export async function setStationSoundsOn(db: SQLiteDatabase, on: boolean): Promise<void> {
  enabled = on;
  await setSetting(db, 'radio.stationSounds', on ? 'on' : 'off');
}

/* ── playing them ── */

const BED_VOLUME = 0.12; // well under the voice (0.16 was a bit loud, Arda said)

let bed: AudioPlayer | null = null;
let ambience: AudioPlayer | null = null;
const AMBIENCE_VOLUME = 0.09; // under the bed
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
  // by the clock, not by counting steps: Android freezes JS timers when the screen is off, and a fade that
  // waited on 18 frozen timer steps held the next song back for a minute or two after the talk. The radio's
  // heartbeat (native, keeps beating in the background) finishes it within about a second.
  const begun = Date.now();
  return new Promise((done) => {
    const step = () => {
      if (fades.get(player) !== id) return finish();
      const f = Math.min(1, (Date.now() - begun) / Math.max(1, ms));
      quietly(() => (player.volume = from + (to - from) * f));
      if (f >= 1) finish();
    };
    const t = setInterval(step, 50);
    const off = onBeat(step);
    const finish = () => {
      clearInterval(t);
      off();
      done();
    };
  });
}

/** The music bed fades in under the hosts (if one is picked and it's on) and loops until the talk ends (Arda: loop again, Nov 24). */
export async function bedIn(station: string): Promise<void> {
  if (!enabled) return;
  stopBed();
  if (showWeather) {
    const a = createAudioPlayer(showWeather);
    ambience = a;
    quietly(() => (a.loop = true)); // rain and wind don't mind starting over
    quietly(() => (a.volume = 0));
    quietly(() => a.play());
    fade(a, AMBIENCE_VOLUME, 900);
  }
  const uri = nextBed(station);
  if (!uri) return;
  const player = createAudioPlayer(uri);
  bed = player;
  quietly(() => (player.loop = true)); // a long talk outlasts a 30-second preview: it starts over, as Arda prefers
  quietly(() => (player.volume = 0));
  if (showRate !== 1) {
    quietly(() => (player.shouldCorrectPitch = false)); // the pitch drops with the speed: that's the "slowed" sound
    quietly(() => player.setPlaybackRate(showRate));
  }
  quietly(() => player.play());
  await fade(player, BED_VOLUME, 700);
}

/** The bed fades out (before the next song starts, so they never overlap). */
export async function bedOut(ms = 900): Promise<void> {
  const players = [bed, ambience].filter((p): p is AudioPlayer => !!p);
  if (!players.length) return;
  await Promise.all(players.map((p) => fade(p, 0, ms)));
  for (const p of players) {
    if (bed === p) bed = null;
    if (ambience === p) ambience = null;
    quietly(() => p.pause());
    quietly(() => p.remove());
  }
}
function stopBed() {
  for (const player of [bed, ambience]) {
    if (!player) continue;
    fades.set(player, (fades.get(player) ?? 0) + 1); // cancels a fade in progress
    quietly(() => player.pause());
    quietly(() => player.remove());
  }
  bed = null;
  ambience = null;
}

/** Pause, skip, the end of the show: everything stops at once. */
export function stopStationSounds(): void {
  stopBed();
}
