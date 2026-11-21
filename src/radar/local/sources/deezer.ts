import { findArtist, isVariant, norm, releases, type DzRelease } from '../../../lib/deezer';
import { shortDate } from '../text';
import { item, type ContentSource, type FetchedItem } from './types';

/*
 * New albums, EPs and singles from the artists a topic follows, from Deezer (free, no key).
 * MUSIC cards with the cover and a link that finds the release on Spotify; the mediaUrl is the
 * Deezer album, which the album page opens (tracks with 30-second previews).
 * Replaced MusicBrainz (Nov 2026): one request a second, and covers missing for most new singles.
 */

const EVERY = 12 * 3600_000; // per artist: new releases don't appear every hour
const WINDOW = 45 * 86_400_000; // releases from the last six weeks on (upcoming ones too)
const PER_ARTIST = 6;

export const deezerAlbumUrl = (id: number) => `https://www.deezer.com/album/${id}`;

export function toItem(r: DzRelease, artist: string): FetchedItem | null {
  if (r.kind === 'Compilation' || isVariant(r.title)) return null;
  const when = shortDate(r.date);
  const future = !!r.date && Date.parse(r.date) > Date.now();
  return item({
    type: 'MUSIC',
    sourceName: 'Deezer',
    title: `${artist} – ${r.title}`,
    url: `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${r.title}`)}`,
    mediaUrl: deezerAlbumUrl(r.id),
    thumbnailUrl: r.cover,
    author: [r.kind, when && (future ? `out ${when}` : when)].filter(Boolean).join(' · '),
    publishedAt: Date.now(), // when Radar found it; the release date is on the card
  });
}

/** Releases in the window, newest first, at most a few per artist. */
export function recent(list: DzRelease[], now = Date.now()): DzRelease[] {
  const from = new Date(now - WINDOW).toISOString().slice(0, 10);
  return list.filter((r) => r.date && r.date >= from).slice(0, PER_ARTIST);
}

/** "Pinhani" → Deezer artist id, remembered across runs. */
async function artistId(name: string, cache: Record<string, string>): Promise<number | null> {
  const k = `dz:artist:${norm(name)}`;
  if (cache[k]) return Number(cache[k]);
  const a = await findArtist(name);
  if (!a) return null;
  cache[k] = String(a.id);
  return a.id;
}

export const deezer: ContentSource = {
  id: 'deezer',
  async fetch(topic, ctx) {
    const out: FetchedItem[] = [];
    for (const name of musicArtists(topic.sources, ctx.spotifyArtists)) {
      if (!ctx.throttle.tryAcquire(`dz:${topic.id}:${norm(name)}`, EVERY)) continue;
      try {
        const id = await artistId(name, ctx.cache);
        if (!id) {
          console.warn(`Radar: Deezer doesn't know "${name}"`);
          continue;
        }
        for (const r of recent(await releases(id))) {
          const it = toItem(r, name);
          if (it && !out.some((o) => o.url === it.url)) out.push(it);
        }
      } catch (e) {
        console.warn(`Radar: Deezer ${name} failed`, e);
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
