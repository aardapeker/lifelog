import type { AiSummary, Digest, DigestSettings, FeedItem, FeedQuery, IngestResult, RadarSettings, ReaderArticle, Topic, TopicInput } from './types';

/*
 * Everything Radar's screens may ask for, in one interface: the same calls as the radar repo's
 * REST API (GET /api/feed, /api/feed/{id}/summary, /reader, /story, /api/digest, …).
 *
 * Today the answer comes from the phone itself (local/index.ts: it fetches the feeds and keeps them
 * in SQLite). When the home server exists, write an ApiBackend with the same methods that calls the
 * server, return it from useRadar(), and the screens don't change.
 */
export interface RadarBackend {
  topics(): Promise<Topic[]>;
  saveTopic(id: number | null, t: TopicInput): Promise<Topic>;
  deleteTopic(id: number): Promise<void>;

  feed(q: FeedQuery): Promise<FeedItem[]>;
  item(id: string): Promise<FeedItem | null>;
  story(id: string): Promise<FeedItem[]>; // every source covering the item's story
  setSaved(id: string, saved: boolean): Promise<void>;
  markRead(id: string): Promise<void>;

  summary(id: string): Promise<AiSummary>;
  reader(id: string): Promise<ReaderArticle>;

  digest(): Promise<Digest>;
  refresh(): Promise<IngestResult>;
  lastRefresh(): Promise<number>;

  settings(): Promise<RadarSettings>;
  saveSettings(s: RadarSettings): Promise<void>;
  digestSettings(): Promise<DigestSettings>;
  saveDigestSettings(s: DigestSettings): Promise<void>;
  hiddenSites(): Promise<string[]>;
  setHidden(domain: string, hidden: boolean): Promise<void>;
}
