import { lastFriday } from '../../../lib/cinemaDays';
import { tmdbCall, toItem } from './tmdb';
import type { ContentSource, FetchedItem } from './types';

/*
 * What's showing at YOUR cinemas (Settings → Music → Radio → Your cinemas: the same list the radio's cinema day
 * uses). Cinema chains have no public API and their apps' private ones are off limits, so Gemini + Google Search
 * reads their public pages, the way you'd look it up; each film is then found on TMDB, so the card and its page
 * are the usual movie ones (poster, story, cast, trailer, and what critics say).
 *
 * One search per film week (new films open on Fridays; again after 3 days for late additions). Nothing without a
 * source page goes in.
 */

const EVERY = 3 * 86_400_000;
const MAX = 14;

export type Showing = { title: string; original: string | null; year: number | null };

/** The model's reply → the films (tolerates chatter and ```json fences around the JSON). */
export function parseShowing(text: string): Showing[] {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b < a) return [];
  let j: { films?: unknown };
  try {
    j = JSON.parse(text.slice(a, b + 1));
  } catch {
    return [];
  }
  const seen = new Set<string>();
  return (Array.isArray(j.films) ? j.films : [])
    .map((f): Showing | null => {
      const o = typeof f === 'string' ? { title: f } : (f as Record<string, unknown>);
      const title = typeof o?.title === 'string' ? o.title.trim() : '';
      if (!title) return null;
      const original = typeof o.original === 'string' && o.original.trim() ? o.original.trim() : null;
      const year = Number(o.year);
      return { title, original, year: Number.isInteger(year) && year > 1900 ? year : null };
    })
    .filter((f): f is Showing => {
      const k = (f?.original ?? f?.title ?? '').toLowerCase();
      if (!f || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, MAX);
}

type TmdbFilm = { id: number; title?: string; release_date?: string; popularity?: number } & Record<string, unknown>;

/** The TMDB film for a title on Turkish screens now: released in the last 8 months or within the next 2. */
function pick(results: TmdbFilm[], year: number | null): TmdbFilm | null {
  const now = Date.now();
  const recent = results.filter((r) => {
    const t = r.release_date ? Date.parse(r.release_date) : NaN;
    return Number.isFinite(t) && t > now - 240 * 86_400_000 && t < now + 60 * 86_400_000;
  });
  const byYear = year ? results.filter((r) => r.release_date?.startsWith(String(year))) : [];
  return recent[0] ?? byYear[0] ?? null;
}

export const cinemaFilms: ContentSource = {
  id: 'cinemas',
  async fetch(topic, ctx) {
    if (!topic.sources.cinemaFilms || !ctx.cinemas || !ctx.search || !ctx.tmdbKey) return [];
    if (!ctx.throttle.tryAcquire(`cinemas:${topic.id}:${lastFriday(new Date())}`, EVERY)) return [];
    const found = await ctx.search(
      `Which films are showing this week at these cinemas in Turkey: ${ctx.cinemas}? Use their current programme pages ` +
        '(the chain\'s own site or a cinema listings site), nothing from memory. Answer ONLY with JSON: ' +
        '{"films":[{"title":"title as shown in Turkey","original":"original (usually English) title, or null","year":release year or null}]}. ' +
        'If you cannot find the current programme, return {"films":[]}.',
    );
    if (!found.sources.length) return []; // not backed by a page: nothing
    const out: FetchedItem[] = [];
    for (const f of parseShowing(found.text)) {
      try {
        const q = encodeURIComponent(f.original ?? f.title);
        const { results } = await tmdbCall<{ results?: TmdbFilm[] }>(`/search/movie?query=${q}&region=TR`, ctx.tmdbKey);
        const film = pick(results ?? [], f.year);
        const it = film && toItem(film, false);
        if (!it) continue;
        // the Turkish title too, when it's another name ("Spider-Man: Brand New Day · Örümcek-Adam: Yepyeni Bir Gün")
        const tr = f.title.toLowerCase() !== it.title.toLowerCase() ? f.title : null;
        out.push({ ...it, sourceName: 'Your cinemas', author: ['In cinemas now', tr].filter(Boolean).join(' · ') });
      } catch (e) {
        console.warn(`Radar: TMDB lookup for ${f.title} failed`, e);
      }
    }
    return out;
  },
};
