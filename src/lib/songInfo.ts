import { mb } from '../radar/local/sources/musicbrainz';

/*
 * "About this song" for the radio player, like Spotify's credits and artist card: from MusicBrainz
 * (the song's first release, writers, producers; the artist's origin, start and genres) and Wikipedia
 * (the artist's photo and a short bio, in Turkish for Turkish artists when there's a Turkish page).
 * Free, no keys. Loaded when you open it, cached per song.
 */

export type SongInfo = {
  title: string;
  firstReleased: string | null; // "1997-05-21"
  album: string | null;
  writers: string[];
  producers: string[];
  artist: {
    name: string;
    kind: string | null; // "Group", "Person"
    from: string | null; // "Abingdon, England" / "Turkey"
    started: string | null; // "1985"
    ended: string | null;
    genres: string[];
    photo: string | null;
    bio: string | null;
    wiki: string | null; // the Wikipedia page
  } | null;
};

type Raw = Record<string, any>;

/** "Paranoid Android - Remastered 2017" → "Paranoid Android"; "(feat. X)" goes too. */
export function cleanTitle(name: string): string {
  return name
    .replace(/\s+-\s+.*(remaster|version|live|edit|mix|mono|stereo|acoustic|bonus|demo).*$/i, '')
    .replace(/\s*[([](feat\.?|ft\.?|with|from)\b[^)\]]*[)\]]/gi, '')
    .trim();
}

/** The best search hit: the artist matches, then the earliest release (the original, not a compilation). */
export function pickRecording(recordings: Raw[], artist: string): Raw | null {
  const a = artist.toLowerCase();
  const byArtist = recordings.filter((r) => (r.score ?? 100) >= 80 && (r['artist-credit'] ?? []).some((c: Raw) => (c.name ?? c.artist?.name ?? '').toLowerCase() === a));
  const pool = byArtist.length ? byArtist : recordings.filter((r) => (r.score ?? 0) >= 95);
  return [...pool].sort((x, y) => (x['first-release-date'] || '9999').localeCompare(y['first-release-date'] || '9999'))[0] ?? null;
}

/** Writers and producers from a recording looked up with artist-rels, work-rels and work-level-rels. */
export function credits(rec: Raw): { writers: string[]; producers: string[] } {
  const rels: Raw[] = rec.relations ?? [];
  const names = (list: Raw[]) => [...new Set(list.map((r) => r.artist?.name).filter(Boolean))] as string[];
  const works = rels.filter((r) => r['target-type'] === 'work' && r.work).map((r) => r.work);
  const writing = works.flatMap((w: Raw) => (w.relations ?? []).filter((r: Raw) => ['composer', 'lyricist', 'writer'].includes(r.type)));
  return { writers: names(writing), producers: names(rels.filter((r) => r.type === 'producer')) };
}

/** The original album: the earliest release that is an album (else any). */
export function firstAlbum(rec: Raw): string | null {
  const releases: Raw[] = rec.releases ?? [];
  const sorted = [...releases].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  return (sorted.find((r) => r['release-group']?.['primary-type'] === 'Album') ?? sorted[0])?.title ?? null;
}

async function json(url: string): Promise<Raw> {
  const res = await fetch(url, { headers: { 'User-Agent': 'LifelogRadar/1.0 ( https://github.com/aardapeker/lifelog )', Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

/** The artist's Wikipedia summary through Wikidata: the Turkish page for Turkish artists, else English. */
async function wikipedia(wikidataUrl: string | null, turkish: boolean): Promise<{ photo: string | null; bio: string | null; wiki: string | null }> {
  const id = wikidataUrl?.match(/(Q\d+)/)?.[1];
  if (!id) return { photo: null, bio: null, wiki: null };
  const entity = (await json(`https://www.wikidata.org/wiki/Special:EntityData/${id}.json`)).entities?.[id];
  const links = entity?.sitelinks ?? {};
  const order = turkish ? ['trwiki', 'enwiki'] : ['enwiki', 'trwiki'];
  const site = order.find((s) => links[s]?.title);
  if (!site) return { photo: null, bio: null, wiki: null };
  const lang = site.slice(0, 2);
  const s = await json(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(links[site].title.replace(/ /g, '_'))}`);
  return { photo: s.thumbnail?.source ?? null, bio: s.extract ?? null, wiki: s.content_urls?.mobile?.page ?? null };
}

const cache = new Map<string, SongInfo>();

export async function songInfo(trackId: string, name: string, artistName: string): Promise<SongInfo> {
  const hit = cache.get(trackId);
  if (hit) return hit;
  const title = cleanTitle(name);
  const artist = artistName.split(',')[0].trim(); // Spotify lists featured artists after a comma
  const q = encodeURIComponent(`recording:"${title}" AND artist:"${artist}"`);
  const found = pickRecording((await mb<Raw>(`/recording?query=${q}&limit=10`)).recordings ?? [], artist);
  let info: SongInfo = { title, firstReleased: null, album: null, writers: [], producers: [], artist: null };
  if (found) {
    const rec = await mb<Raw>(`/recording/${found.id}?inc=artist-rels+work-rels+work-level-rels+releases+release-groups`);
    const arid = found['artist-credit']?.[0]?.artist?.id;
    const a = arid ? await mb<Raw>(`/artist/${arid}?inc=url-rels+genres`) : null;
    const turkish = a?.country === 'TR' || a?.area?.name === 'Turkey';
    const wikidata = (a?.relations ?? []).find((r: Raw) => r.type === 'wikidata')?.url?.resource ?? null;
    const wiki = await wikipedia(wikidata, turkish).catch(() => ({ photo: null, bio: null, wiki: null }));
    info = {
      title: rec.title ?? title,
      firstReleased: found['first-release-date'] || null,
      album: firstAlbum(rec),
      ...credits(rec),
      artist: a
        ? {
            name: a.name,
            kind: a.type ?? null,
            from: [a['begin-area']?.name, a.area?.name].filter((x, i, all) => x && all.indexOf(x) === i).join(', ') || null,
            started: a['life-span']?.begin?.slice(0, 4) ?? null,
            ended: a['life-span']?.ended ? (a['life-span']?.end?.slice(0, 4) ?? 'ended') : null,
            genres: (a.genres ?? [])
              .sort((x: Raw, y: Raw) => (y.count ?? 0) - (x.count ?? 0))
              .slice(0, 4)
              .map((g: Raw) => g.name),
            ...wiki,
          }
        : null,
    };
  }
  cache.set(trackId, info);
  if (cache.size > 40) cache.delete(cache.keys().next().value!);
  return info;
}
