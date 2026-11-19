import { mb } from './sources/musicbrainz';

/*
 * An album/EP/single page from MusicBrainz: cover, date, label, the tracklist with lengths, and the
 * artist's other releases. Three requests through MusicBrainz's one-a-second queue, cached in memory.
 */

export type Track = { position: number; title: string; length: string | null };
export type Other = { id: string; title: string; year: string | null; type: string };
export type Album = {
  id: string;
  title: string;
  artist: string;
  artistId: string | null;
  type: string;
  date: string | null;
  label: string | null;
  cover: string;
  tracks: Track[];
  minutes: number | null;
  others: Other[];
  url: string;
};

type Raw = Record<string, any>; // MusicBrainz JSON, read field by field

/** "https://musicbrainz.org/release-group/<id>" → the id (a MUSIC item's mediaUrl). */
export const releaseGroupId = (url: string | null) => url?.match(/release-group\/([0-9a-f-]{36})/)?.[1] ?? null;

/** 245000 ms → "4:05" */
export function trackTime(ms: number | null | undefined): string | null {
  if (!ms) return null;
  const sec = Math.round(ms / 1000); // round first, or 59.9 s came out as "0:60"
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** The release to show for a group: the earliest official one (the original, not a later reissue). */
export function pickRelease(releases: Raw[]): Raw | null {
  const official = releases.filter((r) => !r.status || r.status === 'Official');
  return [...(official.length ? official : releases)].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'))[0] ?? null;
}

export function toAlbum(group: Raw, release: Raw | null, others: Raw[]): Album {
  const credit: Raw[] = group['artist-credit'] ?? [];
  const tracks: Track[] = (release?.media ?? []).flatMap((m: Raw) => m.tracks ?? []).map((t: Raw, i: number) => ({ position: i + 1, title: t.title ?? t.recording?.title ?? '?', length: trackTime(t.length ?? t.recording?.length) }));
  const totalMs = (release?.media ?? []).flatMap((m: Raw) => m.tracks ?? []).reduce((sum: number, t: Raw) => sum + (t.length ?? t.recording?.length ?? 0), 0);
  return {
    id: group.id,
    title: group.title ?? '',
    artist: credit.map((c) => `${c.name ?? ''}${c.joinphrase ?? ''}`).join('').trim(),
    artistId: credit[0]?.artist?.id ?? null,
    type: group['primary-type'] ?? 'Release',
    date: group['first-release-date'] || release?.date || null,
    label: release?.['label-info']?.[0]?.label?.name ?? null,
    cover: `https://coverartarchive.org/release-group/${group.id}/front-500`,
    tracks,
    minutes: totalMs ? Math.round(totalMs / 60000) : null,
    others: others
      .filter((o) => o.id !== group.id && ['Album', 'EP', 'Single'].includes(o['primary-type']) && !(o['secondary-types'] ?? []).length)
      .sort((a, b) => (b['first-release-date'] || '').localeCompare(a['first-release-date'] || ''))
      .slice(0, 12)
      .map((o) => ({ id: o.id, title: o.title, year: (o['first-release-date'] || '').slice(0, 4) || null, type: o['primary-type'] })),
    url: `https://musicbrainz.org/release-group/${group.id}`,
  };
}

const cache = new Map<string, Album>();

export async function albumDetails(groupId: string): Promise<Album> {
  const hit = cache.get(groupId);
  if (hit) return hit;
  const group = await mb<Raw>(`/release-group/${groupId}?inc=releases+artist-credits`);
  const pick = pickRelease(group.releases ?? []);
  const release = pick ? await mb<Raw>(`/release/${pick.id}?inc=recordings+labels`) : null;
  const artistId = group['artist-credit']?.[0]?.artist?.id;
  const others = artistId ? ((await mb<Raw>(`/release-group?artist=${artistId}&limit=100`))['release-groups'] ?? []) : [];
  const album = toAlbum(group, release, others);
  cache.set(groupId, album);
  if (cache.size > 30) cache.delete(cache.keys().next().value!);
  return album;
}
