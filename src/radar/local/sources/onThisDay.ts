import { get } from '../feeds';
import { truncate } from '../text';
import { item, type ContentSource, type FetchedItem } from './types';

/*
 * Wikipedia's "On this day": a few moments from history every morning, picked by Wikipedia's editors
 * ("selected" events), with the article's picture and first lines. Free, no key. HISTORY cards; the
 * page shows the whole day as a timeline.
 */

const PER_DAY = 3;

export type Moment = { year: number; text: string; title: string | null; image: string | null; extract: string | null; url: string | null };

type Raw = { year?: number; text?: string; pages?: { titles?: { normalized?: string }; thumbnail?: { source?: string }; extract?: string; content_urls?: { mobile?: { page?: string } } }[] };

export function toMoments(selected: Raw[]): Moment[] {
  return selected
    .filter((e) => e.text && typeof e.year === 'number')
    .map((e) => {
      const page = e.pages?.find((p) => p.thumbnail?.source) ?? e.pages?.[0];
      return {
        year: e.year!,
        text: e.text!.trim(),
        title: page?.titles?.normalized ?? null,
        image: page?.thumbnail?.source ?? null,
        extract: page?.extract ?? null,
        url: page?.content_urls?.mobile?.page ?? null,
      };
    })
    .sort((a, b) => b.year - a.year);
}

/** Three of the day's moments spread across the centuries, ones with a picture first. */
export function pickMoments(all: Moment[], n = PER_DAY): Moment[] {
  const pictured = all.filter((m) => m.image);
  const pool = pictured.length >= n ? pictured : all;
  if (pool.length <= n) return pool;
  return Array.from({ length: n }, (_, i) => pool[Math.round((i * (pool.length - 1)) / (n - 1))]);
}

/** "11-20" for today in Istanbul. */
export const monthDay = (t = Date.now()) => new Date(t + 3 * 3600_000).toISOString().slice(5, 10);

const cache = new Map<string, Moment[]>();

/** The day's selected moments (cached per day; the page reads the same list). */
export async function momentsOf(md = monthDay()): Promise<Moment[]> {
  const hit = cache.get(md);
  if (hit) return hit;
  const [m, d] = md.split('-');
  const raw = JSON.parse(await get(`https://en.wikipedia.org/api/rest_v1/feed/onthisday/selected/${m}/${d}`, 15_000, 'application/json')) as { selected?: Raw[] };
  const list = toMoments(raw.selected ?? []);
  cache.set(md, list);
  return list;
}

export function toItem(m: Moment, md: string): FetchedItem {
  return item({
    type: 'HISTORY',
    sourceName: 'Wikipedia',
    title: `${m.year}: ${m.text}`,
    snippet: truncate(m.extract, 280),
    url: `${m.url ?? `https://en.wikipedia.org/wiki/${encodeURIComponent((m.title ?? '').replace(/ /g, '_'))}`}#onthisday-${md}`, // the day in the link: the page opens that day
    thumbnailUrl: m.image,
    author: `On this day · ${new Date().getFullYear() - m.year} years ago`,
    publishedAt: Date.now(),
  });
}

export const onThisDay: ContentSource = {
  id: 'onthisday',
  async fetch(topic, ctx) {
    const md = monthDay();
    // once per (Istanbul) day: "again only if the last time was before today's midnight"
    const sinceMidnight = (Date.now() + 3 * 3600_000) % 86_400_000;
    if (!topic.sources.onThisDay || !ctx.throttle.tryAcquire(`otd:${topic.id}`, sinceMidnight)) return [];
    try {
      return pickMoments(await momentsOf(md)).map((m) => toItem(m, md));
    } catch (e) {
      console.warn('Radar: On this day failed', e);
      return [];
    }
  },
};
