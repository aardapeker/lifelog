import { artistRadio, fame, findArtist, norm, type DzTrack } from './deezer';

/*
 * The radio's record crate: before the AI picks a show's songs, a few of the station's artists
 * (or, on Your Friend, your own top artists) get their Deezer "artist radio" pulled: real songs by
 * them and by artists like them, each marked as a big hit, well known or a deep cut. The music director
 * picks most of the playlist from that crate, so the songs really exist (fewer "not on Spotify"
 * swaps) and the show finds songs you haven't heard instead of the AI's usual favourites.
 * Free, no keys; if Deezer doesn't answer, the AI picks from memory like before.
 */

export type CrateSong = { title: string; artist: string; fame: ReturnType<typeof fame> };

/** `count` names drawn at random from the list (no repeats). */
export function draw<T>(list: T[], count: number, rand = Math.random): T[] {
  const pool = [...list];
  const out: T[] = [];
  while (pool.length && out.length < count) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}

/**
 * The radios' songs mixed together (round-robin, so one artist's radio doesn't fill the crate), with
 * repeats, banned and already-played songs left out.
 */
export function fillCrate(radios: DzTrack[][], skip: { title: string; artist: string }[], max = 45): CrateSong[] {
  const key = (title: string, artist: string) => `${norm(title)}|${norm(artist.split(/,|&| feat/i)[0])}`;
  const seen = new Set(skip.map((s) => key(s.title, s.artist)));
  const out: CrateSong[] = [];
  for (let i = 0; out.length < max && radios.some((r) => i < r.length); i++)
    for (const r of radios) {
      const t = r[i];
      if (!t || out.length >= max) continue;
      const k = key(t.title, t.artist);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ title: t.title, artist: t.artist, fame: fame(t.rank) });
    }
  return out;
}

/** The crate as lines for the music director: "Sana Değer" by Yıldız Tilbe (big hit) */
export const crateText = (crate: CrateSong[]) => crate.map((c) => `"${c.title}" by ${c.artist}${c.fame ? ` (${c.fame})` : ''}`).join('\n');

/** Pulls the crate for these seed artists (three at most, in parallel; whatever fails is left out). */
export async function buildCrate(seeds: string[], skip: { title: string; artist: string }[]): Promise<CrateSong[]> {
  const radios = await Promise.all(
    seeds.slice(0, 3).map(async (name) => {
      const a = await findArtist(name).catch(() => null);
      return a ? artistRadio(a.id, 30).catch(() => [] as DzTrack[]) : [];
    }),
  );
  return fillCrate(radios, skip);
}
