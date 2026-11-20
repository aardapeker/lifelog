import { get } from '../feeds';
import { shortDate } from '../text';
import { item, type ContentSource, type FetchedItem } from './types';

/*
 * New albums, EPs and singles from the artists a topic follows, from MusicBrainz (free, no key).
 * MUSIC cards with the cover (Cover Art Archive) and a link that finds the release on Spotify.
 * MusicBrainz asks for at most one request a second and a User-Agent that names the app,
 * so every call here waits its turn in one queue.
 */

const EVERY = 12 * 3600_000; // per artist: new releases don't appear every hour
const WINDOW = 45 * 86_400_000; // releases from the last six weeks on (upcoming ones too)
const API = 'https://musicbrainz.org/ws/2';
const AGENT = { 'User-Agent': 'LifelogRadar/1.0 ( https://github.com/aardapeker/lifelog )' };

let queue: Promise<unknown> = Promise.resolve();
/** One MusicBrainz request at a time, 1.1 s apart, whichever topic asks. */
export function mb<T>(path: string): Promise<T> {
  const run = queue.then(async () => {
    await new Promise((r) => setTimeout(r, 1100));
    return JSON.parse(await get(`${API}${path}${path.includes('?') ? '&' : '?'}fmt=json`, 15_000, 'application/json', AGENT)) as T;
  });
  queue = run.catch(() => {});
  return run;
}

type ReleaseGroup = {
  id: string;
  title?: string;
  'first-release-date'?: string;
  'primary-type'?: string;
  'secondary-types'?: string[];
  'artist-credit'?: { name?: string; joinphrase?: string; artist?: { id?: string } }[];
};

/** Compilations, live albums, remixes and the like aren't "new music". */
const SKIP = new Set(['Compilation', 'Live', 'Remix', 'DJ-mix', 'Mixtape/Street', 'Demo', 'Interview', 'Soundtrack']);

export function toItem(rg: ReleaseGroup, fallbackArtist: string): FetchedItem | null {
  if (!rg.title || !['Album', 'Single', 'EP'].includes(rg['primary-type'] ?? '')) return null;
  if (rg['secondary-types']?.some((t) => SKIP.has(t))) return null;
  const artist = rg['artist-credit']?.map((c) => `${c.name ?? ''}${c.joinphrase ?? ''}`).join('').trim() || fallbackArtist;
  const date = rg['first-release-date'];
  const when = shortDate(date);
  const future = date && Date.parse(date) > Date.now();
  return item({
    type: 'MUSIC',
    sourceName: 'MusicBrainz',
    title: `${artist} – ${rg.title}`,
    url: `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${rg.title}`)}`,
    mediaUrl: `https://musicbrainz.org/release-group/${rg.id}`,
    thumbnailUrl: `https://coverartarchive.org/release-group/${rg.id}/front-250`,
    author: [rg['primary-type'] === 'EP' ? 'EP' : rg['primary-type'], when && (future ? `out ${when}` : when)].filter(Boolean).join(' · '),
    publishedAt: Date.now(), // when Radar found it; the release date is on the card
  });
}

/** "Pinhani" → MusicBrainz artist id, remembered across runs (the best match, if it's a confident one). */
async function artistId(name: string, cache: Record<string, string>): Promise<string | null> {
  const k = `mb:artist:${name.toLowerCase()}`;
  if (cache[k]) return cache[k];
  const { artists } = await mb<{ artists?: { id: string; score?: number }[] }>(`/artist?query=${encodeURIComponent(`artist:"${name}"`)}&limit=1`);
  const best = artists?.[0];
  if (!best || (best.score ?? 0) < 90) return null;
  cache[k] = best.id;
  return best.id;
}

export const musicBrainz: ContentSource = {
  id: 'musicbrainz',
  async fetch(topic, ctx) {
    const out: FetchedItem[] = [];
    const from = new Date(Date.now() - WINDOW).toISOString().slice(0, 10);
    for (const name of musicArtists(topic.sources, ctx.spotifyArtists)) {
      if (!ctx.throttle.tryAcquire(`mb:${topic.id}:${name.toLowerCase()}`, EVERY)) continue;
      try {
        const id = await artistId(name, ctx.cache);
        if (!id) {
          console.warn(`Radar: MusicBrainz doesn't know "${name}"`);
          continue;
        }
        const query = encodeURIComponent(`arid:${id} AND firstreleasedate:[${from} TO *]`);
        const res = await mb<{ 'release-groups'?: ReleaseGroup[] }>(`/release-group?query=${query}&limit=25`);
        for (const rg of res['release-groups'] ?? []) {
          const it = toItem(rg, name);
          if (it && !out.some((o) => o.url === it.url)) out.push(it);
        }
      } catch (e) {
        console.warn(`Radar: MusicBrainz ${name} failed`, e);
      }
    }
    return out;
  },
};

/** A topic's artists: the ones typed in, then your top Spotify artists if it follows them (no repeats). */
export function musicArtists(sources: { artists?: string[]; spotifyArtists?: boolean }, spotify: string[]): string[] {
  const all = [...(sources.artists ?? []), ...(sources.spotifyArtists ? spotify : [])].map((a) => a.trim()).filter(Boolean);
  return all.filter((a, i) => all.findIndex((b) => b.toLowerCase() === a.toLowerCase()) === i);
}
