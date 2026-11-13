import type { SQLiteDatabase } from 'expo-sqlite';
import { geminiFirst } from '../../lib/chat';
import { notify } from '../../lib/notify';
import type { RadarBackend } from '../backend';
import type { AiSummary, Digest, FeedItem, ReaderArticle } from '../types';
import { ingestAll } from './ingest';
import { read, readable, summaryText, type ParsedArticle } from './reader';
import * as store from './store';

/*
 * The on-phone Radar "server": the backend's services (summary, reader, digest, ingestion) ported
 * to run against SQLite. See backend.ts for why it hides behind an interface.
 */

const MIN_TEXT_CHARS = 200; // below this ("Linux 7.3"), three bullets would only repeat the headline
const READ_TRIES = 4; // sources of a story to try before giving up

// the reader's last 50 pages, in memory only (never stored, like the backend's LRU)
const pages = new Map<string, ParsedArticle & { url: string }>();
const remember = (key: string, a: ParsedArticle & { url: string }) => {
  pages.delete(key);
  pages.set(key, a);
  if (pages.size > 50) pages.delete(pages.keys().next().value!);
};

/** The article page an item points at (HN: the linked article, not the thread). */
const articleUrl = (r: store.ItemRow) => (r.type === 'DISCUSSION' ? r.media_url : r.type === 'ARTICLE' ? r.url : null);

/** First readable article among the story's sources (readable sites first), noting which sites work. */
async function firstReadable(db: SQLiteDatabase, id: number): Promise<(ParsedArticle & { url: string }) | null> {
  const key = String(id);
  if (pages.has(key)) return pages.get(key)!;
  const rows = (await store.storyRows(db, id)).filter((r) => articleUrl(r));
  // the item itself first, then the rest of its story
  rows.sort((a, b) => (b.id === id ? 1 : 0) - (a.id === id ? 1 : 0));
  for (const r of rows.slice(0, READ_TRIES)) {
    const url = articleUrl(r)!;
    const a = await read(url);
    const ok = !!a && readable(a);
    await store.recordRead(db, r.domain, ok);
    if (ok) {
      const found = { ...a!, url };
      remember(key, found);
      return found;
    }
  }
  return null;
}

const bullets = (answer: string) =>
  answer
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^([-•*]|\d+[.)])\s+/.test(l))
    .map((l) => l.replace(/^([-•*]|\d+[.)])\s+/, '').trim())
    .filter(Boolean)
    .slice(0, 3);

export function localBackend(db: SQLiteDatabase): RadarBackend {
  const num = Number;
  // your starter topics, the very first time (everything that reads topics waits for it)
  const ready = store.ensureStarterTopics(db).catch(() => {});
  return {
    topics: () => ready.then(() => store.listTopics(db)),
    saveTopic: (id, t) => store.saveTopic(db, id, t),
    deleteTopic: async (id) => {
      await store.deleteTopic(db, id);
    },

    feed: (q) => store.feed(db, q),
    item: async (id) => {
      const r = await store.itemRow(db, num(id));
      return r ? store.toItem(r) : null;
    },
    story: async (id) => (await store.storyRows(db, num(id))).map(store.toItem),
    setSaved: async (id, saved) => {
      await store.setSaved(db, num(id), saved);
    },
    markRead: async (id) => {
      await store.markRead(db, num(id));
    },

    async summary(id): Promise<AiSummary> {
      const r = await store.itemRow(db, num(id));
      if (!r) return { status: 'unavailable', bullets: [], basis: null, provider: null, message: 'This item is gone.' };
      if (r.summary) return { status: 'ok', bullets: r.summary.split('\n'), basis: r.summary_basis as AiSummary['basis'], provider: r.summary_by, message: null };
      if (r.type === 'POST' || r.type === 'RELEASE') return { status: 'unsupported', bullets: [], basis: null, provider: null, message: "Short posts don't need a summary." };
      const llm = await geminiFirst(db);
      if (!llm) return { status: 'disabled', bullets: [], basis: null, provider: null, message: 'Add a Gemini key in Settings for AI summaries.' };
      // the best text there is: the article, a video's description, or the headline
      const article = r.type === 'ARTICLE' || r.type === 'DISCUSSION' ? await firstReadable(db, r.id) : null;
      const [text, basis]: [string, AiSummary['basis']] = article
        ? [summaryText(article), 'article']
        : r.type === 'VIDEO' && r.snippet
          ? [r.snippet, 'description']
          : [r.snippet ?? '', 'headline'];
      if (basis !== 'article' && text.trim().length < MIN_TEXT_CHARS) {
        return { status: 'unsupported', bullets: [], basis: null, provider: null, message: 'Nothing to summarize: the headline says it all.' };
      }
      try {
        const answer = await llm.adapter.complete({
          apiKey: llm.apiKey,
          model: llm.model,
          feature: 'radar',
          maxTokens: 400,
          system: 'You summarize news for a busy reader of a personal news feed.',
          prompt:
            'Write exactly 3 bullet points in English, each under 25 words.\n' +
            'Cover the key facts: what happened, who is involved, and why it matters.\n' +
            'Use only information from the title and text below. If the text is thin, write only what it supports. Never invent details.\n' +
            'Output only the 3 bullets, one per line, each starting with "- ". No intro, no closing line.\n\n' +
            `Title: ${r.title}\nSource: ${r.source_name ?? ''}\nText:\n"""\n${text}\n"""`,
        });
        const list = bullets(answer);
        if (!list.length) return { status: 'unavailable', bullets: [], basis: null, provider: null, message: 'The AI answer was empty. Try again.' };
        await db.runAsync('UPDATE radar_items SET summary = ?, summary_basis = ?, summary_by = ? WHERE id = ?', list.join('\n'), basis, llm.provider, r.id);
        return { status: 'ok', bullets: list, basis, provider: llm.provider, message: null };
      } catch (e) {
        return { status: 'unavailable', bullets: [], basis: null, provider: llm.provider, message: e instanceof Error ? e.message : String(e) };
      }
    },

    async reader(id): Promise<ReaderArticle> {
      const a = await firstReadable(db, num(id));
      return a
        ? { status: 'ok', title: a.title, siteName: a.siteName, url: a.url, blocks: a.blocks, message: null }
        : { status: 'unavailable', title: null, siteName: null, url: null, blocks: [], message: "Couldn't read this one here (paywall, login wall, or the page needs a browser)." };
    },

    digest: () => buildDigest(db),
    refresh: () => ready.then(() => ingestAll(db)),
    lastRefresh: () => store.getJson(db, 'radar.lastRefresh', 0),

    settings: () => store.getSettings(db),
    saveSettings: (s) => store.saveSettings(db, s),
    digestSettings: () => store.getDigestSettings(db),
    saveDigestSettings: (s) => store.saveDigestSettings(db, s),
    hiddenSites: () => store.hiddenSites(db),
    setHidden: async (d, h) => {
      await store.setHidden(db, d, h);
    },
  };
}

// ── the morning digest (port of digest.DigestService) ──

const PER_TOPIC = 3;

/** Big stories first, then one of each kind; readable sites before paywalled ones. */
function pick(items: FeedItem[]): FeedItem[] {
  const sorted = [...items].sort((a, b) => b.storyCount - a.storyCount || Number(a.paywalled) - Number(b.paywalled));
  const out: FeedItem[] = [];
  const kinds = new Set<string>();
  for (const d of sorted) {
    if (out.length < PER_TOPIC && (d.storyCount > 1 || !kinds.has(d.type))) {
      out.push(d);
      kinds.add(d.type);
    }
  }
  for (const d of sorted) if (out.length < PER_TOPIC && !out.includes(d)) out.push(d);
  return out;
}

/** Unread story leads of the last 24h, up to 3 per topic; the topic with the biggest story first. */
export async function buildDigest(db: SQLiteDatabase): Promise<Digest> {
  const since = Date.now() - 24 * 3600_000;
  const items = (await store.feed(db, { limit: 400 })).filter(
    (i) => Date.parse(i.publishedAt) >= since && !i.read && i.type !== 'SHORT' && (i.type !== 'POST' || (i.score ?? 0) >= 20),
  );
  const byTopic = new Map<string, FeedItem[]>();
  for (const i of items) byTopic.set(i.topic, [...(byTopic.get(i.topic) ?? []), i]);
  const sections = [...byTopic.values()]
    .map((list) => ({ topic: list[0].topic, topicName: list[0].topicName, topicColor: list[0].topicColor, items: pick(list) }))
    .sort((a, b) => b.items[0].storyCount - a.items[0].storyCount);
  return { since: new Date(since).toISOString(), sections };
}

/** From the background job: refresh, then once a day after your digest time, a notification. */
export async function radarJob(db: SQLiteDatabase): Promise<void> {
  if (!(await db.getFirstAsync('SELECT 1 FROM radar_topics'))) return; // Radar never opened yet
  const last = await store.getJson(db, 'radar.lastRefresh', 0);
  if (Date.now() - last > 90 * 60_000) await ingestAll(db);
  const s = await store.getDigestSettings(db);
  if (!s.enabled) return;
  const now = new Date();
  const [h, m] = s.time.split(':').map(Number);
  const due = new Date(now);
  due.setHours(h, m, 0, 0);
  const today = now.toDateString();
  if (now < due || now.getTime() - due.getTime() > 6 * 3600_000) return; // only in the hours after it
  if ((await store.getJson(db, 'radar.lastDigest', '')) === today) return;
  const d = await buildDigest(db);
  await store.setJson(db, 'radar.lastDigest', today);
  const all = d.sections.flatMap((x) => x.items);
  if (!all.length) return;
  await notify({
    title: `📡 Radar: ${all.length} thing${all.length === 1 ? '' : 's'} for you this morning`,
    body: d.sections.map((x) => `${x.topicName}: ${x.items[0].title}`).join('\n'),
    data: { kind: 'radar-digest' },
  }).catch(() => {});
}
