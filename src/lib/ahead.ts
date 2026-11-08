import * as Notifications from 'expo-notifications';
import { cancelNotify, notify } from './notify';
import type { SQLiteDatabase } from 'expo-sqlite';
import { digestTimeOn, getAutonomySettings } from './autonomySettings';
import { getBackgroundConfig, parseJsonReply } from './chat';
import { cancelPending, ensureNotificationPermission, getCheckinSettings, shiftFor } from './checkins';
import { aboutUser, renderNotes } from './context';
import { getSetting, setSetting } from './db';
import { formatDate, recentNotes } from './notes';
import { dayParam, midnight } from './planner';

/*
 * Ghost-proofing. HyperOS may keep the app asleep for days, but notifications scheduled
 * ahead of time still fire. So whenever the app runs, the friend writes one message for each
 * of the next 7 days (at the daily message time), assuming you stay quiet until then: the longer
 * the silence, the more it notices. Write an entry and they're rewritten (at most once an hour);
 * otherwise once a day. A real daily message (research, a Read) replaces that day's one.
 * The same refresh rewrites check-ins more than a day out, so they don't go stale either.
 */

const DAY = 86_400_000;
const DAYS_AHEAD = 7;
const REWRITE_AFTER = 20 * 3600_000; // nothing new: refresh once a day
const MIN_GAP = 3600_000; // you wrote something: refresh, but not more than hourly

let running = false;

/** True when the messages written ahead are missing or stale. */
async function stale(db: SQLiteDatabase, basis: string): Promise<boolean> {
  const writtenAt = Number(await getSetting(db, 'ahead.writtenAt', '0'));
  const age = Date.now() - writtenAt;
  if ((await getSetting(db, 'ahead.basis')) !== basis) return age > MIN_GAP;
  return age > REWRITE_AFTER;
}

export async function planAhead(db: SQLiteDatabase, force = false): Promise<number> {
  if (running) return 0;
  const ai = await getBackgroundConfig(db);
  if (!ai) return 0;
  const last = (await db.getFirstAsync<{ at: number | null }>('SELECT max(created_at) AS at FROM notes'))?.at ?? null;
  const basis = String(last ?? 0);
  if (!force && !(await stale(db, basis))) return 0;

  running = true;
  try {
    // check-ins more than a day away get rewritten with fresh context by planCheckins (the next job)
    await cancelPending(db, 'checkin', Date.now() + DAY);

    const s = await getAutonomySettings(db);
    let scheduled = 0;
    if (s.enabled && (await ensureNotificationPermission())) scheduled = await writeAhead(db, ai, s, last);
    await setSetting(db, 'ahead.writtenAt', String(Date.now()));
    await setSetting(db, 'ahead.basis', basis);
    return scheduled;
  } finally {
    running = false;
  }
}

async function writeAhead(
  db: SQLiteDatabase,
  ai: NonNullable<Awaited<ReturnType<typeof getBackgroundConfig>>>,
  s: Awaited<ReturnType<typeof getAutonomySettings>>,
  last: number | null,
): Promise<number> {
  const now = Date.now();
  const sentToday = (await getSetting(db, 'autonomy.lastDigest')) === dayParam(now);
  const shifts = await getCheckinSettings(db);
  const slots: { at: number; quietDays: number | null; shift: string }[] = [];
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const at = digestTimeOn(s, now + i * DAY) + 1000; // +1 s more: never the same moment as the real daily message
    if (at < now + 5 * 60_000 || (i === 0 && sentToday)) continue;
    slots.push({
      at,
      quietDays: last ? Math.floor((midnight(at) - midnight(last)) / DAY) : null,
      shift: new Date(at).getDay() === 0 ? 'day off (Sunday)' : `${shiftFor(shifts, at)} shift week`,
    });
  }
  if (!slots.length) return 0;

  const [about, recent] = await Promise.all([aboutUser(db), recentNotes(db, 7, 10)]);
  const reply = await ai.adapter.complete({
    feature: 'checkins',
    apiKey: ai.apiKey,
    model: ai.model,
    json: true,
    maxTokens: 1800,
    system:
      "You are the user's close friend who has read their journal. Write the one message you'll send them " +
      'on each of the coming days, assuming they write nothing new until then. One to three sentences, casual, a ' +
      'little funny, specific to their life, like a text from a friend. Every message different: a question, a callback ' +
      "to something they wrote, a joke, encouragement. If they'll have been quiet for 2+ days, notice it: first lightly " +
      '("you went quiet, all good?"), more directly the longer it lasts, but never guilt-trip. ' +
      'Same language as their journal. Return {"messages":["…", …]} with exactly one per day, in order.\n\n' +
      about,
    prompt:
      `Recent entries:\n${renderNotes(recent) || '(none yet)'}\n\n` +
      `Last entry: ${last ? formatDate(last) : 'never'}\n\nDays:\n` +
      slots
        .map(
          (sl, i) =>
            `${i + 1}. ${formatDate(sl.at)}, ${sl.shift}` +
            (sl.quietDays === null ? '' : `, ${sl.quietDays} day(s) since their last entry`),
        )
        .join('\n'),
  });
  const { messages } = parseJsonReply<{ messages?: string[] }>(reply);
  if (!messages?.length) return 0;

  await cancelPending(db, 'ahead');
  let scheduled = 0;
  for (const [i, slot] of slots.entries()) {
    const body = messages[i]?.trim();
    if (!body) continue;
    const id = await notify({ title: 'Lifelog', body, data: { kind: 'checkin' }, at: slot.at, channelId: 'checkins' });
    await db.runAsync(
      "INSERT OR IGNORE INTO checkins(fire_at, body, notification_id, kind) VALUES (?, ?, ?, 'ahead')",
      slot.at,
      body,
      id,
    );
    scheduled++;
  }
  return scheduled;
}
