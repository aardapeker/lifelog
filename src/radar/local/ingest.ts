import type { SQLiteDatabase } from 'expo-sqlite';
import type { IngestResult, Topic } from '../types';
import { Throttle } from './feeds';
import { SOURCES } from './sources';
import type { FetchedItem } from './sources/types';
import { sameStory, words } from './stories';
import { getJson, getSettings, listTopics, setJson } from './store';
import { domainOf, isMostlyLatin } from './text';

/*
 * Port of the backend's IngestionService: topics × sources → fetch → filter → dedupe → group into
 * stories → save. One broken source never stops the others. Runs from the background job (every
 * few hours) and from pull-to-refresh.
 */

const LOOKBACK = 24 * 3600_000;
const STORY_WINDOW = 48 * 3600_000; // how far back a new article may join an existing story
const KEEP_DAYS = 30; // older items go (saved ones stay)
const GROUPED = ['ARTICLE', 'DISCUSSION'];
const LATIN_LANGS = new Set(['en', 'tr', 'de', 'fr', 'es', 'it', 'pt', 'nl']);

let running: Promise<IngestResult> | null = null;

/** Fetches everything new. Concurrent calls share one run. */
export function ingestAll(db: SQLiteDatabase): Promise<IngestResult> {
  running ??= run(db).finally(() => (running = null));
  return running;
}

async function run(db: SQLiteDatabase): Promise<IngestResult> {
  const [topics, settings, throttleState, cache] = await Promise.all([
    listTopics(db),
    getSettings(db),
    getJson<Record<string, number>>(db, 'radar.throttle', {}),
    getJson<Record<string, string>>(db, 'radar.cache', {}),
  ]);
  const ctx = { since: Date.now() - LOOKBACK, settings, throttle: new Throttle(throttleState), cache };
  const latinOnly = settings.languages.every((l) => LATIN_LANGS.has(l));
  let fetched = 0;
  let saved = 0;
  for (const topic of topics) {
    // the sources of one topic run side by side (different sites), topics one after another
    const batches = await Promise.all(
      SOURCES.map((s) =>
        s.fetch(topic, ctx).then(
          (batch) => ({ id: s.id, batch }),
          (e) => {
            console.warn(`Radar: ${s.id} failed for ${topic.slug}`, e);
            return { id: s.id, batch: [] as FetchedItem[] };
          },
        ),
      ),
    );
    for (const { id, batch } of batches) {
      fetched += batch.length;
      saved += await save(db, topic, id, latinOnly ? batch.filter((f) => isMostlyLatin(f.title)) : batch);
    }
  }
  await Promise.all([setJson(db, 'radar.throttle', ctx.throttle.state), setJson(db, 'radar.cache', cache), setJson(db, 'radar.lastRefresh', Date.now())]);
  await db.runAsync('DELETE FROM radar_items WHERE published_at < ? AND saved_at IS NULL', Date.now() - KEEP_DAYS * 86_400_000);
  return { fetched, saved };
}

const excluded = (t: Topic, title: string) => {
  const low = title.toLowerCase();
  return t.excludeWords.some((w) => low.includes(w.toLowerCase()));
};

async function save(db: SQLiteDatabase, topic: Topic, sourceId: string, batch: FetchedItem[]): Promise<number> {
  // recent story leads of this topic, with their headline words
  const leadRows = await db.getAllAsync<{ id: number; title: string; thumbnail_url: string | null }>(
    `SELECT id, title, thumbnail_url FROM radar_items WHERE topic_id = ? AND story_id IS NULL AND type IN ('ARTICLE', 'DISCUSSION') AND published_at > ?`,
    topic.id,
    Date.now() - STORY_WINDOW,
  );
  const leads = leadRows.map((r) => ({ ...r, words: words(r.title, topic.keywords) }));
  let saved = 0;
  for (const f of batch) {
    if (!f.url || !f.title || excluded(topic, f.title)) continue;
    if (await db.getFirstAsync('SELECT 1 FROM radar_items WHERE topic_id = ? AND url = ?', topic.id, f.url)) continue;
    const grouped = GROUPED.includes(f.type);
    const w = grouped ? words(f.title, topic.keywords) : new Set<string>();
    // same story as a recent lead? join it: the feed shows one card "· N sources"
    const lead = grouped ? leads.find((l) => sameStory(w, l.words)) : undefined;
    if (!lead && (await db.getFirstAsync('SELECT 1 FROM radar_items WHERE topic_id = ? AND lower(title) = lower(?)', topic.id, f.title))) continue; // an exact repeat
    const published = Math.min(f.publishedAt ?? Date.now(), Date.now());
    const r = await db.runAsync(
      `INSERT OR IGNORE INTO radar_items (topic_id, source_id, type, source_name, title, snippet, url, thumbnail_url, media_url, author, author_avatar, score, comment_count, published_at, fetched_at, story_id, domain)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      topic.id,
      sourceId,
      f.type,
      f.sourceName,
      f.title,
      f.snippet,
      f.url,
      f.thumbnailUrl,
      f.mediaUrl,
      f.author,
      f.authorAvatarUrl,
      f.score,
      f.commentCount,
      published,
      Date.now(),
      lead?.id ?? null,
      domainOf(f.type === 'DISCUSSION' ? f.mediaUrl : f.url),
    );
    if (!r.changes) continue;
    saved++;
    if (lead && !lead.thumbnail_url && f.thumbnailUrl) {
      await db.runAsync('UPDATE radar_items SET thumbnail_url = ? WHERE id = ?', f.thumbnailUrl, lead.id); // borrow a picture
      lead.thumbnail_url = f.thumbnailUrl;
    }
    if (grouped && !lead) leads.push({ id: r.lastInsertRowId, title: f.title, thumbnail_url: f.thumbnailUrl, words: w });
  }
  return saved;
}
