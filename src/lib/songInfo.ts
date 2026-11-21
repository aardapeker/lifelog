import { album, artistById, findSong, related, type DzArtist } from './deezer';
import { isrcOf } from './spotify';
import { cleanTitle, isTurkish, pickMusician, tidy } from './songText';

export { cleanTitle } from './songText';

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

async function json(url: string): Promise<Raw> {
  const res = await fetch(url, { headers: { 'User-Agent': 'LifelogRadar/1.0 ( https://github.com/aardapeker/lifelog )', Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

type Wiki = { about: string | null; photo: string | null; bio: string | null; wiki: string | null };
const noWiki: Wiki = { about: null, photo: null, bio: null, wiki: null };
const LONG_ENOUGH = 280; // a lead shorter than this ("Zerrin Özer, Türk şarkıcıdır.") gets more sentences

/** A page's opening (up to 6 sentences, so a one-line lead still says something), picture and link. */
async function page(lang: string, title: string): Promise<{ text: string; photo: string | null; url: string } | null> {
  const r = await json(
    `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=extracts|pageimages|info&explaintext=1&exsentences=6&exsectionformat=plain&piprop=thumbnail&pithumbsize=400&inprop=url&titles=${encodeURIComponent(title)}`,
  );
  const p: Raw | undefined = Object.values(r.query?.pages ?? {})[0] as Raw | undefined;
  if (!p || p.missing !== undefined || !p.extract) return null;
  return { text: tidy(p.extract), photo: p.thumbnail?.source ?? null, url: p.fullurl ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}` };
}

/** The artist's Wikipedia bio, found by name through Wikidata (so "Pinhani" finds the band, not a word). */
async function wikipedia(name: string): Promise<Wiki> {
  const found = await json(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&uselang=en&type=item&limit=8&format=json`);
  const hit = pickMusician(found.search ?? []);
  if (!hit) return noWiki;
  const entity = (await json(`https://www.wikidata.org/wiki/Special:EntityData/${hit.id}.json`)).entities?.[hit.id];
  const links = entity?.sitelinks ?? {};
  const sites = (isTurkish(entity) ? ['trwiki', 'enwiki'] : ['enwiki', 'trwiki']).filter((s) => links[s]?.title);
  if (!sites.length) return { ...noWiki, about: hit.description ?? null };
  // the preferred language first; if its page is only a line or two, the other one's (when longer)
  const first = await page(sites[0].slice(0, 2), links[sites[0]].title).catch(() => null);
  const second = sites[1] && (!first || first.text.length < LONG_ENOUGH) ? await page(sites[1].slice(0, 2), links[sites[1]].title).catch(() => null) : null;
  const best = second && second.text.length > (first?.text.length ?? 0) ? second : first;
  if (!best) return { ...noWiki, about: hit.description ?? null };
  return { about: hit.description ?? null, photo: first?.photo ?? second?.photo ?? null, bio: best.text, wiki: best.url };
}

const cache = new Map<string, SongInfo>();

export async function songInfo(trackId: string, name: string, artistName: string): Promise<SongInfo> {
  const hit = cache.get(trackId);
  if (hit) return hit;
  const title = cleanTitle(name);
  const artist = artistName.split(',')[0].trim(); // Spotify lists featured artists after a comma
  const song = await findSong(artist, title, await isrcOf(trackId).catch(() => null));
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
