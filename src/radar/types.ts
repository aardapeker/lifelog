/*
 * Radar's data, in the same shape as the radar repo's shared/api/types.ts (which mirrors the Spring
 * Boot DTOs). Keep it that way: when Radar moves to its own server, the screens keep working with
 * the API client instead of the on-phone backend.
 */

export type FeedItemType = 'VIDEO' | 'SHORT' | 'ARTICLE' | 'POST' | 'DISCUSSION' | 'RELEASE' | 'STOCK' | 'PAPER' | 'PODCAST';

export interface FeedItem {
  id: string;
  type: FeedItemType;
  topic: string; // slug
  topicName: string;
  topicColor: string;
  sourceName: string | null;
  title: string;
  snippet: string | null;
  url: string;
  thumbnailUrl: string | null;
  mediaUrl: string | null; // HN: the linked article
  author: string | null;
  authorAvatarUrl: string | null;
  score: number | null;
  commentCount: number | null;
  publishedAt: string; // ISO
  durationSeconds: number | null;
  storyCount: number; // sources covering this story (1 = just this one)
  saved: boolean;
  read: boolean;
  domain: string | null;
  paywalled: boolean;
}

export interface Digest {
  since: string;
  sections: { topic: string; topicName: string; topicColor: string; items: FeedItem[] }[];
}

export interface DigestSettings {
  enabled: boolean;
  time: string; // "HH:mm", the phone's time
}

export interface RadarSettings {
  languages: string[];
  hackerNewsMinPoints: number;
  youtubeMinViews: number; // kept for the server; channel feeds have no view counts
  mastodonMinLikes: number;
}

export interface AiSummary {
  status: 'ok' | 'disabled' | 'unsupported' | 'unavailable';
  bullets: string[];
  basis: 'article' | 'abstract' | 'description' | 'headline' | null;
  provider: string | null;
  message: string | null;
}

export interface ReaderBlock {
  type: 'h2' | 'h3' | 'p' | 'quote' | 'li' | 'img';
  text: string;
  src: string | null;
}

export interface ReaderArticle {
  status: 'ok' | 'unavailable';
  title: string | null;
  siteName: string | null;
  url: string | null; // may be another outlet covering the same story
  blocks: ReaderBlock[];
  message: string | null;
}

export interface IngestResult {
  fetched: number;
  saved: number;
}

/** Where a topic looks besides keyword search. youtubeChannels is phone-only (no YouTube API key here). */
export interface TopicSources {
  githubRepos: string[];
  mastodonTags: string[];
  arxiv: boolean;
  stockSymbol: string | null;
  youtubeChannels?: string[]; // "@handle" or a channel id "UC…"
}

export interface Topic {
  id: number;
  slug: string;
  name: string;
  color: string;
  keywords: string[];
  excludeWords: string[];
  sources: TopicSources;
}

export type TopicInput = Omit<Topic, 'id' | 'slug'>;

export interface FeedQuery {
  topic?: string; // slug; all topics when empty
  saved?: boolean;
  limit?: number;
  before?: string; // ISO publishedAt of the last item (keyset paging, like the server's cursor)
}
