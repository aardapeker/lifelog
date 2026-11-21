import { album, artistById, findSong, related, type DzArtist } from './deezer';

/*
 * "About this song" for the radio player, like Spotify's song and artist cards: from Deezer (the
 * album, release date, tempo, label and genres; the artist's photo, fans and who their fans also
 * like) and Wikipedia through Wikidata (a short bio, in Turkish for Turkish artists when there's a
 * Turkish page). Free, no keys. Loaded when you open it, cached per song.
 * (MusicBrainz did this until Nov 2026: one request a second and often "couldn't look it up".)
 */

export type SongInfo = {
  title: string;
  album: string | null;
  released: string | null; // "1997-05-21"
  bpm: number | null;
  label: string | null;
  genres: string[];
  artist: {
    name: string;
    about: string | null; // Wikidata's line: "Turkish rock singer"
    fans: number;
    releases: number;
    photo: string | null;
    bio: string | null;
    wiki: string | null; // the Wikipedia page
  } | null;
  alsoLike: DzArtist[];
};

type Raw = Record<string, any>;

/** "Paranoid Android - Remastered 2017" → "Paranoid Android"; "(feat. X)" goes too. */
export function cleanTitle(name: string): string {
  return name
    .replace(/\s+-\s+.*(remaster|version|live|edit|mix|mono|stereo|acoustic|bonus|demo).*$/i, '')
    .replace(/\s*[([](feat\.?|ft\.?|with|from)\b[^)\]]*[)\]]/gi, '')
    .trim();
}

/** Wikidata descriptions that mean "a musician", in English or Turkish. */
const MUSICAL = /(^|[^\p{L}])(singer|band|musician|rapper|group|duo|trio|composer|songwriter|dj|producer|vocalist|guitarist|pianist|orchestra|şarkıcı|grubu?|müzisyen|besteci)($|[^\p{L}])/iu;

/** The search hit that is the musician: the first whose description says so. */
export const pickMusician = (hits: Raw[]): Raw | null => hits.find((h) => MUSICAL.test(h.description ?? '')) ?? null;

/** Turkish citizen or a band from Turkey (Q43): read their Turkish Wikipedia page first. */
export const isTurkish = (entity: Raw) => ['P27', 'P495'].some((p) => (entity?.claims?.[p] ?? []).some((c: Raw) => c.mainsnak?.datavalue?.value?.id === 'Q43'));

async function json(url: string): Promise<Raw> {
  const res = await fetch(url, { headers: { 'User-Agent': 'LifelogRadar/1.0 ( https://github.com/aardapeker/lifelog )', Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

type Wiki = { about: string | null; photo: string | null; bio: string | null; wiki: string | null };
const noWiki: Wiki = { about: null, photo: null, bio: null, wiki: null };

/** The artist's Wikipedia summary, found by name through Wikidata (so "Pinhani" finds the band, not a word). */
async function wikipedia(name: string): Promise<Wiki> {
  const found = await json(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&uselang=en&type=item&limit=8&format=json`);
  const hit = pickMusician(found.search ?? []);
  if (!hit) return noWiki;
  const entity = (await json(`https://www.wikidata.org/wiki/Special:EntityData/${hit.id}.json`)).entities?.[hit.id];
  const links = entity?.sitelinks ?? {};
  const site = (isTurkish(entity) ? ['trwiki', 'enwiki'] : ['enwiki', 'trwiki']).find((s) => links[s]?.title);
  if (!site) return { ...noWiki, about: hit.description ?? null };
  const s = await json(`https://${site.slice(0, 2)}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(links[site].title.replace(/ /g, '_'))}`);
  return { about: hit.description ?? null, photo: s.thumbnail?.source ?? null, bio: s.extract ?? null, wiki: s.content_urls?.mobile?.page ?? null };
}

const cache = new Map<string, SongInfo>();

export async function songInfo(trackId: string, name: string, artistName: string): Promise<SongInfo> {
  const hit = cache.get(trackId);
  if (hit) return hit;
  const title = cleanTitle(name);
  const artist = artistName.split(',')[0].trim(); // Spotify lists featured artists after a comma
  const song = await findSong(artist, title);
  const [al, who, wiki, alsoLike] = await Promise.all([
    song?.album ? album(song.album.id).catch(() => null) : null,
    song?.artistId ? artistById(song.artistId).catch(() => null) : null,
    wikipedia(artist).catch(() => noWiki),
    song?.artistId ? related(song.artistId, 8).catch(() => []) : [],
  ]);
  const info: SongInfo = {
    title: song?.title ?? title,
    album: song?.album?.title ?? null,
    released: al?.date ?? song?.date ?? null, // the album's date: the song's own is often a reissue's
    bpm: song?.bpm ? Math.round(song.bpm) : null,
    label: al?.label ?? null,
    genres: al?.genres ?? [],
    artist:
      who || wiki.bio
        ? {
            name: who?.name ?? artist,
            about: wiki.about,
            fans: who?.fans ?? 0,
            releases: who?.albums ?? 0,
            photo: who?.picture ?? wiki.photo,
            bio: wiki.bio,
            wiki: wiki.wiki,
          }
        : null,
    alsoLike,
  };
  cache.set(trackId, info);
  if (cache.size > 40) cache.delete(cache.keys().next().value!);
  return info;
}
