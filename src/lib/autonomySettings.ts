import type { SQLiteDatabase } from 'expo-sqlite';
import { getSetting, setSetting } from './db';

// Kept apart from autonomy.ts so the entry analysis can read it without import cycles.

export type AutonomySettings = {
  enabled: boolean; // the friend may research, search for activities and message you on its own
  digestTime: string; // "HH:MM": when the daily message arrives
  researchPerDay: number; // web searches about your entries, per day
  activities: boolean; // look for things to do nearby once a day
  never: string[]; // topics never to look up
};

const DEFAULTS: AutonomySettings = {
  enabled: true,
  digestTime: '19:00',
  researchPerDay: 3,
  activities: true,
  never: [],
};

export async function getAutonomySettings(db: SQLiteDatabase): Promise<AutonomySettings> {
  try {
    return { ...DEFAULTS, ...JSON.parse(await getSetting(db, 'autonomy', '{}')) };
  } catch {
    return DEFAULTS;
  }
}

export async function saveAutonomySettings(db: SQLiteDatabase, s: AutonomySettings): Promise<void> {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.digestTime)) throw new Error(`"${s.digestTime}" isn't a time. Use HH:MM, like 19:00.`);
  await setSetting(db, 'autonomy', JSON.stringify(s));
}

/** Splits "health, ex, money" (or one per line) into clean topics. */
export const parseNeverList = (text: string) =>
  text
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean);

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * True if the text touches a topic from the "never research" list. Case-insensitive and Turkish-aware.
 * Longer terms match word starts ("sağlık" also blocks "sağlıklı"); short ones (under 4 letters) only
 * whole words, so "ex" blocks "my ex" but not "next" or "example".
 */
export function isNeverResearch(text: string, never: string[]): boolean {
  const hay = text.toLocaleLowerCase('tr');
  return never.some((n) => {
    const term = n.trim().toLocaleLowerCase('tr');
    if (!term) return false;
    const end = term.length < 4 ? '(?=$|[^\\p{L}\\p{N}])' : '';
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(term)}${end}`, 'u').test(hay);
  });
}
