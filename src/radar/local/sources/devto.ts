import { get } from '../feeds';
import { truncate } from '../text';
import { item, type ContentSource, type FetchedItem } from './types';

/*
 * DEV Community (dev.to) articles for the topic's tags, through its free public API (no key): the
 * most liked of the last two days, so tutorials and write-ups, not every new post. ARTICLE cards.
 */

const EVERY = 3 * 3600_000;

type Article = {
  id: number;
  title?: string;
  description?: string;
  url?: string;
  cover_image?: string | null;
  social_image?: string | null;
  published_timestamp?: string;
  public_reactions_count?: number;
  comments_count?: number;
  user?: { name?: string; profile_image_90?: string };
};

export const toItem = (a: Article): FetchedItem | null =>
  !a.title || !a.url
    ? null
    : item({
        type: 'ARTICLE',
        sourceName: 'DEV',
        title: a.title,
        snippet: truncate(a.description?.trim() || null, 300),
        url: a.url,
        thumbnailUrl: a.cover_image ?? null,
        author: a.user?.name ?? null,
        authorAvatarUrl: a.user?.profile_image_90 ?? null,
        score: a.public_reactions_count ?? null,
        commentCount: a.comments_count ?? null,
        publishedAt: a.published_timestamp ? Date.parse(a.published_timestamp) || null : null,
      });

/** "#TypeScript" → "typescript" (dev.to tags are lower-case letters and digits) */
export const cleanTag = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '');

export const devto: ContentSource = {
  id: 'devto',
  async fetch(topic, ctx) {
    const merged = new Map<number, FetchedItem>();
    for (const tag of (topic.sources.devtoTags ?? []).map(cleanTag).filter(Boolean)) {
      if (!ctx.throttle.tryAcquire(`devto:${tag}`, EVERY)) continue;
      try {
        const list = JSON.parse(await get(`https://dev.to/api/articles?tag=${tag}&top=2&per_page=15`, 15_000, 'application/json')) as Article[];
        for (const a of list) {
          const it = toItem(a);
          if (it && !merged.has(a.id) && (!it.publishedAt || it.publishedAt >= ctx.since)) merged.set(a.id, it);
        }
      } catch (e) {
        console.warn(`Radar: dev.to #${tag} failed`, e);
      }
    }
    return [...merged.values()];
  },
};
