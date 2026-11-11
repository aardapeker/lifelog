import type { SQLiteDatabase } from 'expo-sqlite';
import { getSetting, setSetting } from './db';
import { notify } from './notify';
import { likedSongs } from './songMemory';

/*
 * Weird achievements: silly badges earned from what's already in the app (when you write, what you
 * write about, how much radio you play). Counted on the phone with plain SQL, no AI, no cost.
 * Unlocked ones are kept with their date, and each unlock lands in the 🔔 inbox.
 */

export type Achievement = { id: string; emoji: string; name: string; how: string; goal: number };

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'owl', emoji: '🦉', name: 'Night Owl', how: 'Write 5 entries between midnight and 5 a.m.', goal: 5 },
  { id: 'early', emoji: '🌅', name: 'Early Bird', how: 'Write 5 entries between 5 and 7 a.m.', goal: 5 },
  { id: 'cat', emoji: '🐈', name: 'Cat Biographer', how: 'Mention Şemistan in 10 entries', goal: 10 },
  { id: 'servis', emoji: '🚌', name: 'Servis Survivor', how: 'Mention the servis in 10 entries', goal: 10 },
  { id: 'cay', emoji: '☕', name: 'Çay Addict', how: 'Mention çay in 10 entries', goal: 10 },
  { id: 'bruh', emoji: '😮‍💨', name: 'Bruh Master', how: 'Say "bruh" in 20 entries', goal: 20 },
  { id: 'streak', emoji: '📅', name: 'No Days Off', how: 'Write 7 days in a row', goal: 7 },
  { id: 'novel', emoji: '📖', name: 'Novelist', how: 'Write one entry over 800 words', goal: 1 },
  { id: 'hundred', emoji: '✍️', name: 'Graphomaniac', how: 'Write 100 entries', goal: 100 },
  { id: 'radio', emoji: '📻', name: 'Radio Addict', how: 'Make 20 radio shows', goal: 20 },
  { id: 'damar', emoji: '🥀', name: 'Full Damar', how: 'Make 5 shows on Tuzla Arabesk', goal: 5 },
  { id: 'hearts', emoji: '💘', name: 'Easy to Please', how: 'Heart 25 songs', goal: 25 },
  { id: 'roast', emoji: '🔥', name: 'Glutton for Punishment', how: 'Ask the Friend to roast you 3 times', goal: 3 },
];

const KEY = 'achievements'; // { [id]: unlockedAt }
const COUNTS = 'radio.stationCounts'; // { [station key]: shows made }

/** The radio counts a show here when it's made (for Radio Addict / Full Damar). */
export async function countShow(db: SQLiteDatabase, station: string): Promise<void> {
  const c = JSON.parse(await getSetting(db, COUNTS, '{}')) as Record<string, number>;
  c[station] = (c[station] ?? 0) + 1;
  await setSetting(db, COUNTS, JSON.stringify(c));
}

const one = async (db: SQLiteDatabase, sql: string, ...args: (string | number)[]) =>
  ((await db.getFirstAsync<{ n: number }>(sql, ...args))?.n ?? 0) as number;

/** Hour of the day in the phone's time, in SQL (created_at is ms). */
const HOUR = "CAST(strftime('%H', created_at / 1000, 'unixepoch', 'localtime') AS INTEGER)";

/** Words in a note, counted roughly in SQL (spaces + 1). */
const WORDS = "length(trim(body)) - length(replace(trim(body), ' ', '')) + 1";

/** Longest run of consecutive days with an entry. */
async function longestStreak(db: SQLiteDatabase): Promise<number> {
  const days = await db.getAllAsync<{ d: string }>(
    "SELECT DISTINCT date(created_at / 1000, 'unixepoch', 'localtime') AS d FROM notes ORDER BY d",
  );
  let best = 0;
  let run = 0;
  let prev = 0;
  for (const { d } of days) {
    const t = Date.parse(`${d}T00:00:00Z`);
    run = prev && t - prev === 86_400_000 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}

/** How far along every achievement is, right now. */
export async function progress(db: SQLiteDatabase): Promise<Record<string, number>> {
  const mentions = (word: string) => one(db, 'SELECT count(*) AS n FROM notes_fts WHERE notes_fts MATCH ?', word);
  const counts = JSON.parse(await getSetting(db, COUNTS, '{}')) as Record<string, number>;
  const [owl, early, cat, servis, cay, bruh, streak, novel, hundred, hearts, roast] = await Promise.all([
    one(db, `SELECT count(*) AS n FROM notes WHERE ${HOUR} < 5`),
    one(db, `SELECT count(*) AS n FROM notes WHERE ${HOUR} >= 5 AND ${HOUR} < 7`),
    mentions('semistan*'),
    mentions('servis*'),
    mentions('cay*'),
    mentions('bruh*'),
    longestStreak(db),
    one(db, `SELECT count(*) AS n FROM notes WHERE ${WORDS} > 800`),
    one(db, 'SELECT count(*) AS n FROM notes'),
    likedSongs(db).then((l) => l.length),
    one(db, "SELECT count(*) AS n FROM messages WHERE role = 'user' AND content = '🔥 Roast my week'"),
  ]);
  const shows = Object.values(counts).reduce((a, b) => a + b, 0);
  return { owl, early, cat, servis, cay, bruh, streak, novel, hundred, radio: shows, damar: counts.arabesk ?? 0, hearts, roast };
}

export async function unlocked(db: SQLiteDatabase): Promise<Record<string, number>> {
  try {
    return JSON.parse(await getSetting(db, KEY, '{}')) as Record<string, number>;
  } catch {
    return {};
  }
}

/** Checks every achievement; new ones are saved and announced. Cheap (a dozen counts). */
export async function checkAchievements(db: SQLiteDatabase): Promise<Achievement[]> {
  const [p, have, firstRun] = await Promise.all([progress(db), unlocked(db), getSetting(db, KEY, '').then((v) => !v)]);
  const fresh = ACHIEVEMENTS.filter((a) => !have[a.id] && (p[a.id] ?? 0) >= a.goal);
  if (!fresh.length) return [];
  const now = Date.now();
  for (const a of fresh) have[a.id] = now;
  await setSetting(db, KEY, JSON.stringify(have));
  for (const a of fresh) {
    await notify({
      title: `${a.emoji} Achievement unlocked: ${a.name}`,
      body: a.how.replace(/^./, (c) => c.toUpperCase()) + '. Very proud. Slightly concerned.',
      data: { kind: 'achievement', id: a.id },
      quiet: firstRun, // the first check unlocks the old ones at once: inbox only, no buzz storm
    }).catch(() => {});
  }
  return fresh;
}
