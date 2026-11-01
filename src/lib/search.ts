import type { SQLiteDatabase } from 'expo-sqlite';
import { embed, EMBED_MODEL, fromBlob } from './embeddings';
import { getKey } from './keys';
import { getNotesByIds, type Note } from './notes';

const CANDIDATES = 20;
const RRF_K = 60;

/** Turn free text into a safe FTS5 query: every word quoted, prefix-matched, OR-ed. */
function toFtsQuery(query: string): string | null {
  const words = query
    .split(/\s+/)
    .map((w) => w.replace(/["*^():{}\[\]]/g, ''))
    .filter((w) => w.length > 1);
  if (!words.length) return null;
  return words.map((w) => `"${w}"*`).join(' OR ');
}

async function keywordRanks(db: SQLiteDatabase, query: string): Promise<number[]> {
  const fts = toFtsQuery(query);
  if (!fts) return [];
  try {
    const rows = await db.getAllAsync<{ id: number }>(
      'SELECT rowid AS id FROM notes_fts WHERE notes_fts MATCH ? ORDER BY rank LIMIT ?',
      fts,
      CANDIDATES,
    );
    return rows.map((r) => r.id);
  } catch (e) {
    console.warn('fts failed', e);
    return [];
  }
}

async function vectorRanks(db: SQLiteDatabase, query: string): Promise<number[]> {
  const apiKey = await getKey('gemini');
  if (!apiKey) return [];
  let q: Float32Array;
  try {
    q = await embed(query, 'RETRIEVAL_QUERY', apiKey);
  } catch (e) {
    console.warn('query embed failed', e);
    return [];
  }

  const rows = await db.getAllAsync<{ note_id: number; vector: Uint8Array }>(
    "SELECT note_id, vector FROM chunks WHERE status = 'done' AND model = ?",
    EMBED_MODEL,
  );

  // vectors are normalized, so cosine similarity == dot product
  const best = new Map<number, number>();
  for (const row of rows) {
    const v = fromBlob(row.vector);
    if (v.length !== q.length) continue;
    let score = 0;
    for (let i = 0; i < v.length; i++) score += v[i] * q[i];
    if (score > (best.get(row.note_id) ?? -Infinity)) best.set(row.note_id, score);
  }

  return [...best.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, CANDIDATES)
    .map(([id]) => id);
}

/**
 * Hybrid search: keyword (FTS5) + meaning (embeddings), merged with
 * reciprocal rank fusion. Works with keywords only if there's no Gemini key.
 */
export async function hybridSearch(db: SQLiteDatabase, query: string, limit = 8): Promise<Note[]> {
  const [kw, vec] = await Promise.all([keywordRanks(db, query), vectorRanks(db, query)]);

  const scores = new Map<number, number>();
  for (const list of [kw, vec]) {
    list.forEach((id, rank) => scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + rank + 1)));
  }

  const ids = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  const notes = await getNotesByIds(db, ids);
  const byId = new Map(notes.map((n) => [n.id, n]));
  return ids.map((id) => byId.get(id)).filter((n): n is Note => !!n);
}
