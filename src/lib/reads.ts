import type { SQLiteDatabase } from 'expo-sqlite';
import { getAutonomySettings, isNeverResearch } from './autonomySettings';
import { getChatConfig, parseJsonReply, PROVIDERS } from './chat';
import { aboutUser } from './context';
import { getSetting, setSetting, tooManyTries } from './db';
import { groundedSearch } from './gemini';
import { getKey } from './keys';

/*
 * Reads: after a chat goes quiet, the friend digs into its topic from three angles
 * (basics, what's new, practical) with Google Search, and writes a short magazine-style
 * article just for you, with every source kept. At most one a day.
 */

export type Article = {
  title: string;
  hook: string;
  minutes: number;
  sections: { heading: string; body: string }[];
  news: string[]; // "what's new" bullet points
  forYou: string; // why this matters to you specifically
  sources: { title: string; uri: string }[];
  queries: string[];
};

export type Read = {
  id: number;
  chat_id: number | null;
  topic: string;
  angles: string;
  why: string | null;
  status: 'pending' | 'done' | 'failed' | 'skipped';
  body: string | null;
  opened: number;
  digested: number;
  created_at: number;
  done_at: number | null;
};

export const articleOf = (r: Read): Article | null => {
  try {
    return r.body ? (JSON.parse(r.body) as Article) : null;
  } catch {
    return null;
  }
};

export function getRead(db: SQLiteDatabase, id: number): Promise<Read | null> {
  return db.getFirstAsync<Read>('SELECT * FROM reads WHERE id = ?', id);
}

export function listReads(db: SQLiteDatabase, limit = 20): Promise<Read[]> {
  return db.getAllAsync<Read>(
    "SELECT * FROM reads WHERE status IN ('done', 'pending') ORDER BY coalesce(done_at, created_at) DESC LIMIT ?",
    limit,
  );
}

/** The newest read you haven't opened yet, for the Journal card. */
export function unopenedRead(db: SQLiteDatabase): Promise<Read | null> {
  return db.getFirstAsync<Read>("SELECT * FROM reads WHERE status = 'done' AND opened = 0 ORDER BY done_at DESC LIMIT 1");
}

export async function markOpened(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('UPDATE reads SET opened = 1 WHERE id = ?', id);
}

export async function deleteRead(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM reads WHERE id = ?', id);
}

const dedupeSources = (list: { title: string; uri: string }[]) => {
  const seen = new Set<string>();
  return list.filter((s) => (seen.has(s.uri) ? false : (seen.add(s.uri), true)));
};

/** Researches one topic from its angles and writes the article. Throws if offline or keys are missing. */
export async function writeRead(db: SQLiteDatabase, read: Read): Promise<Article> {
  const geminiKey = await getKey('gemini');
  const chat = await getChatConfig(db);
  if (!geminiKey) throw new Error('Reads need a Gemini key for Google Search.');
  if (!chat.apiKey) throw new Error('Add an API key in Settings first.');

  const angles: string[] = JSON.parse(read.angles);
  const notes: string[] = [];
  let sources: { title: string; uri: string }[] = [];
  let queries: string[] = [];
  for (const angle of angles) {
    const found = await groundedSearch(
      geminiKey,
      PROVIDERS.gemini.defaultModel,
      `Research notes for a short article about "${read.topic}". This part: ${angle}. ` +
        'Give the key facts with specifics (names, numbers, dates, versions, prices) from current sources, ' +
        'in 6 to 10 plain sentences. Say clearly when something is uncertain or disputed.',
      'reads',
    );
    if (found.text) notes.push(`## ${angle}\n${found.text}`);
    sources = sources.concat(found.sources);
    queries = queries.concat(found.queries);
  }
  if (!notes.length) throw new Error('The search came back empty.');

  const reply = await PROVIDERS[chat.provider].complete({
    feature: 'reads',
    apiKey: chat.apiKey,
    model: chat.model,
    json: true,
    maxTokens: 2500,
    system:
      "You are the user's close friend who has read their journal. They were curious about a topic, so you researched " +
      'it and now write them a short, beautiful magazine-style article. Use ONLY the research notes for facts; never ' +
      'invent numbers, dates or claims. Warm and clear, a little personality, no hype, no filler. ' +
      'Return JSON: {"title": "headline, max 8 words", "hook": "one sentence that makes them want to read", ' +
      '"minutes": reading time as a number, "sections": [{"heading": "short", "body": "1-3 paragraphs separated by a blank line"}] (3 or 4 sections), ' +
      '"news": ["what\'s new lately, 0 to 4 short points"], "forYou": "2-3 sentences on why this matters to them, using what you know about their life"}. ' +
      'No links or citation numbers in the text. Write in the language of the conversation that started this.\n\n' +
      (await aboutUser(db)),
    prompt:
      `Topic: ${read.topic}\nWhat they asked or said: ${read.why ?? '(not recorded)'}\n\nResearch notes:\n\n${notes.join('\n\n')}`,
  });
  const a = parseJsonReply<Partial<Article>>(reply);
  const article: Article = {
    title: a.title?.trim() || read.topic,
    hook: a.hook?.trim() ?? '',
    minutes: Math.max(1, Math.min(15, Math.round(Number(a.minutes) || 3))),
    sections: (a.sections ?? [])
      .filter((s) => s?.heading?.trim() && s?.body?.trim())
      .map((s) => ({ heading: s.heading.trim(), body: s.body.trim() })),
    news: (a.news ?? []).map((n) => String(n).trim()).filter(Boolean).slice(0, 4),
    forYou: a.forYou?.trim() ?? '',
    sources: dedupeSources(sources).slice(0, 12),
    queries: [...new Set(queries)].slice(0, 8),
  };
  if (!article.sections.length) throw new Error('The article came back empty.');
  return article;
}

let running = false;

/** Writes the oldest pending Read, at most one per day. */
export async function writePendingReads(db: SQLiteDatabase, force = false): Promise<number> {
  if (running) return 0;
  const s = await getAutonomySettings(db);
  if (!s.enabled || !s.reads) return 0;
  if (!force) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const doneToday = await db.getFirstAsync(
      "SELECT id FROM reads WHERE status = 'done' AND done_at >= ?",
      today.getTime(),
    );
    if (doneToday) return 0;
  }
  const read = await db.getFirstAsync<Read>("SELECT * FROM reads WHERE status = 'pending' ORDER BY created_at LIMIT 1");
  if (!read) return 0;
  if (isNeverResearch(`${read.topic} ${read.angles}`, s.never)) {
    await db.runAsync("UPDATE reads SET status = 'skipped' WHERE id = ?", read.id);
    return 0;
  }

  running = true;
  try {
    const article = await writeRead(db, read);
    await db.runAsync(
      "UPDATE reads SET status = 'done', body = ?, done_at = ? WHERE id = ?",
      JSON.stringify(article),
      Date.now(),
      read.id,
    );
    return 1;
  } catch (e) {
    console.warn('read failed', e);
    // offline or a hiccup: try again later, but give up after 3 attempts so it can't eat searches forever
    if (await tooManyTries(db, `read.${read.id}`, e)) await db.runAsync("UPDATE reads SET status = 'failed' WHERE id = ?", read.id);
    return 0;
  } finally {
    running = false;
  }
}
