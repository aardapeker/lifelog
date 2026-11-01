import { fetch } from 'expo/fetch';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getKey } from './keys';

export const EMBED_MODEL = 'gemini-embedding-001';
export const EMBED_DIMS = 768;

type TaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

function normalize(v: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  const norm = Math.sqrt(sum) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

export async function embed(text: string, taskType: TaskType, apiKey: string): Promise<Float32Array> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: EMBED_DIMS,
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { embedding: { values: number[] } };
  return normalize(Float32Array.from(json.embedding.values));
}

export function toBlob(v: Float32Array): Uint8Array {
  return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
}

export function fromBlob(b: Uint8Array): Float32Array {
  // copy into an aligned buffer — SQLite blobs are not guaranteed 4-byte aligned
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
}

let running = false;

/**
 * Embed every chunk still marked pending/failed. Safe to call often:
 * it runs one batch at a time and silently does nothing without a Gemini key.
 * Returns how many chunks were embedded.
 */
export async function indexPending(db: SQLiteDatabase): Promise<number> {
  if (running) return 0;
  const apiKey = await getKey('gemini');
  if (!apiKey) return 0;
  running = true;
  let done = 0;
  try {
    const rows = await db.getAllAsync<{ id: number; text: string }>(
      "SELECT id, text FROM chunks WHERE status != 'done' LIMIT 100",
    );
    for (const row of rows) {
      try {
        const v = await embed(row.text, 'RETRIEVAL_DOCUMENT', apiKey);
        await db.runAsync(
          "UPDATE chunks SET vector = ?, model = ?, dims = ?, status = 'done' WHERE id = ?",
          toBlob(v),
          EMBED_MODEL,
          EMBED_DIMS,
          row.id,
        );
        done++;
      } catch (e) {
        await db.runAsync("UPDATE chunks SET status = 'failed' WHERE id = ?", row.id);
        // offline or quota — stop now, retry next time
        console.warn('embed failed', e);
        break;
      }
    }
  } finally {
    running = false;
  }
  return done;
}

export async function indexStats(db: SQLiteDatabase): Promise<{ done: number; waiting: number }> {
  const row = await db.getFirstAsync<{ done: number; waiting: number }>(
    "SELECT SUM(status = 'done') AS done, SUM(status != 'done') AS waiting FROM chunks",
  );
  return { done: row?.done ?? 0, waiting: row?.waiting ?? 0 };
}
