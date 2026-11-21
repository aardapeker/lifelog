import { norm } from '../../../lib/deezer';
import { get } from '../feeds';
import { shortDate, toPlainText, truncate } from '../text';
import { item, type ContentSource, type FetchedItem } from './types';
import { istanbul } from './f1';

/*
 * TV series from TVmaze (free, no key, about 20 calls per 10 seconds). A topic follows shows by name:
 * a TV card when a new episode has aired, and one when the next airs within a week (a countdown, in
 * Istanbul time). "Series premieres" adds the big new shows starting on streaming services today.
 * TMDB stays for films and trending lists; TVmaze knows the episode calendar.
 */

const API = 'https://api.tvmaze.com';
const EVERY = 6 * 3600_000;
const AIRED_WITHIN = 10 * 86_400_000; // a "new episode" card for episodes from the last ten days
const NEXT_WITHIN = 7 * 86_400_000; // a countdown card when the next one airs within a week
const BIG = 85; // TVmaze's popularity weight (0–100) for a premiere worth a card

export type Img = { medium?: string; original?: string } | null;
export type Episode = {
  id: number;
  url: string;
  name: string;
  season: number;
  number: number | null;
  airdate?: string;
  airstamp?: string | null;
  runtime?: number | null;
  rating?: { average?: number | null };
  image?: Img;
  summary?: string | null;
};
export type Show = {
  id: number;
  url: string;
  name: string;
  language?: string | null;
  genres?: string[];
  status?: string; // Running, Ended, To Be Determined, In Development
  premiered?: string | null;
  ended?: string | null;
  runtime?: number | null;
  averageRuntime?: number | null;
  schedule?: { time?: string; days?: string[] };
  rating?: { average?: number | null };
  weight?: number;
  network?: { name?: string; country?: { name?: string; timezone?: string } | null } | null;
  webChannel?: { name?: string } | null;
  image?: Img;
  summary?: string | null;
  _embedded?: {
    previousepisode?: Episode;
    nextepisode?: Episode;
    episodes?: Episode[];
    seasons?: { id: number; number: number; episodeOrder?: number | null; premiereDate?: string | null; endDate?: string | null }[];
    cast?: { person: { id: number; name: string; image?: Img }; character: { name: string; image?: Img } }[];
  };
};

let last = 0;
/** One TVmaze call, at most two a second (well under its limit), one retry after a 429. */
export async function tvmaze<T>(path: string, retried = false): Promise<T> {
  const wait = Math.max(0, last + 500 - Date.now());
  last = Date.now() + wait;
  if (wait) await new Promise((r) => setTimeout(r, wait));
  try {
    return JSON.parse(await get(`${API}${path}`, 15_000, 'application/json')) as T;
  } catch (e) {
    if (!retried && /\b429\b/.test(String(e))) {
      await new Promise((r) => setTimeout(r, 4000));
      return tvmaze<T>(path, true);
    }
    throw e;
  }
}

/* ── pure (tested) ── */

/** "S2 E5" (specials have no number). */
export const epCode = (e: Pick<Episode, 'season' | 'number'>) => (e.number != null ? `S${e.season} E${e.number}` : `S${e.season} special`);
export const airsAt = (e: Episode) => (e.airstamp ? Date.parse(e.airstamp) : e.airdate ? Date.parse(`${e.airdate}T12:00:00Z`) : NaN);
export const channelOf = (s: Show) => s.webChannel?.name ?? s.network?.name ?? null;
const picture = (i: Img | undefined) => i?.original ?? i?.medium ?? null;

/** "https://www.tvmaze.com/shows/82/game-of-thrones" (a TV card's mediaUrl) → 82 */
export const showIdOf = (url: string | null) => Number(url?.match(/tvmaze\.com\/shows\/(\d+)/)?.[1]) || null;
/** "https://www.tvmaze.com/episodes/4952/…" (a TV card's link) → 4952 */
export const episodeIdOf = (url: string) => Number(url.match(/tvmaze\.com\/episodes\/(\d+)/)?.[1]) || null;

/** The card for an episode that has aired. */
export function airedItem(show: Show, e: Episode): FetchedItem {
  const at = airsAt(e);
  return item({
    type: 'TV',
    sourceName: 'TVmaze',
    title: `${show.name} ${epCode(e)}: ${e.name}`,
    snippet: truncate(toPlainText(e.summary ?? null), 300),
    url: e.url,
    mediaUrl: show.url,
    thumbnailUrl: picture(e.image) ?? picture(show.image),
    author: ['New episode', channelOf(show), shortDate(at)].filter(Boolean).join(' · '),
    score: e.rating?.average ?? null,
    publishedAt: Number.isNaN(at) ? Date.now() : at,
  });
}

/** The countdown card for the next episode. Its own link (…#next), so the aired card comes later as a new one. */
export function nextItem(show: Show, e: Episode): FetchedItem {
  const at = airsAt(e);
  return item({
    type: 'TV',
    sourceName: 'TVmaze',
    title: `${show.name}: next episode ${istanbul(at)}`,
    snippet: e.name && !/^episode \d+$/i.test(e.name) ? `${epCode(e)}: ${e.name}` : epCode(e),
    url: `${e.url}#next`,
    mediaUrl: show.url,
    thumbnailUrl: picture(show.image),
    author: ['Coming up', channelOf(show), epCode(e)].filter(Boolean).join(' · '),
    publishedAt: Date.now(),
  });
}

/** A followed show's cards right now: the episode that just aired, and the next if it's close. */
export function showItems(show: Show, now = Date.now()): FetchedItem[] {
  const out: FetchedItem[] = [];
  const prev = show._embedded?.previousepisode;
  const next = show._embedded?.nextepisode;
  if (prev && now - airsAt(prev) <= AIRED_WITHIN && airsAt(prev) <= now) out.push(airedItem(show, prev));
  if (next && airsAt(next) - now <= NEXT_WITHIN && airsAt(next) > now) out.push(nextItem(show, next));
  return out;
}

/** Today's web/streaming schedule → the first episodes of big new shows (one per show). */
export function premieres(schedule: (Episode & { _embedded?: { show?: Show } })[]): FetchedItem[] {
  const seen = new Set<number>();
  return schedule
    .filter((e) => e.season === 1 && e.number === 1 && (e._embedded?.show?.weight ?? 0) >= BIG)
    .filter((e) => !seen.has(e._embedded!.show!.id) && !!seen.add(e._embedded!.show!.id))
    .map((e) => {
      const show = e._embedded!.show!;
      const it = airedItem(show, e);
      return { ...it, title: `New series: ${show.name}`, snippet: truncate(toPlainText(show.summary ?? null), 300), thumbnailUrl: picture(show.image), author: ['Premiere', channelOf(show), (show.genres ?? []).slice(0, 2).join(', ')].filter(Boolean).join(' · ') };
    });
}

/* ── the source ── */

/** "Severance" → TVmaze show id, remembered across runs (singlesearch: one show or none). */
async function showId(name: string, cache: Record<string, string>): Promise<number | null> {
  const k = `tvmaze:show:${norm(name)}`;
  if (cache[k]) return Number(cache[k]);
  const s = await tvmaze<Show | null>(`/singlesearch/shows?q=${encodeURIComponent(name)}`).catch((e) => (/\b404\b/.test(String(e)) ? null : Promise.reject(e)));
  if (!s?.id) return null;
  cache[k] = String(s.id);
  return s.id;
}

export const tvShows: ContentSource = {
  id: 'tvmaze',
  async fetch(topic, ctx) {
    const out: FetchedItem[] = [];
    for (const name of (topic.sources.tvShows ?? []).map((s) => s.trim()).filter(Boolean)) {
      if (!ctx.throttle.tryAcquire(`tvmaze:${topic.id}:${norm(name)}`, EVERY)) continue;
      try {
        const id = await showId(name, ctx.cache);
        if (!id) {
          console.warn(`Radar: TVmaze doesn't know "${name}"`);
          continue;
        }
        out.push(...showItems(await tvmaze<Show>(`/shows/${id}?embed[]=previousepisode&embed[]=nextepisode`)));
      } catch (e) {
        console.warn(`Radar: TVmaze ${name} failed`, e);
      }
    }
    if (topic.sources.tvPremieres && ctx.throttle.tryAcquire(`tvmaze:${topic.id}:premieres`, 20 * 3600_000)) {
      try {
        out.push(...premieres(await tvmaze(`/schedule/web`)));
      } catch (e) {
        console.warn('Radar: TVmaze premieres failed', e);
      }
    }
    return out;
  },
};

/* ── the show page ── */

const pages = new Map<number, Promise<Show>>();

/** Everything for a show's page in one call: episodes, seasons, cast, next episode. */
export function showPage(id: number): Promise<Show> {
  if (!pages.has(id)) {
    const p = tvmaze<Show>(`/shows/${id}?embed[]=episodes&embed[]=seasons&embed[]=cast&embed[]=nextepisode&embed[]=previousepisode`);
    pages.set(id, p);
    p.catch(() => pages.delete(id));
    setTimeout(() => pages.delete(id), 30 * 60_000);
  }
  return pages.get(id)!;
}
