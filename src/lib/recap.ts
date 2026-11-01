import type { SQLiteDatabase } from 'expo-sqlite';
import { getBackgroundConfig, getChatConfig, PROVIDERS } from './chat';
import { aboutUser, renderNotes } from './context';
import { MONTHS, type Note } from './notes';

const DAY = 86_400_000;

export type Recap = { id: number; week_start: number; body: string; created_at: number };

/** Monday 00:00 (local) of the week that contains `ms`. */
export function weekStart(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const sinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - sinceMonday);
  return d.getTime();
}

export function latestRecap(db: SQLiteDatabase): Promise<Recap | null> {
  return db.getFirstAsync<Recap>('SELECT * FROM recaps ORDER BY week_start DESC LIMIT 1');
}

export function getRecap(db: SQLiteDatabase, id: number): Promise<Recap | null> {
  return db.getFirstAsync<Recap>('SELECT * FROM recaps WHERE id = ?', id);
}

/** Which week deserves a letter right now: this week from Sunday on, otherwise last week. */
function targetWeek(now = Date.now()): number {
  const isSunday = new Date(now).getDay() === 0;
  return isSunday ? weekStart(now) : weekStart(now) - 7 * DAY;
}

/** Writes the friend's letter about one week. Uses the chat model: this one should sound like the friend. */
export async function writeRecap(db: SQLiteDatabase, week: number): Promise<Recap | null> {
  const notes = await db.getAllAsync<Note>(
    'SELECT * FROM notes WHERE created_at >= ? AND created_at < ? ORDER BY created_at',
    week,
    week + 7 * DAY,
  );
  if (!notes.length) return null;
  const chat = await getChatConfig(db);
  if (!chat.apiKey) return null;

  const body = await PROVIDERS[chat.provider].complete({
    apiKey: chat.apiKey,
    model: chat.model,
    maxTokens: 900,
    system:
      "You are the user's close friend who has read their journal. Every Sunday you write them a short letter " +
      'about their week: what happened, how their mood moved, what they kept coming back to, one thing to be proud of, ' +
      'and one gentle nudge for next week. Warm, honest, a little funny, like a friend, never like a therapist. ' +
      'Around 180 words, plain paragraphs, no headings or lists. Write in the language the entries are written in. ' +
      'Start with "Hey" and their name if you know it.\n\n' +
      (await aboutUser(db)),
    prompt: `This week's entries:\n\n${renderNotes(notes)}`,
  });

  await db.runAsync(
    'INSERT INTO recaps(week_start, body, created_at) VALUES (?, ?, ?) ON CONFLICT(week_start) DO UPDATE SET body = excluded.body, created_at = excluded.created_at',
    week,
    body.trim(),
    Date.now(),
  );
  return db.getFirstAsync<Recap>('SELECT * FROM recaps WHERE week_start = ?', week);
}

let running = false;

/** Called on app open: writes the weekly letter if it's due and not written yet. */
export async function ensureRecap(db: SQLiteDatabase): Promise<void> {
  if (running || !(await getBackgroundConfig(db))) return;
  running = true;
  try {
    const week = targetWeek();
    const exists = await db.getFirstAsync('SELECT id FROM recaps WHERE week_start = ?', week);
    if (!exists) await writeRecap(db, week);
  } catch (e) {
    console.warn('recap failed', e);
  } finally {
    running = false;
  }
}

export function weekLabel(week: number): string {
  const end = new Date(week + 6 * DAY);
  const start = new Date(week);
  const m = (d: Date) => MONTHS[d.getMonth()];
  return start.getMonth() === end.getMonth()
    ? `${start.getDate()}–${end.getDate()} ${m(end)}`
    : `${start.getDate()} ${m(start)} – ${end.getDate()} ${m(end)}`;
}
