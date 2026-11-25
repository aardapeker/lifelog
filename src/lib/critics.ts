import type { SQLiteDatabase } from 'expo-sqlite';
import { parseJsonReply, PROVIDERS } from './chat';
import { getSetting, setSetting } from './db';
import { groundedSearch, type Source } from './gemini';
import { getKey } from './keys';

/*
 * "What critics say" on a film's page: Gemini + Google Search reads real reviews and sums them up in a few lines,
 * with the pages it read. Asked for with a tap (one search), then kept on the phone for two weeks.
 */

export type Critics = { verdict: string; good: string[]; bad: string[]; sources: Source[]; at: number };

const KEEP = 14 * 86_400_000;
const keyOf = (kind: string, id: number) => `critics.${kind}.${id}`;

export async function cachedCritics(db: SQLiteDatabase, kind: string, id: number): Promise<Critics | null> {
  try {
    const c = JSON.parse(await getSetting(db, keyOf(kind, id), '')) as Critics;
    return Date.now() - c.at < KEEP ? c : null;
  } catch {
    return null;
  }
}

export async function lookUpCritics(db: SQLiteDatabase, kind: string, id: number, title: string, year: string | null): Promise<Critics> {
  const apiKey = await getKey('gemini');
  if (!apiKey) throw new Error('Needs a Gemini key (Settings → AI) for Google Search.');
  const found = await groundedSearch(
    apiKey,
    PROVIDERS.gemini.defaultModel,
    `What do critics and audiences say about the ${kind === 'tv' ? 'series' : 'film'} "${title}"${year ? ` (${year})` : ''}? ` +
      'Read real reviews (critics, Rotten Tomatoes / Metacritic summaries, audience reactions). No spoilers. Answer ONLY ' +
      'with JSON: {"verdict":"2 or 3 plain sentences: the overall feeling, and who will like it","good":["what they praise, ' +
      'short, up to 3"],"bad":["what they criticise, short, up to 3"]}. If there are no reviews yet, say so in the verdict ' +
      'and leave the lists empty.',
    'research',
  );
  if (!found.sources.length) throw new Error("Couldn't find any reviews for it.");
  const j = parseJsonReply<{ verdict?: string; good?: unknown; bad?: unknown }>(found.text);
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 3) : []);
  const c: Critics = { verdict: j.verdict?.trim() ?? '', good: list(j.good), bad: list(j.bad), sources: found.sources.slice(0, 4), at: Date.now() };
  if (!c.verdict) throw new Error("Couldn't sum the reviews up. Try again.");
  await setSetting(db, keyOf(kind, id), JSON.stringify(c));
  return c;
}
