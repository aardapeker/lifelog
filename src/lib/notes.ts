import type { SQLiteDatabase } from 'expo-sqlite';

export type Note = {
  id: number;
  body: string;
  created_at: number;
  updated_at: number;
};

const CHUNK_WORDS = 400;

/** Split long entries so each chunk gets a sharp vector instead of one blurry one. */
export function chunkText(text: string): string[] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current: string[] = [];
  let words = 0;

  const flush = () => {
    if (current.length) chunks.push(current.join('\n\n'));
    current = [];
    words = 0;
  };

  for (const p of paragraphs) {
    const pWords = p.split(/\s+/);
    if (pWords.length > CHUNK_WORDS) {
      flush();
      for (let i = 0; i < pWords.length; i += CHUNK_WORDS) {
        chunks.push(pWords.slice(i, i + CHUNK_WORDS).join(' '));
      }
      continue;
    }
    if (words + pWords.length > CHUNK_WORDS) flush();
    current.push(p);
    words += pWords.length;
  }
  flush();
  return chunks;
}

async function rechunk(db: SQLiteDatabase, noteId: number, body: string): Promise<void> {
  await db.runAsync('DELETE FROM chunks WHERE note_id = ?', noteId);
  for (const text of chunkText(body)) {
    await db.runAsync('INSERT INTO chunks(note_id, text) VALUES (?, ?)', noteId, text);
  }
}

export function listNotes(db: SQLiteDatabase): Promise<Note[]> {
  return db.getAllAsync<Note>('SELECT * FROM notes ORDER BY created_at DESC');
}

export function getNote(db: SQLiteDatabase, id: number): Promise<Note | null> {
  return db.getFirstAsync<Note>('SELECT * FROM notes WHERE id = ?', id);
}

export function getNotesByIds(db: SQLiteDatabase, ids: number[]): Promise<Note[]> {
  if (!ids.length) return Promise.resolve([]);
  const placeholders = ids.map(() => '?').join(',');
  return db.getAllAsync<Note>(`SELECT * FROM notes WHERE id IN (${placeholders})`, ...ids);
}

export function recentNotes(db: SQLiteDatabase, days: number, limit = 30): Promise<Note[]> {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  return db.getAllAsync<Note>(
    'SELECT * FROM notes WHERE created_at >= ? ORDER BY created_at DESC LIMIT ?',
    since,
    limit,
  );
}

export async function saveNote(db: SQLiteDatabase, id: number | null, body: string): Promise<number> {
  const now = Date.now();
  let noteId = id;
  await db.withTransactionAsync(async () => {
    if (noteId === null) {
      const res = await db.runAsync(
        'INSERT INTO notes(body, created_at, updated_at) VALUES (?, ?, ?)',
        body,
        now,
        now,
      );
      noteId = res.lastInsertRowId;
    } else {
      await db.runAsync('UPDATE notes SET body = ?, updated_at = ? WHERE id = ?', body, now, noteId);
    }
    await rechunk(db, noteId, body);
  });
  return noteId!;
}

export async function deleteNote(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM notes WHERE id = ?', id);
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
