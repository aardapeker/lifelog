import { get } from '../feeds';
import { toPlainText, truncate } from '../text';
import { item, type ContentSource, type FetchedItem } from './types';

/* Hacker News via the free Algolia search API. Produces DISCUSSION cards. */

type Hit = { objectID: string; title?: string; url?: string; author?: string; points?: number; num_comments?: number; created_at_i?: number; story_text?: string };

export const toItem = (h: Hit): FetchedItem =>
  item({
    type: 'DISCUSSION',
    sourceName: 'Hacker News',
    title: h.title ?? '',
    snippet: truncate(toPlainText(h.story_text), 300),
    url: `https://news.ycombinator.com/item?id=${h.objectID}`, // the card opens the discussion…
    mediaUrl: h.url ?? null, // …and mediaUrl keeps the linked article
    author: h.author ?? null,
    score: h.points ?? null,
    commentCount: h.num_comments ?? null,
    publishedAt: h.created_at_i ? h.created_at_i * 1000 : null,
  });

export const hackerNews: ContentSource = {
  id: 'hacker-news',
  async fetch(topic, ctx) {
    // Algolia has no OR: search each keyword and merge (dedupe by HN id)
    const merged = new Map<string, FetchedItem>();
    for (const k of topic.keywords) {
      const url =
        'https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=20' +
        `&query=${encodeURIComponent(k)}&numericFilters=${encodeURIComponent(`created_at_i>${Math.floor(ctx.since / 1000)}`)}`;
      try {
        const res = JSON.parse(await get(url, 15_000, 'application/json')) as { hits?: Hit[] };
        for (const h of res.hits ?? []) {
          // each run re-checks the last day, so a story is picked up once it reaches the minimum
          if ((h.points ?? 0) < ctx.settings.hackerNewsMinPoints || !h.title) continue;
          if (!merged.has(h.objectID)) merged.set(h.objectID, toItem(h));
        }
      } catch (e) {
        console.warn(`Radar: Hacker News failed for "${k}"`, e);
      }
    }
    return [...merged.values()];
  },
};
