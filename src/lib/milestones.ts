import type { SQLiteDatabase } from 'expo-sqlite';
import { getBackgroundConfig, parseJsonReply } from './chat';
import { getSetting, setSetting } from './db';
import { notify } from './notify';

/*
 * Milestones: the big moments of your life with a date (first day at a new job, moving house,
 * graduating), as opposed to facts, which say how things are. The AI suggests them from your
 * entries; nothing is kept until you say Save. They give the friend and the radio your story,
 * and anniversaries ("one month at Arvato today").
 */

export type Precision = 'day' | 'month' | 'year';

export type Milestone = {
  id: number;
  date: number;
  precision: Precision;
  title: string;
  story: string | null;
  emoji: string | null;
  big: number;
  status: 'pending' | 'saved';
  note_id: number | null;
  created_at: number;
};

export const listMilestones = (db: SQLiteDatabase, status: Milestone['status'] = 'saved') =>
  db.getAllAsync<Milestone>('SELECT * FROM milestones WHERE status = ? ORDER BY date DESC', status);

export const getMilestone = (db: SQLiteDatabase, id: number) => db.getFirstAsync<Milestone>('SELECT * FROM milestones WHERE id = ?', id);

export async function saveMilestone(
  db: SQLiteDatabase,
  m: Pick<Milestone, 'date' | 'precision' | 'title' | 'story' | 'emoji' | 'big'> & { id?: number },
): Promise<void> {
  if (m.id) {
    await db.runAsync(
      "UPDATE milestones SET date = ?, precision = ?, title = ?, story = ?, emoji = ?, big = ?, status = 'saved' WHERE id = ?",
      m.date, m.precision, m.title.trim(), m.story?.trim() || null, m.emoji?.trim() || null, m.big ? 1 : 0, m.id,
    );
  } else {
    await db.runAsync(
      "INSERT INTO milestones(date, precision, title, story, emoji, big, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'saved', ?)",
      m.date, m.precision, m.title.trim(), m.story?.trim() || null, m.emoji?.trim() || null, m.big ? 1 : 0, Date.now(),
    );
  }
}

export const approveMilestone = (db: SQLiteDatabase, id: number) =>
  db.runAsync("UPDATE milestones SET status = 'saved' WHERE id = ?", id);

export const deleteMilestone = (db: SQLiteDatabase, id: number) => db.runAsync('DELETE FROM milestones WHERE id = ?', id);

// ── dates ──

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "1 Oct 2026", "Oct 2026" or "2026", as exactly as it's known. */
export function milestoneDate(m: Pick<Milestone, 'date' | 'precision'>): string {
  const d = new Date(m.date);
  if (m.precision === 'year') return String(d.getFullYear());
  if (m.precision === 'month') return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Typing a date: "1.10.2026", "10.2026" or "2026" (also "2026-10-01"). Null if it isn't one. */
export function parseMilestoneDate(text: string): { date: number; precision: Precision } | null {
  const t = text.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return valid(+m[1], +m[2], +m[3], 'day');
  m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) return valid(+m[3], +m[2], +m[1], 'day');
  m = t.match(/^(\d{1,2})[./](\d{4})$/);
  if (m) return valid(+m[2], +m[1], 1, 'month');
  m = t.match(/^(\d{4})$/);
  if (m) return valid(+m[1], 1, 1, 'year');
  return null;
}

function valid(y: number, mo: number, d: number, precision: Precision) {
  const date = new Date(y, mo - 1, d, 12);
  if (date.getMonth() !== mo - 1 || date.getDate() !== d || y < 1900 || date.getTime() > Date.now() + 366 * 86_400_000) return null;
  return { date: date.getTime(), precision };
}

/** The date as you'd type it back: "1.10.2026", "10.2026" or "2026". */
export function milestoneDateInput(m: Pick<Milestone, 'date' | 'precision'>): string {
  const d = new Date(m.date);
  if (m.precision === 'year') return String(d.getFullYear());
  if (m.precision === 'month') return `${d.getMonth() + 1}.${d.getFullYear()}`;
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

/** Today's anniversaries: whole years (any milestone with a known day) and whole months in the first year. */
export function anniversaries(list: Milestone[], now = new Date()): string[] {
  const out: string[] = [];
  for (const m of list) {
    if (m.precision !== 'day') continue;
    const d = new Date(m.date);
    if (d.getDate() !== now.getDate()) continue;
    const months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    if (months <= 0) continue;
    if (months % 12 === 0) out.push(`${months / 12} year${months > 12 ? 's' : ''} since "${m.title}" (${milestoneDate(m)})`);
    else if (months < 12) out.push(`${months} month${months > 1 ? 's' : ''} since "${m.title}" (${milestoneDate(m)})`);
  }
  return out;
}

/** For the AI's context: their life story in short, plus anything worth celebrating today. */
export async function milestonesForContext(db: SQLiteDatabase): Promise<string> {
  const list = (await listMilestones(db)).slice(0, 40);
  if (!list.length) return '';
  const lines = list.map((m) => `- ${milestoneDate(m)}: ${m.emoji ? `${m.emoji} ` : ''}${m.title}${m.story ? ` (${m.story})` : ''}`);
  const today = anniversaries(list);
  return (
    `## Milestones in their life (newest first)\n${lines.join('\n')}` +
    (today.length ? `\n\n## Anniversaries TODAY (mention them warmly if it fits)\n${today.map((t) => `- ${t}`).join('\n')}` : '')
  );
}

// ── finding them ──

/** Asked of every new entry together with the facts (see facts.ts). */
export const MILESTONE_RULE =
  `"milestone": null, or ONE real life event this entry reports: starting or leaving a job, moving house, ` +
  'graduating, a relationship starting or ending, a birth, a death of someone close, a big purchase (a car, a ' +
  'scooter, a home), a big trip, a health event, a real achievement. Not ordinary days, plans or wishes. ' +
  '{"title": "short, in the entry\'s language", "story": "one sentence", "emoji": "one emoji", "big": true for a ' +
  'life chapter (job, home, relationship, school) else false, "date": "YYYY-MM-DD" when the entry says when it ' +
  'happened, else null}.';

export type FoundMilestone = { title?: string; story?: string; emoji?: string; big?: boolean; date?: string | null };

/** Saves an AI-found milestone as a suggestion (pending), unless it's already there. */
export async function suggestMilestone(
  db: SQLiteDatabase,
  f: FoundMilestone,
  noteId: number | null,
  fallbackDate: number,
  announce = true, // the journal scan shows its finds on the timeline instead of filling the inbox
): Promise<void> {
  const title = f.title?.trim();
  if (!title) return;
  const parsed = f.date ? parseMilestoneDate(f.date) : null;
  const date = parsed?.date ?? fallbackDate;
  // the same title within two weeks of an existing one is a duplicate (also a suggestion you already said No to)
  const dup = await db.getFirstAsync(
    'SELECT id FROM milestones WHERE lower(title) = lower(?) AND abs(date - ?) < ?',
    title,
    date,
    14 * 86_400_000,
  );
  const dismissed = JSON.parse(await getSetting(db, 'milestones.dismissed', '[]')) as string[];
  if (dup || dismissed.includes(title.toLowerCase())) return;
  if (noteId !== null && (await db.getFirstAsync("SELECT id FROM milestones WHERE note_id = ? AND status = 'pending'", noteId))) return;
  // the 🔔 inbox mentions it too (quietly: no buzz for a suggestion)
  if (announce) notify({ title: 'A milestone?', body: `${f.emoji?.trim() ? `${f.emoji.trim()} ` : ''}${title}`, data: { kind: 'milestone' }, quiet: true }).catch(() => {});
  await db.runAsync(
    "INSERT INTO milestones(date, precision, title, story, emoji, big, status, note_id, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)",
    date,
    parsed?.precision ?? 'day',
    title,
    f.story?.trim() || null,
    f.emoji?.trim().slice(0, 4) || null,
    f.big ? 1 : 0,
    noteId,
    Date.now(),
  );
}

/** "No": the suggestion goes, and the same title isn't suggested again. */
export async function dismissMilestone(db: SQLiteDatabase, m: Milestone): Promise<void> {
  const dismissed = JSON.parse(await getSetting(db, 'milestones.dismissed', '[]')) as string[];
  await setSetting(db, 'milestones.dismissed', JSON.stringify([m.title.toLowerCase(), ...dismissed].slice(0, 300)));
  await deleteMilestone(db, m.id);
}

/**
 * One pass over the whole journal (oldest first, 15 entries per AI call, cheap model) looking for the big
 * moments. Everything found becomes a suggestion. Resumes where it stopped (kv milestones.scannedUpTo).
 */
export async function scanJournal(db: SQLiteDatabase, onProgress: (done: number, total: number) => void): Promise<number> {
  const ai = await getBackgroundConfig(db);
  if (!ai) throw new Error('Add an AI key in Settings first.');
  const from = Number(await getSetting(db, 'milestones.scannedUpTo', '0')) || 0;
  const notes = await db.getAllAsync<{ id: number; body: string; created_at: number }>(
    "SELECT id, body, created_at FROM notes WHERE created_at > ? AND trim(body) != '' ORDER BY created_at",
    from,
  );
  let found = 0;
  for (let i = 0; i < notes.length; i += 15) {
    const batch = notes.slice(i, i + 15);
    onProgress(i, notes.length);
    const reply = await ai.adapter.complete({
      feature: 'background',
      apiKey: ai.apiKey,
      model: ai.model,
      json: true,
      system:
        'You read entries from one person\'s journal and list the real life events in them (milestones). ' +
        MILESTONE_RULE.replace('"milestone": null, or ONE', 'Each milestone is a') +
        ' Return {"milestones":[{...,"entry": the entry number it came from}]} or {"milestones":[]}. Most batches have none or one.',
      prompt: batch
        .map((n, k) => `#${k + 1} (written ${new Date(n.created_at).toISOString().slice(0, 10)}):\n${n.body.slice(0, 900)}`)
        .join('\n\n'),
    });
    const list = parseJsonReply<{ milestones?: (FoundMilestone & { entry?: number })[] }>(reply).milestones ?? [];
    for (const m of list) {
      const note = batch[(Number(m.entry) || 1) - 1] ?? batch[0];
      const before = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM milestones');
      await suggestMilestone(db, m, note.id, note.created_at, false);
      const after = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM milestones');
      if ((after?.n ?? 0) > (before?.n ?? 0)) found++;
    }
    await setSetting(db, 'milestones.scannedUpTo', String(batch[batch.length - 1].created_at));
  }
  onProgress(notes.length, notes.length);
  return found;
}

/** True once the whole journal has been scanned at least once. */
export const journalScanned = async (db: SQLiteDatabase) => (await getSetting(db, 'milestones.scannedUpTo', '')) !== '';
