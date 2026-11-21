import { findSong } from './deezer';
import { noFacts, lyricTimes, timing, type SongFacts } from './songText';
import { isrcOf, type Track } from './spotify';

/*
 * What the radio's hosts know about each song before the show is written, so they talk like a DJ who
 * has heard it: the tempo and loudness (Deezer, found by the recording's ISRC) and how long the intro
 * and the instrumental ending are (from LRCLIB's synced lyrics: when the first and last lines are sung).
 * Only the timings are used; the lyrics themselves are never shown or spoken.
 * Free, no keys. Anything missing is just unknown, and the show is written without it.
 */

const LRCLIB = 'https://lrclib.net/api';
const UA = 'LifelogRadio/1.0 (https://github.com/aardapeker/lifelog)';

export type Lrc = { duration?: number; instrumental?: boolean; syncedLyrics?: string | null; plainLyrics?: string | null };

async function lrclib(path: string): Promise<any> {
  const res = await fetch(`${LRCLIB}${path}`, { headers: { 'Lrclib-Client': UA, 'User-Agent': UA } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`LRCLIB ${res.status}`);
  return res.json();
}

/** The synced lyrics of this exact song (same length within 3 s), or null. */
async function findLyrics(t: Track): Promise<Lrc | null> {
  const sec = Math.round(t.durationMs / 1000);
  const artist = t.artist.split(',')[0].trim();
  const q = `artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(t.name)}`;
  const exact: Lrc | null = await lrclib(`/get?${q}&duration=${sec}`);
  if (exact?.syncedLyrics || exact?.instrumental) return exact;
  // not under that exact name and length: search, and take the closest length that has timings
  const found: Lrc[] = (await lrclib(`/search?${q}`)) ?? [];
  const close = found.filter((x) => Math.abs((x.duration ?? 0) - sec) <= 3).sort((a, b) => Math.abs((a.duration ?? 0) - sec) - Math.abs((b.duration ?? 0) - sec));
  // timed lines first; else plain text (the player shows it without following along)
  return close.find((x) => x.syncedLyrics) ?? close.find((x) => x.plainLyrics) ?? exact ?? null;
}

const lyricsMemo = new Map<string, Promise<Lrc | null>>();

/**
 * A song's lyrics from LRCLIB (timed lines when it has them), fetched once per song: the show's
 * timing check and the player's live lyrics share it. A failed lookup is tried again next time.
 */
export function lyricsOf(t: Track): Promise<Lrc | null> {
  if (!lyricsMemo.has(t.id)) {
    const p = findLyrics(t);
    lyricsMemo.set(t.id, p);
    p.catch(() => lyricsMemo.delete(t.id));
    if (lyricsMemo.size > 200) lyricsMemo.delete(lyricsMemo.keys().next().value!);
  }
  return lyricsMemo.get(t.id)!;
}

const memo = new Map<string, Promise<SongFacts>>();

export function songFacts(t: Track): Promise<SongFacts> {
  if (!memo.has(t.id)) {
    const p = (async (): Promise<SongFacts> => {
      const title = t.name.replace(/\s+-\s+.*(remaster|version|edit|mix|mono|stereo).*$/i, '').trim();
      const [dz, lrc] = await Promise.all([
        isrcOf(t.id)
          .then((isrc) => findSong(t.artist, title, isrc))
          .catch(() => null),
        lyricsOf(t).catch(() => null),
      ]);
      return {
        ...noFacts,
        bpm: dz?.bpm && dz.bpm > 40 ? Math.round(dz.bpm) : null,
        gain: dz?.gain ?? null,
        instrumental: !!lrc?.instrumental,
        ...(lrc?.syncedLyrics ? timing(lyricTimes(lrc.syncedLyrics), t.durationMs / 1000) : {}),
      };
    })();
    memo.set(t.id, p);
    if (memo.size > 300) memo.delete(memo.keys().next().value!);
  }
  return memo.get(t.id)!;
}

/** Facts for a whole playlist, a few songs at a time; whatever isn't back in 20 s is left unknown. */
export async function factsFor(tracks: Track[], onDone?: (done: number) => void): Promise<SongFacts[]> {
  const out: SongFacts[] = tracks.map(() => noFacts);
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < tracks.length) {
      const k = next++;
      out[k] = await songFacts(tracks[k]).catch(() => noFacts);
      onDone?.(++done);
    }
  };
  await Promise.race([Promise.all([worker(), worker(), worker()]), new Promise((r) => setTimeout(r, 20_000))]);
  return [...out];
}
