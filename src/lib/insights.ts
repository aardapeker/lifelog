import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getBackgroundConfig, parseJsonReply } from './chat';
import { getCheckinSettings, shiftFor, SHIFTS, type Shift } from './checkins';
import { getSetting } from './db';
import { getNotesByIds, type Note } from './notes';
import { hybridSearch } from './search';

const DAY = 86_400_000;

// ───────────── mood ─────────────

const dayKey = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Average mood per day for the last `days` days. */
export async function moodByDay(db: SQLiteDatabase, days = 84): Promise<Map<number, number>> {
  const rows = await db.getAllAsync<{ created_at: number; mood: number }>(
    'SELECT created_at, mood FROM notes WHERE mood IS NOT NULL AND created_at >= ?',
    Date.now() - days * DAY,
  );
  const sums = new Map<number, { sum: number; n: number }>();
  for (const r of rows) {
    const k = dayKey(r.created_at);
    const s = sums.get(k) ?? { sum: 0, n: 0 };
    sums.set(k, { sum: s.sum + r.mood, n: s.n + 1 });
  }
  return new Map([...sums].map(([k, s]) => [k, s.sum / s.n]));
}

/** Average mood per shift, using the rotation from Check-ins. */
export async function moodByShift(db: SQLiteDatabase): Promise<{ shift: Shift; label: string; mood: number; n: number }[]> {
  const s = await getCheckinSettings(db);
  const rows = await db.getAllAsync<{ created_at: number; mood: number }>(
    'SELECT created_at, mood FROM notes WHERE mood IS NOT NULL AND created_at >= ?',
    Date.now() - 180 * DAY,
  );
  return SHIFTS.map((sh) => {
    const own = rows.filter((r) => shiftFor(s, r.created_at) === sh.key);
    const mood = own.length ? own.reduce((a, r) => a + r.mood, 0) / own.length : 0;
    return { shift: sh.key, label: sh.label, mood, n: own.length };
  }).filter((x) => x.n > 0);
}

export async function topMoodWords(db: SQLiteDatabase, days = 30): Promise<string[]> {
  const rows = await db.getAllAsync<{ mood_label: string; n: number }>(
    'SELECT mood_label, count(*) AS n FROM notes WHERE mood_label IS NOT NULL AND created_at >= ? GROUP BY mood_label ORDER BY n DESC LIMIT 4',
    Date.now() - days * DAY,
  );
  return rows.map((r) => r.mood_label);
}

// ───────────── goals ─────────────

export type Goal = { id: number; title: string; created_at: number; done: number; entries: number; last: number | null };

export function listGoals(db: SQLiteDatabase): Promise<Goal[]> {
  return db.getAllAsync<Goal>(
    `SELECT g.*, count(n.id) AS entries, max(n.created_at) AS last
     FROM goals g LEFT JOIN note_goals ng ON ng.goal_id = g.id LEFT JOIN notes n ON n.id = ng.note_id
     GROUP BY g.id ORDER BY g.done, coalesce(max(n.created_at), g.created_at) DESC`,
  );
}

export function getGoal(db: SQLiteDatabase, id: number): Promise<Goal | null> {
  return db.getFirstAsync<Goal>(
    `SELECT g.*, count(ng.note_id) AS entries, NULL AS last FROM goals g
     LEFT JOIN note_goals ng ON ng.goal_id = g.id WHERE g.id = ? GROUP BY g.id`,
    id,
  );
}

export function goalNotes(db: SQLiteDatabase, id: number): Promise<Note[]> {
  return db.getAllAsync<Note>(
    'SELECT n.* FROM notes n JOIN note_goals ng ON ng.note_id = n.id WHERE ng.goal_id = ? ORDER BY n.created_at DESC',
    id,
  );
}

/** Days since an open goal was last mentioned (from its creation if never). */
export const quietDays = (g: Goal) => Math.floor((Date.now() - (g.last ?? g.created_at)) / DAY);

/** Goals untouched for 10+ days, for the friend to nudge you about. */
export async function quietGoals(db: SQLiteDatabase): Promise<Goal[]> {
  return (await listGoals(db)).filter((g) => !g.done && quietDays(g) >= 10);
}

/** Adds a goal, then links past entries that are really about it (search, then the AI confirms). */
export async function addGoal(db: SQLiteDatabase, title: string): Promise<number> {
  const res = await db.runAsync('INSERT INTO goals(title, created_at) VALUES (?, ?)', title.trim(), Date.now());
  const id = res.lastInsertRowId;
  backfillGoal(db, id, title.trim()).catch((e) => console.warn('goal backfill failed', e));
  return id;
}

async function backfillGoal(db: SQLiteDatabase, id: number, title: string): Promise<void> {
  const ai = await getBackgroundConfig(db);
  const candidates = await hybridSearch(db, title, 15);
  if (!ai || !candidates.length) return;
  const reply = await ai.adapter.complete({
    apiKey: ai.apiKey,
    model: ai.model,
    json: true,
    system:
      `The writer has a goal: "${title}". Below are journal entries, each starting with [id]. ` +
      'Return {"ids":[…]} with the ids of entries that are clearly about this goal. Be strict.',
    prompt: candidates.map((n) => `[${n.id}] ${n.body.slice(0, 600)}`).join('\n\n'),
  });
  const { ids } = parseJsonReply<{ ids?: number[] }>(reply);
  const valid = new Set(candidates.map((n) => n.id));
  for (const noteId of ids ?? []) {
    if (valid.has(Number(noteId))) {
      await db.runAsync('INSERT OR IGNORE INTO note_goals(note_id, goal_id) VALUES (?, ?)', Number(noteId), id);
    }
  }
}

export async function setGoalDone(db: SQLiteDatabase, id: number, done: boolean): Promise<void> {
  await db.runAsync('UPDATE goals SET done = ? WHERE id = ?', done ? 1 : 0, id);
}

export async function deleteGoal(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM goals WHERE id = ?', id);
}

/** Goals the AI noticed in your entries that you haven't added yet. */
export async function goalSuggestions(db: SQLiteDatabase): Promise<string[]> {
  const [facts, goals] = await Promise.all([
    db.getAllAsync<{ text: string }>("SELECT DISTINCT text FROM facts WHERE kind = 'goal' ORDER BY created_at DESC LIMIT 12"),
    db.getAllAsync<{ title: string }>('SELECT title FROM goals'),
  ]);
  const have = goals.map((g) => g.title.toLowerCase());
  return facts
    .map((f) => f.text)
    .filter((t) => !have.some((h) => t.toLowerCase().includes(h) || h.includes(t.toLowerCase())))
    .slice(0, 3);
}

// ───────────── people & pets ─────────────

export type Person = { name: string; kind: string; facts: number };

export function listPeople(db: SQLiteDatabase): Promise<Person[]> {
  return db.getAllAsync<Person>(
    `SELECT subject AS name, max(kind) AS kind, count(*) AS facts FROM facts
     WHERE subject IS NOT NULL AND kind IN ('person', 'pet')
     GROUP BY lower(subject) ORDER BY facts DESC LIMIT 40`,
  );
}

export async function personPage(db: SQLiteDatabase, name: string) {
  const facts = await db.getAllAsync<{ id: number; text: string; kind: string; note_id: number | null }>(
    'SELECT id, text, kind, note_id FROM facts WHERE lower(subject) = lower(?) ORDER BY created_at DESC',
    name,
  );
  const ids = new Set(facts.map((f) => f.note_id).filter((x): x is number => x !== null));
  try {
    const word = name.replace(/["*^():{}\[\]]/g, '');
    const hits = await db.getAllAsync<{ id: number }>(
      'SELECT rowid AS id FROM notes_fts WHERE notes_fts MATCH ? LIMIT 50',
      `"${word}"*`,
    );
    hits.forEach((h) => ids.add(h.id));
  } catch {
    // name with odd characters: facts alone are enough
  }
  const notes = (await getNotesByIds(db, [...ids])).sort((a, b) => b.created_at - a.created_at);
  return { facts, notes };
}

// ───────────── video ideas ─────────────

export type Idea = { id: number; note_id: number | null; text: string; done: number; created_at: number };

export function listIdeas(db: SQLiteDatabase): Promise<Idea[]> {
  return db.getAllAsync<Idea>('SELECT * FROM ideas ORDER BY done, created_at DESC');
}

export async function addIdea(db: SQLiteDatabase, text: string): Promise<void> {
  await db.runAsync('INSERT INTO ideas(text, created_at) VALUES (?, ?)', text.trim(), Date.now());
}

export async function setIdeaDone(db: SQLiteDatabase, id: number, done: boolean): Promise<void> {
  await db.runAsync('UPDATE ideas SET done = ? WHERE id = ?', done ? 1 : 0, id);
}

export async function deleteIdea(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM ideas WHERE id = ?', id);
}

// ───────────── export (for the future home server) ─────────────

/**
 * Everything as plain JSON: entries, photos (names + captions), facts, goals, ideas, recaps.
 * Not encrypted: this is for moving to your own server, not for storing in the cloud.
 * Embeddings are left out on purpose: the server can re-create them with the same model.
 */
export async function exportJson(db: SQLiteDatabase): Promise<void> {
  const q = (sql: string) => db.getAllAsync(sql);
  const data = {
    app: 'lifelog',
    version: 1,
    exportedAt: new Date().toISOString(),
    notes: await q('SELECT id, body, created_at, updated_at, mood, mood_label FROM notes ORDER BY created_at'),
    photos: await q('SELECT note_id, file, caption, created_at FROM photos'),
    facts: await q('SELECT note_id, kind, subject, text, created_at FROM facts'),
    goals: await q('SELECT id, title, created_at, done FROM goals'),
    noteGoals: await q('SELECT note_id, goal_id FROM note_goals'),
    ideas: await q('SELECT note_id, text, done, created_at FROM ideas'),
    recaps: await q('SELECT week_start, body, created_at FROM recaps'),
    messages: await q('SELECT role, content, created_at FROM messages ORDER BY created_at'),
  };
  const file = new File(Paths.cache, `lifelog-export-${new Date().toISOString().slice(0, 10)}.json`);
  if (file.exists) file.delete();
  file.create();
  await file.write(JSON.stringify(data, null, 2));
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Export your journal' });
}


export type WeekStats = { entries: number; words: number; streak: number; mood: number | null; days: (number | null)[] };

/** The last 7 days at a glance: entries, words, writing streak, mood per day (oldest first). */
export async function weekStats(db: SQLiteDatabase): Promise<WeekStats> {
  const DAY = 86_400_000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const from = today.getTime() - 6 * DAY;
  const rows = await db.getAllAsync<{ created_at: number; body: string; mood: number | null }>(
    'SELECT created_at, body, mood FROM notes WHERE created_at >= ?',
    from,
  );
  const days = Array.from({ length: 7 }, (_, i) => {
    const own = rows.filter((r) => r.created_at >= from + i * DAY && r.created_at < from + (i + 1) * DAY && r.mood !== null);
    return own.length ? own.reduce((a, r) => a + (r.mood ?? 0), 0) / own.length : null;
  });
  const moods = days.filter((d): d is number => d !== null);
  // streak: consecutive days with an entry, counting back from today (or yesterday, if today is still empty)
  const stamps = await db.getAllAsync<{ day: number }>(
    "SELECT DISTINCT CAST(strftime('%s', datetime(created_at / 1000, 'unixepoch', 'localtime'), 'start of day') AS INTEGER) AS day FROM notes ORDER BY day DESC LIMIT 400",
  );
  const have = new Set(stamps.map((s) => s.day));
  const key = (ms: number) => {
    const d = new Date(ms);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 1000;
  };
  let streak = 0;
  let day = have.has(key(today.getTime())) ? today.getTime() : today.getTime() - DAY;
  while (have.has(key(day))) {
    streak++;
    day -= DAY;
  }
  return {
    entries: rows.length,
    words: rows.reduce((n, r) => n + (r.body.trim() ? r.body.trim().split(/\s+/).length : 0), 0),
    streak,
    mood: moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null,
    days,
  };
}
