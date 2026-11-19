import { get } from '../feeds';
import { truncate } from '../text';
import { item, type ContentSource, type FetchedItem } from './types';

/*
 * Movies and series from TMDB (The Movie Database: IMDb has no free API). Each topic picks lists
 * (upcoming in Turkish cinemas, now showing, trending films or series, series airing this week)
 * and/or people, whose new and upcoming films come in. MOVIE cards: poster, release date, rating.
 * Needs a free TMDB key (Radar settings), stored in the phone's keystore like the AI keys.
 * "This product uses the TMDB API but is not endorsed or certified by TMDB."
 */

/** The lists a topic can follow. `tv` lists are series. */
export const TMDB_LISTS: { id: string; label: string; path: string; tv?: boolean }[] = [
  { id: 'upcoming', label: 'Coming to cinemas', path: '/movie/upcoming?region=TR' },
  { id: 'now_playing', label: 'In cinemas now', path: '/movie/now_playing?region=TR' },
  { id: 'trending_movies', label: 'Trending films', path: '/trending/movie/week' },
  { id: 'trending_tv', label: 'Trending series', path: '/trending/tv/week', tv: true },
  { id: 'on_the_air', label: 'Series airing this week', path: '/tv/on_the_air', tv: true },
];

const EVERY = 12 * 3600_000; // lists change slowly: twice a day is plenty
const PER_LIST = 10;
const API = 'https://api.themoviedb.org/3';

type Title = {
  id: number;
  title?: string; // films
  name?: string; // series
  overview?: string;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  media_type?: string;
};

/** "4 Dec 2026", or null for a missing/odd date */
const day = (iso?: string) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? null : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

export function toItem(t: Title, tv: boolean): FetchedItem | null {
  const title = (tv ? t.name : t.title) ?? t.title ?? t.name;
  if (!title) return null;
  const date = day(tv ? t.first_air_date : t.release_date);
  const future = date && Date.parse((tv ? t.first_air_date : t.release_date)!) > Date.now();
  return item({
    type: 'MOVIE',
    sourceName: 'TMDB',
    title,
    snippet: truncate(t.overview?.trim() || null, 300),
    url: `https://www.themoviedb.org/${tv ? 'tv' : 'movie'}/${t.id}`,
    thumbnailUrl: t.poster_path ? `https://image.tmdb.org/t/p/w342${t.poster_path}` : null,
    // the card's info line: what it is and when ("Film · out 4 Dec 2026")
    author: [tv ? 'Series' : 'Film', date && (future ? `out ${date}` : date)].filter(Boolean).join(' · '),
    // ★ 7.8 only once enough people voted, else it's noise
    score: t.vote_average && (t.vote_count ?? 0) >= 20 ? Math.round(t.vote_average * 10) / 10 : null,
    publishedAt: Date.now(), // when it showed up in the list; the release date is on the card
  });
}

/** A v4 "read access token" (a long JWT) goes in a header, a v3 "API key" in the query: both work. */
async function call<T>(path: string, key: string): Promise<T> {
  const bearer = key.startsWith('eyJ');
  const url = `${API}${path}${path.includes('?') ? '&' : '?'}language=en-US${bearer ? '' : `&api_key=${encodeURIComponent(key)}`}`;
  return JSON.parse(await get(url, 15_000, 'application/json', bearer ? { Authorization: `Bearer ${key}` } : {})) as T;
}

/** "Christopher Nolan" → TMDB person id, remembered across runs. */
async function personId(name: string, key: string, cache: Record<string, string>): Promise<string | null> {
  const k = `tmdb:person:${name.toLowerCase()}`;
  if (cache[k]) return cache[k];
  const { results } = await call<{ results?: { id: number }[] }>(`/search/person?query=${encodeURIComponent(name)}`, key);
  const id = results?.[0]?.id;
  if (id) cache[k] = String(id);
  return id ? String(id) : null;
}

export const tmdb: ContentSource = {
  id: 'tmdb',
  async fetch(topic, ctx) {
    const lists = TMDB_LISTS.filter((l) => topic.sources.tmdbLists?.includes(l.id));
    const people = (topic.sources.tmdbPeople ?? []).map((p) => p.trim()).filter(Boolean);
    if (!lists.length && !people.length) return [];
    const key = ctx.tmdbKey;
    if (!key) return [];
    const out = new Map<string, FetchedItem>();
    const add = (titles: Title[] | undefined, tv: boolean) => {
      for (const t of (titles ?? []).slice(0, PER_LIST)) {
        const it = toItem(t, tv || t.media_type === 'tv');
        if (it && !out.has(it.url)) out.set(it.url, it);
      }
    };
    for (const l of lists) {
      if (!ctx.throttle.tryAcquire(`tmdb:${topic.id}:${l.id}`, EVERY)) continue;
      try {
        add((await call<{ results?: Title[] }>(l.path, key)).results, !!l.tv);
      } catch (e) {
        console.warn(`Radar: TMDB ${l.id} failed`, e);
      }
    }
    // a person's films from the last two months on, newest first (upcoming ones included)
    const from = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
    for (const name of people) {
      if (!ctx.throttle.tryAcquire(`tmdb:${topic.id}:person:${name.toLowerCase()}`, EVERY)) continue;
      try {
        const id = await personId(name, key, ctx.cache);
        if (!id) continue;
        const path = `/discover/movie?with_people=${id}&sort_by=primary_release_date.desc&primary_release_date.gte=${from}`;
        add((await call<{ results?: Title[] }>(path, key)).results, false);
      } catch (e) {
        console.warn(`Radar: TMDB ${name} failed`, e);
      }
    }
    return [...out.values()];
  },
};

/** Checks a key before it's saved: one tiny call. */
export async function testTmdbKey(key: string): Promise<boolean> {
  try {
    await call('/configuration', key.trim());
    return true;
  } catch {
    return false;
  }
}
