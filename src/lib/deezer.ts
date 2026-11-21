/*
 * Deezer's public API (no key, no login, about 50 requests per 5 seconds): Radar's new releases,
 * album pages and artist pages, and the radio's "About the song". It has what Spotify's API took
 * away from new apps in 2024: 30-second previews and related artists, plus covers and artist photos
 * for nearly everything. Spotify stays for your taste (top artists) and for playing the full song.
 *
 * Previews are signed links that expire, so they're always read fresh, never stored.
 */

const API = 'https://api.deezer.com';

export type DzArtist = { id: number; name: string; picture: string | null; fans: number; albums: number; link: string };
export type DzRelease = { id: number; title: string; cover: string | null; date: string | null; kind: Kind; explicit: boolean };
export type DzTrack = { id: number; title: string; artist: string; seconds: number; preview: string | null; album: { id: number; title: string; cover: string | null } | null };
export type DzAlbum = DzRelease & {
  artist: { id: number; name: string; picture: string | null };
  label: string | null;
  minutes: number | null;
  genres: string[];
  fans: number;
  tracks: DzTrack[];
  link: string;
};
export type DzSong = DzTrack & { bpm: number | null; gain: number | null; date: string | null; artistId: number | null };
export type Kind = 'Album' | 'EP' | 'Single' | 'Compilation';

type Raw = Record<string, any>;

let last = 0;
/** One GET; Deezer answers errors with 200 + {error}, and asks for a breather when it's busy (code 4). */
async function dz<T = Raw>(path: string, retried = false): Promise<T> {
  // gentle: at most ~8 requests a second, whoever asks
  const wait = Math.max(0, last + 120 - Date.now());
  last = Date.now() + wait;
  if (wait) await new Promise((r) => setTimeout(r, wait));
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(`${API}${path}`, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`Deezer ${res.status}`);
    const json = (await res.json()) as Raw;
    if (json?.error) {
      if (json.error.code === 4 && !retried) {
        await new Promise((r) => setTimeout(r, 5000));
        return dz<T>(path, true);
      }
      throw new Error(`Deezer: ${json.error.message ?? 'error'}`);
    }
    return json as T;
  } finally {
    clearTimeout(t);
  }
}

/* ── pure helpers (tested) ── */

/** Lower case, no accents or punctuation: "Şebnem Ferah" and "sebnem ferah" are the same artist. */
export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** "Marlon Hoffstadt & David Guetta" / "X feat. Y" / "A, B" → "Marlon Hoffstadt" (who Deezer files it under). */
export const mainArtist = (credit: string) => credit.split(/\s*(?:,|&| x | feat\.?| ft\.?| with |;)\s*/i)[0].trim() || credit.trim();

/** The search hit that IS the artist: same name first (most fans wins), else nothing (no guessing). */
export function pickArtist(hits: Raw[], name: string): Raw | null {
  const n = norm(name);
  return hits.filter((h) => norm(h.name ?? '') === n).sort((a, b) => (b.nb_fan ?? 0) - (a.nb_fan ?? 0))[0] ?? null;
}

export const kindOf = (recordType: string | undefined): Kind =>
  recordType === 'ep' ? 'EP' : recordType === 'single' ? 'Single' : recordType === 'compile' ? 'Compilation' : 'Album';

/** Remixes, extended mixes, sped-up and live versions: not "new music" (the original is). */
export const isVariant = (title: string) =>
  /[([-]\s*[^)\]]*\b(remix(es)?|extended|sped up|slowed|reverb|instrumental|acapella|a cappella|radio edit|live|karaoke|remaster(ed)?)\b/i.test(title);

/** 1234567 → "1.2M", 48200 → "48K" */
export function fansText(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
}

/** 245 → "4:05" */
export const trackTime = (sec: number | null | undefined) => (sec ? `${Math.floor(sec / 60)}:${String(Math.round(sec) % 60).padStart(2, '0')}` : null);

const artistOf = (a: Raw): DzArtist => ({
  id: a.id,
  name: a.name,
  picture: a.picture_big ?? a.picture_medium ?? null,
  fans: a.nb_fan ?? 0,
  albums: a.nb_album ?? 0,
  link: a.link ?? `https://www.deezer.com/artist/${a.id}`,
});

const releaseOf = (r: Raw): DzRelease => ({
  id: r.id,
  title: r.title ?? '',
  cover: r.cover_xl ?? r.cover_big ?? r.cover_medium ?? null,
  date: r.release_date ?? null,
  kind: kindOf(r.record_type),
  explicit: !!r.explicit_lyrics,
});

const trackOf = (t: Raw, album?: Raw): DzTrack => {
  const al = t.album ?? album;
  return {
    id: t.id,
    title: t.title_short || t.title || '',
    artist: t.artist?.name ?? '',
    seconds: t.duration ?? 0,
    preview: t.preview || null,
    album: al ? { id: al.id, title: al.title ?? '', cover: al.cover_big ?? al.cover_medium ?? al.cover_xl ?? null } : null,
  };
};

/** The artist's releases, newest first (one of each title: the explicit and clean editions are two). */
export function newestFirst(list: Raw[]): DzRelease[] {
  const seen = new Set<string>();
  return list
    .map(releaseOf)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    .filter((r) => {
      const k = `${r.kind}|${norm(r.title)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

/** Related-artist lists → the ones named most often (then the most fans), skipping who you follow. */
export function suggest(lists: DzArtist[][], following: Set<string>, max = 12): DzArtist[] {
  const count = new Map<number, { a: DzArtist; n: number }>();
  for (const list of lists)
    for (const a of list) {
      if (following.has(norm(a.name))) continue;
      const c = count.get(a.id);
      count.set(a.id, { a, n: (c?.n ?? 0) + 1 });
    }
  return [...count.values()]
    .sort((x, y) => y.n - x.n || y.a.fans - x.a.fans)
    .slice(0, max)
    .map((c) => c.a);
}

/* ── the API ── */

const artists = new Map<string, Promise<DzArtist | null>>();

/** An artist by name (cached for the app's life; a miss is retried next time the app starts). */
export function findArtist(name: string): Promise<DzArtist | null> {
  const k = norm(name);
  if (!artists.has(k)) {
    const p = dz<{ data?: Raw[] }>(`/search/artist?q=${encodeURIComponent(name)}&limit=10`).then((r) => {
      const hit = pickArtist(r.data ?? [], name);
      return hit ? artistOf(hit) : null;
    });
    artists.set(k, p);
    p.catch(() => artists.delete(k)); // a network hiccup isn't "no such artist"
  }
  return artists.get(k)!;
}

export async function artistById(id: number): Promise<DzArtist> {
  return artistOf(await dz(`/artist/${id}`));
}

/** Everything they put out, newest first. */
export async function releases(artistId: number, limit = 50): Promise<DzRelease[]> {
  return newestFirst((await dz<{ data?: Raw[] }>(`/artist/${artistId}/albums?limit=${limit}`)).data ?? []);
}

/** Their most played songs, with previews. */
export async function topTracks(artistId: number, limit = 5): Promise<DzTrack[]> {
  return ((await dz<{ data?: Raw[] }>(`/artist/${artistId}/top?limit=${limit}`)).data ?? []).map((t) => trackOf(t));
}

/** "Fans also like". */
export async function related(artistId: number, limit = 12): Promise<DzArtist[]> {
  return ((await dz<{ data?: Raw[] }>(`/artist/${artistId}/related?limit=${limit}`)).data ?? []).map(artistOf);
}

const albums = new Map<number, Promise<DzAlbum>>();

/** A release's page: tracks (with previews), label, length, genres. Cached a little while (previews expire). */
export function album(id: number): Promise<DzAlbum> {
  if (!albums.has(id)) {
    const p = dz(`/album/${id}`).then(
      (a): DzAlbum => ({
        ...releaseOf(a),
        artist: { id: a.artist?.id, name: a.artist?.name ?? '', picture: a.artist?.picture_big ?? a.artist?.picture_medium ?? null },
        label: a.label || null,
        minutes: a.duration ? Math.round(a.duration / 60) : null,
        genres: (a.genres?.data ?? []).map((g: Raw) => g.name),
        fans: a.fans ?? 0,
        tracks: (a.tracks?.data ?? []).map((t: Raw) => trackOf(t, a)),
        link: a.link ?? `https://www.deezer.com/album/${id}`,
      }),
    );
    albums.set(id, p);
    p.catch(() => albums.delete(id));
    setTimeout(() => albums.delete(id), 20 * 60_000);
    if (albums.size > 30) albums.delete(albums.keys().next().value!);
  }
  return albums.get(id)!;
}

/** A release by artist and title: the strict search first, then a loose one (featured artists confuse the strict one). */
export async function findAlbum(artist: string, title: string): Promise<DzRelease | null> {
  const main = mainArtist(artist);
  const strict = await dz<{ data?: Raw[] }>(`/search/album?q=${encodeURIComponent(`artist:"${main}" album:"${title}"`)}&limit=5`);
  const hits = strict.data?.length ? strict.data : (await dz<{ data?: Raw[] }>(`/search/album?q=${encodeURIComponent(`${main} ${title}`)}&limit=5`)).data ?? [];
  const t = norm(title);
  const hit = hits.find((h) => norm(h.title ?? '') === t && norm(h.artist?.name ?? '') === norm(main)) ?? hits.find((h) => norm(h.title ?? '').startsWith(t));
  return hit ? releaseOf(hit) : null;
}

/** The search hit for a song by artist and title: same title and artist first, else that artist's best hit. */
async function searchSong(artist: string, title: string): Promise<Raw | null> {
  const main = norm(mainArtist(artist));
  const t = norm(title);
  const pick = (hits: Raw[]) =>
    hits.find((h) => norm(h.title_short ?? h.title ?? '') === t && norm(h.artist?.name ?? '') === main) ??
    hits.find((h) => norm(h.title_short ?? h.title ?? '').startsWith(t) && norm(h.artist?.name ?? '').includes(main)) ??
    null;
  // the strict search first; Deezer's strict syntax misses some (accents, "feat."), so then a plain one
  const strict = await dz<{ data?: Raw[] }>(`/search?q=${encodeURIComponent(`artist:"${mainArtist(artist)}" track:"${title}"`)}&limit=10`);
  const hit = pick(strict.data ?? []);
  if (hit) return hit;
  const loose = await dz<{ data?: Raw[] }>(`/search?q=${encodeURIComponent(`${mainArtist(artist)} ${title}`)}&limit=15`);
  return pick(loose.data ?? []) ?? (strict.data ?? []).find((h) => norm(h.artist?.name ?? '') === main) ?? null;
}

/** The exact recording by its ISRC (from Spotify); null when Deezer doesn't have it. */
async function byIsrc(isrc: string | null | undefined): Promise<Raw | null> {
  if (!isrc || !/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc)) return null;
  return dz<Raw>(`/track/isrc:${isrc}`).catch(() => null); // "no data" is an error answer
}

/** A song: by ISRC when Spotify gave one (exact), else by artist and title. */
async function song(artist: string, title: string, isrc?: string | null): Promise<{ hit: Raw; full: boolean } | null> {
  const exact = await byIsrc(isrc);
  if (exact?.id) return { hit: exact, full: true };
  const hit = await searchSong(artist, title);
  return hit ? { hit, full: false } : null;
}

/** A song by artist and title (the radio's track), with its BPM and release date. */
export async function findSong(artist: string, title: string, isrc?: string | null): Promise<DzSong | null> {
  const found = await song(artist, title, isrc);
  if (!found) return null;
  const { hit } = found;
  const full = found.full ? hit : await dz(`/track/${hit.id}`).catch(() => hit);
  return { ...trackOf(full, hit.album), bpm: full.bpm || null, gain: typeof full.gain === 'number' && full.gain !== 0 ? full.gain : null, date: full.release_date ?? full.album?.release_date ?? null, artistId: full.artist?.id ?? hit.artist?.id ?? null };
}

/** Just the 30-second preview of a song. Null when Deezer has none. */
export async function previewOf(artist: string, title: string, isrc?: string | null): Promise<string | null> {
  return (await song(artist, title, isrc))?.hit.preview || null;
}
