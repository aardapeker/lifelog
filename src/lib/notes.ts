import type { SQLiteDatabase } from 'expo-sqlite';

export type Note = {
  id: number;
  body: string;
  created_at: number;
  updated_at: number;
  mood?: number | null;
  mood_label?: string | null;
  song?: string | null; // JSON of a Spotify Track: what was playing when it was written
};

export type NoteSong = { id: string; name: string; artist: string; image: string | null };

export function noteSong(n: Pick<Note, 'song'>): NoteSong | null {
  try {
    return n.song ? (JSON.parse(n.song) as NoteSong) : null;
  } catch {
    return null;
  }
}

export async function setNoteSong(db: SQLiteDatabase, id: number, song: NoteSong | null): Promise<void> {
  const value = song ? JSON.stringify({ id: song.id, name: song.name, artist: song.artist, image: song.image }) : null;
  await db.runAsync('UPDATE notes SET song = ? WHERE id = ?', value, id);
}

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

/** Rebuilds the search chunks of a note: its text plus the captions of its photos. */
export async function rechunk(db: SQLiteDatabase, noteId: number, body?: string): Promise<void> {
  const text = body ?? (await getNote(db, noteId))?.body ?? '';
  const captions = await db.getAllAsync<{ caption: string }>(
    'SELECT caption FROM photos WHERE note_id = ? AND caption IS NOT NULL ORDER BY id',
    noteId,
  );
  const full = [text, ...captions.map((c) => `[Photo] ${c.caption}`)].filter(Boolean).join('\n\n');
  await db.runAsync('DELETE FROM chunks WHERE note_id = ?', noteId);
  for (const chunk of chunkText(full)) {
    await db.runAsync('INSERT INTO chunks(note_id, text) VALUES (?, ?)', noteId, chunk);
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
    // facts are re-learned from the new text
    await db.runAsync('DELETE FROM facts WHERE note_id = ?', noteId);
    await db.runAsync("UPDATE notes SET facts_status = 'pending' WHERE id = ?", noteId);
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

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export type DaySection = { key: string; day: number; month: string; weekday: string; data: Note[] };

/** Groups notes (already sorted newest first) into one section per calendar day. */
export function groupByDay(notes: Note[]): DaySection[] {
  const sections: DaySection[] = [];
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  for (const note of notes) {
    const d = new Date(note.created_at);
    const key = d.toDateString();
    let section = sections.find((s) => s.key === key);
    if (!section) {
      const weekday = key === today ? 'Today' : key === yesterday ? 'Yesterday' : WEEKDAYS[d.getDay()];
      const sameYear = d.getFullYear() === new Date().getFullYear();
      section = {
        key,
        day: d.getDate(),
        month: sameYear ? MONTHS[d.getMonth()] : `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
        weekday,
        data: [],
      };
      sections.push(section);
    }
    section.data.push(note);
  }
  return sections;
}

function partOfDay(hour: number): string {
  if (hour < 5) return 'Night';
  if (hour < 12) return 'Morning';
  if (hour < 18) return 'Afternoon';
  if (hour < 22) return 'Evening';
  return 'Night';
}

/** "Sunday Evening" — the headline of an entry. */
export function entryTitle(ms: number): string {
  const d = new Date(ms);
  return `${WEEKDAYS[d.getDay()]} ${partOfDay(d.getHours())}`;
}

export function greeting(now = new Date()): string {
  const p = partOfDay(now.getHours()).toLowerCase();
  return p === 'night' ? 'Still up?' : `Good ${p},`;
}

/** Entries written on this calendar day 1 month, 6 months and 1 year ago. */
export async function onThisDay(db: SQLiteDatabase, now = new Date()): Promise<{ label: string; note: Note }[]> {
  const out: { label: string; note: Note }[] = [];
  for (const [months, label] of [
    [12, 'One year ago'],
    [6, 'Six months ago'],
    [1, 'One month ago'],
  ] as const) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setMonth(day.getMonth() - months);
    if (day.getDate() !== now.getDate()) continue; // e.g. 31 March has no "a month ago"
    const note = await db.getFirstAsync<Note>(
      'SELECT * FROM notes WHERE created_at >= ? AND created_at < ? ORDER BY length(body) DESC LIMIT 1',
      day.getTime(),
      day.getTime() + 86_400_000,
    );
    if (note) out.push({ label, note });
  }
  return out;
}
