import type { SQLiteDatabase } from 'expo-sqlite';
import { getSetting, setSetting } from '../../lib/db';
import type { DigestSettings, FeedItem, FeedItemType, FeedQuery, RadarSettings, Topic, TopicInput, TopicSources } from '../types';

/*
 * Radar's tables on the phone (radar_topics, radar_items, radar_sites) and its settings (kv
 * "radar.*"). This is the stand-in for the backend's repositories and Postgres.
 */

// ── topics ──

type TopicRow = { id: number; slug: string; name: string; color: string; keywords: string; exclude_words: string; sources: string };
const json = <T,>(s: string, fallback: T): T => {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};
const EMPTY_SOURCES: TopicSources = { githubRepos: [], mastodonTags: [], arxiv: false, stockSymbol: null, youtubeChannels: [] };
const toTopic = (r: TopicRow): Topic => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  color: r.color,
  keywords: json(r.keywords, []),
  excludeWords: json(r.exclude_words, []),
  sources: { ...EMPTY_SOURCES, ...json(r.sources, {}) },
});

export async function listTopics(db: SQLiteDatabase): Promise<Topic[]> {
  return (await db.getAllAsync<TopicRow>('SELECT * FROM radar_topics ORDER BY position, id')).map(toTopic);
}

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || `topic-${Date.now()}`;

export async function saveTopic(db: SQLiteDatabase, id: number | null, t: TopicInput): Promise<Topic> {
  const clean = (l: string[]) => [...new Set(l.map((x) => x.trim()).filter(Boolean))];
  const args = [t.name.trim(), t.color, JSON.stringify(clean(t.keywords)), JSON.stringify(clean(t.excludeWords)), JSON.stringify(t.sources)];
  if (id) {
    await db.runAsync('UPDATE radar_topics SET name = ?, color = ?, keywords = ?, exclude_words = ?, sources = ? WHERE id = ?', ...args, id);
  } else {
    let slug = slugify(t.name);
    if (await db.getFirstAsync('SELECT 1 FROM radar_topics WHERE slug = ?', slug)) slug = `${slug}-${Date.now() % 10000}`;
    const pos = (await db.getFirstAsync<{ n: number }>('SELECT coalesce(max(position), 0) + 1 AS n FROM radar_topics'))?.n ?? 0;
    const r = await db.runAsync(
      'INSERT INTO radar_topics (name, color, keywords, exclude_words, sources, slug, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ...args,
      slug,
      pos,
      Date.now(),
    );
    id = r.lastInsertRowId;
  }
  return toTopic((await db.getFirstAsync<TopicRow>('SELECT * FROM radar_topics WHERE id = ?', id))!);
}

export const deleteTopic = (db: SQLiteDatabase, id: number) => db.runAsync('DELETE FROM radar_topics WHERE id = ?', id);

/** Your topics, the first time Radar opens (Apple, Tesla and OpenAI were scrapped 🫡). */
const STARTERS: TopicInput[] = [
  {
    name: 'Linux',
    color: '#F5C211',
    keywords: ['Linux', 'Linux kernel'],
    excludeWords: [],
    sources: { ...EMPTY_SOURCES, githubRepos: ['torvalds/linux'], mastodonTags: ['linux'], youtubeChannels: ['@TheLinuxEXP', '@BrodieRobertson', '@DistroTube'] },
  },
  {
    name: 'Linus Torvalds',
    color: '#9AD8AE',
    keywords: ['Linus Torvalds', 'Torvalds'],
    excludeWords: [],
    sources: { ...EMPTY_SOURCES },
  },
  {
    name: 'Fedora',
    color: '#51A2DA',
    keywords: ['Fedora Linux', 'Fedora Workstation', 'Fedora Project'],
    excludeWords: ['fedora hat', 'hats'], // the hat, not the distro ("hat" alone would drop Red Hat news)
    sources: { ...EMPTY_SOURCES, mastodonTags: ['fedora'] },
  },
  {
    name: 'Claude',
    color: '#D97757',
    keywords: ['Claude AI', 'Anthropic', 'Claude Code'],
    excludeWords: ['Monet', 'Van Damme'],
    sources: { ...EMPTY_SOURCES, githubRepos: ['anthropics/claude-code'], mastodonTags: ['ClaudeAI', 'Anthropic'], youtubeChannels: ['@anthropic-ai'] },
  },
];

export async function ensureStarterTopics(db: SQLiteDatabase): Promise<void> {
  if ((await getSetting(db, 'radar.seeded', '')) === '1') return;
  await setSetting(db, 'radar.seeded', '1');
  if (await db.getFirstAsync('SELECT 1 FROM radar_topics')) return;
  for (const t of STARTERS) await saveTopic(db, null, t);
}

// ── settings ──

const DEFAULTS: RadarSettings = { languages: ['en'], hackerNewsMinPoints: 5, youtubeMinViews: 0, mastodonMinLikes: 3 };
export const DIGEST_DEFAULTS: DigestSettings = { enabled: true, time: '06:00' };

export const getSettings = async (db: SQLiteDatabase): Promise<RadarSettings> => ({ ...DEFAULTS, ...json(await getSetting(db, 'radar.settings', '{}'), {}) });
export const saveSettings = (db: SQLiteDatabase, s: RadarSettings) =>
  setSetting(db, 'radar.settings', JSON.stringify({ ...s, languages: [...new Set(['en', ...s.languages])] })); // English is always on (see the radar repo's notes)
export const getDigestSettings = async (db: SQLiteDatabase): Promise<DigestSettings> => ({ ...DIGEST_DEFAULTS, ...json(await getSetting(db, 'radar.digest', '{}'), {}) });
export const saveDigestSettings = (db: SQLiteDatabase, s: DigestSettings) => setSetting(db, 'radar.digest', JSON.stringify(s));
export const getJson = async <T,>(db: SQLiteDatabase, key: string, fallback: T): Promise<T> => json(await getSetting(db, key, ''), fallback);
export const setJson = (db: SQLiteDatabase, key: string, v: unknown) => setSetting(db, key, JSON.stringify(v));

// ── items ──

export type ItemRow = {
  id: number;
  topic_id: number;
  source_id: string;
  type: FeedItemType;
  source_name: string | null;
  title: string;
  snippet: string | null;
  url: string;
  thumbnail_url: string | null;
  media_url: string | null;
  author: string | null;
  author_avatar: string | null;
  score: number | null;
  comment_count: number | null;
  published_at: number;
  story_id: number | null;
  domain: string | null;
  saved_at: number | null;
  read_at: number | null;
  summary: string | null;
  summary_basis: string | null;
  summary_by: string | null;
  // joined
  slug: string;
  topic_name: string;
  topic_color: string;
  story_count: number;
  paywalled: number;
};

/** One select for every list: topic, story size and the site's paywall flag come along. */
const SELECT = `
  SELECT i.*, t.slug, t.name AS topic_name, t.color AS topic_color,
    1 + (SELECT count(*) FROM radar_items m WHERE m.story_id = i.id) AS story_count,
    coalesce((SELECT s.fail >= 2 AND s.fail > s.ok FROM radar_sites s WHERE s.domain = i.domain), 0) AS paywalled
  FROM radar_items i JOIN radar_topics t ON t.id = i.topic_id`;
const NOT_HIDDEN = 'NOT EXISTS (SELECT 1 FROM radar_sites h WHERE h.domain = i.domain AND h.hidden = 1)';

export const toItem = (r: ItemRow): FeedItem => ({
  id: String(r.id),
  type: r.type,
  topic: r.slug,
  topicName: r.topic_name,
  topicColor: r.topic_color,
  sourceName: r.source_name,
  title: r.title,
  snippet: r.snippet,
  url: r.url,
  thumbnailUrl: r.thumbnail_url,
  mediaUrl: r.media_url,
  author: r.author,
  authorAvatarUrl: r.author_avatar,
  score: r.score,
  commentCount: r.comment_count,
  publishedAt: new Date(r.published_at).toISOString(),
  durationSeconds: null,
  storyCount: r.story_count,
  saved: !!r.saved_at,
  read: !!r.read_at,
  domain: r.domain,
  paywalled: !!r.paywalled,
});

/** The feed: story leads only (one card per story), newest first, hidden sites left out. */
export async function feed(db: SQLiteDatabase, q: FeedQuery): Promise<FeedItem[]> {
  const where = [NOT_HIDDEN];
  const args: (string | number)[] = [];
  if (q.saved) where.push('i.saved_at IS NOT NULL');
  else where.push('i.story_id IS NULL');
  if (q.topic) {
    where.push('t.slug = ?');
    args.push(q.topic);
  }
  if (q.before) {
    where.push('i.published_at < ?');
    args.push(Date.parse(q.before));
  }
  const rows = await db.getAllAsync<ItemRow>(
    `${SELECT} WHERE ${where.join(' AND ')} ORDER BY ${q.saved ? 'i.saved_at' : 'i.published_at'} DESC LIMIT ?`,
    ...args,
    q.limit ?? 30,
  );
  return rows.map(toItem);
}

export const itemRow = (db: SQLiteDatabase, id: number) => db.getFirstAsync<ItemRow>(`${SELECT} WHERE i.id = ?`, id);

/** Every source of a story (the lead first, readable sites before paywalled ones). */
export async function storyRows(db: SQLiteDatabase, id: number): Promise<ItemRow[]> {
  const row = await itemRow(db, id);
  if (!row) return [];
  const lead = row.story_id ?? row.id;
  return db.getAllAsync<ItemRow>(`${SELECT} WHERE (i.id = ? OR i.story_id = ?) AND ${NOT_HIDDEN} ORDER BY i.id = ? DESC, paywalled, i.published_at`, lead, lead, lead);
}

export const setSaved = (db: SQLiteDatabase, id: number, saved: boolean) =>
  db.runAsync('UPDATE radar_items SET saved_at = ? WHERE id = ?', saved ? Date.now() : null, id);
export const markRead = (db: SQLiteDatabase, id: number) =>
  db.runAsync('UPDATE radar_items SET read_at = coalesce(read_at, ?) WHERE id = ?', Date.now(), id);

// ── sites ──

/** The reader worked (or not) on this site: 2+ failures and more failures than successes = paywalled. */
export const recordRead = (db: SQLiteDatabase, domain: string | null, ok: boolean) =>
  domain
    ? db.runAsync(
        `INSERT INTO radar_sites (domain, ok, fail) VALUES (?, ?, ?) ON CONFLICT(domain) DO UPDATE SET ok = ok + excluded.ok, fail = fail + excluded.fail`,
        domain,
        ok ? 1 : 0,
        ok ? 0 : 1,
      )
    : Promise.resolve();

export const setHidden = (db: SQLiteDatabase, domain: string, hidden: boolean) =>
  db.runAsync('INSERT INTO radar_sites (domain, hidden) VALUES (?, ?) ON CONFLICT(domain) DO UPDATE SET hidden = excluded.hidden', domain, hidden ? 1 : 0);

export const hiddenSites = async (db: SQLiteDatabase) =>
  (await db.getAllAsync<{ domain: string }>('SELECT domain FROM radar_sites WHERE hidden = 1 ORDER BY domain')).map((r) => r.domain);
