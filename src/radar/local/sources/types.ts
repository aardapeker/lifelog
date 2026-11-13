import type { FeedItemType, RadarSettings, Topic } from '../../types';
import type { Throttle } from '../feeds';

/* Port of the backend's source.ContentSource / FetchedItem / FetchContext. */

export type FetchedItem = {
  type: FeedItemType;
  sourceName: string;
  title: string;
  snippet: string | null;
  url: string;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  author: string | null;
  authorAvatarUrl: string | null;
  score: number | null;
  commentCount: number | null;
  publishedAt: number | null; // ms
};

export type FetchContext = {
  since: number; // ms: older items are skipped
  settings: RadarSettings;
  throttle: Throttle; // at most once per interval per key, kept across runs
  cache: Record<string, string>; // small lookups kept across runs (YouTube handle → channel id)
};

/** One platform. Adding a platform = one more of these in sources/index.ts; ingest doesn't change. */
export interface ContentSource {
  id: string;
  fetch(topic: Topic, ctx: FetchContext): Promise<FetchedItem[]>;
}

export const item = (x: Partial<FetchedItem> & Pick<FetchedItem, 'type' | 'sourceName' | 'title' | 'url'>): FetchedItem => ({
  snippet: null,
  thumbnailUrl: null,
  mediaUrl: null,
  author: null,
  authorAvatarUrl: null,
  score: null,
  commentCount: null,
  publishedAt: null,
  ...x,
});

/** "linux kernel", torvalds → "\"linux kernel\" OR torvalds" (multi-word keywords as exact phrases). */
export const orQuery = (t: Topic) => t.keywords.map((k) => (k.includes(' ') ? `"${k}"` : k)).join(' OR ');
