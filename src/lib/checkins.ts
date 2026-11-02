import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getBackgroundConfig, parseJsonReply } from './chat';
import { addMessage, chatForIncoming } from './chats';
import { aboutUser, renderNotes } from './context';
import { getSetting, setSetting } from './db';
import { formatDate, recentNotes } from './notes';
import { weekStart } from './recap';

/*
 * Check-ins: the friend messages you at your break time.
 * There is no server, so messages are written ahead of time (whenever the app runs)
 * and scheduled as local notifications for the next week, so they still arrive if Android
 * keeps the app asleep for days. Ones further than a day out get rewritten as you write.
 */

export type Shift = 'morning' | 'evening' | 'night';
export const SHIFTS: { key: Shift; label: string; defaultTime: string }[] = [
  { key: 'morning', label: 'Morning', defaultTime: '12:00' },
  { key: 'evening', label: 'Evening', defaultTime: '19:30' },
  { key: 'night', label: 'Night', defaultTime: '03:30' },
];
// The weekly rotation order at Arvato: Morning → Night → Evening → Morning…
export const ROTATION: Shift[] = ['morning', 'night', 'evening'];

const DAY = 86_400_000;
const HORIZON = 7 * DAY;
const CHANNEL = 'checkins';

export type CheckinSettings = {
  enabled: boolean;
  anchorWeek: number; // Monday of the week when `anchorShift` was worked
  anchorShift: Shift;
  times: Record<Shift, string>; // "HH:MM"
};

export async function getCheckinSettings(db: SQLiteDatabase): Promise<CheckinSettings> {
  const raw = await getSetting(db, 'checkins');
  const defaults: CheckinSettings = {
    enabled: true,
    // Arda's rotation: the week of 26 Oct 2026 was a Morning week
    anchorWeek: weekStart(new Date(2026, 9, 26).getTime()),
    anchorShift: 'morning',
    times: { morning: '12:00', evening: '19:30', night: '03:30' },
  };
  if (!raw) return defaults;
  try {
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

export async function saveCheckinSettings(db: SQLiteDatabase, s: CheckinSettings): Promise<void> {
  for (const t of Object.values(s.times)) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new Error(`"${t}" isn't a time. Use HH:MM, like 12:00.`);
  }
  await setSetting(db, 'checkins', JSON.stringify(s));
  await cancelFuture(db);
  if (s.enabled) await planCheckins(db);
}

/** Which shift you work in the week containing `ms`. */
export function shiftFor(s: CheckinSettings, ms: number): Shift {
  const weeks = Math.round((weekStart(ms) - s.anchorWeek) / (7 * DAY));
  const start = ROTATION.indexOf(s.anchorShift);
  return ROTATION[(((start + weeks) % 3) + 3) % 3];
}

/** Break-time moments in the next week. Sundays are off. */
function upcomingSlots(s: CheckinSettings, now = Date.now()): { at: number; shift: Shift }[] {
  const slots: { at: number; shift: Shift }[] = [];
  for (let i = 0; i <= 7; i++) {
    const day = new Date(now + i * DAY);
    if (day.getDay() === 0) continue;
    const shift = shiftFor(s, day.getTime());
    const [h, m] = s.times[shift].split(':').map(Number);
    day.setHours(h, m, 0, 0);
    const at = day.getTime();
    if (at > now + 5 * 60_000 && at < now + HORIZON) slots.push({ at, shift });
  }
  return slots;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Check-ins from your friend',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  return (await Notifications.requestPermissionsAsync()).granted;
}

let running = false;

/** Writes and schedules the next check-ins. Safe to call on every app open. */
export async function planCheckins(db: SQLiteDatabase): Promise<number> {
  if (running) return 0;
  const s = await getCheckinSettings(db);
  if (!s.enabled) return 0;
  const ai = await getBackgroundConfig(db);
  if (!ai) return 0;
  running = true;
  try {
    const existing = new Set(
      (await db.getAllAsync<{ fire_at: number }>('SELECT fire_at FROM checkins')).map((r) => r.fire_at),
    );
    const slots = upcomingSlots(s).filter((slot) => !existing.has(slot.at));
    if (!slots.length) return 0;
    if (!(await ensureNotificationPermission())) return 0;

    const [about, recent, quiet] = await Promise.all([
      aboutUser(db),
      recentNotes(db, 7, 10),
      // open goals nobody has written about for 10+ days: worth a gentle nudge
      db.getAllAsync<{ title: string }>(
        `SELECT g.title FROM goals g LEFT JOIN note_goals ng ON ng.goal_id = g.id LEFT JOIN notes n ON n.id = ng.note_id
         WHERE g.done = 0 GROUP BY g.id HAVING coalesce(max(n.created_at), g.created_at) < ?`,
        Date.now() - 10 * DAY,
      ),
    ]);
    const reply = await ai.adapter.complete({
      apiKey: ai.apiKey,
      model: ai.model,
      json: true,
      maxTokens: 1500,
      system:
        "You are the user's close friend who has read their journal. You will ping them during short work breaks " +
        '(their phone is locked away while working). Write one short message per slot: one or two sentences, ' +
        'casual, specific to what they wrote recently, sometimes a question, sometimes just encouragement or a joke. ' +
        'Never generic, and never the same message twice. Same language as their journal. Return {"messages":["…", …]} with exactly one per slot, in order.\n\n' +
        about +
        (quiet.length
          ? `\n\nGoals they haven't mentioned in a while (nudge about one of these at most once): ${quiet.map((g) => g.title).join('; ')}`
          : ''),
      prompt:
        `Recent entries:\n${renderNotes(recent) || '(none yet)'}\n\nSlots:\n` +
        slots.map((sl, i) => `${i + 1}. ${formatDate(sl.at)}, break during the ${sl.shift} shift`).join('\n'),
    });
    const { messages } = parseJsonReply<{ messages?: string[] }>(reply);

    let scheduled = 0;
    for (const [i, slot] of slots.entries()) {
      const body = messages?.[i]?.trim();
      if (!body) continue;
      const id = await Notifications.scheduleNotificationAsync({
        content: { title: 'Lifelog', body, data: { kind: 'checkin' } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(slot.at), channelId: CHANNEL },
      });
      await db.runAsync(
        'INSERT OR IGNORE INTO checkins(fire_at, body, notification_id) VALUES (?, ?, ?)',
        slot.at,
        body,
        id,
      );
      scheduled++;
    }
    return scheduled;
  } catch (e) {
    console.warn('check-in planning failed', e);
    return 0;
  } finally {
    running = false;
  }
}

/** Check-ins whose time has passed show up in the chat as messages from your friend. */
export async function deliverDue(db: SQLiteDatabase): Promise<number> {
  const due = await db.getAllAsync<{ id: number; fire_at: number; body: string; kind: string }>(
    'SELECT id, fire_at, body, kind FROM checkins WHERE delivered = 0 AND fire_at <= ? ORDER BY fire_at',
    Date.now(),
  );
  for (const c of due) {
    await db.withTransactionAsync(async () => {
      // joins the conversation if you were just talking, otherwise opens a new one you can reply to
      const chatId = await chatForIncoming(db, c.fire_at, c.kind === 'checkin' ? 'Check-in' : 'From your friend');
      await addMessage(db, chatId, 'assistant', c.body, c.fire_at);
      await db.runAsync('UPDATE checkins SET delivered = 1 WHERE id = ?', c.id);
    });
  }
  return due.length;
}

/**
 * Cancels scheduled messages of one kind that haven't been delivered yet,
 * optionally only those due in [from, to).
 */
export async function cancelPending(db: SQLiteDatabase, kind: string, from = 0, to = Number.MAX_SAFE_INTEGER): Promise<void> {
  const rows = await db.getAllAsync<{ id: number; notification_id: string | null }>(
    'SELECT id, notification_id FROM checkins WHERE delivered = 0 AND kind = ? AND fire_at >= ? AND fire_at < ?',
    kind,
    from,
    to,
  );
  for (const r of rows) {
    if (r.notification_id) await Notifications.cancelScheduledNotificationAsync(r.notification_id).catch(() => {});
    await db.runAsync('DELETE FROM checkins WHERE id = ?', r.id);
  }
}

/** Cancels every check-in not yet delivered (used when settings change or check-ins are turned off). */
export const cancelFuture = (db: SQLiteDatabase) => cancelPending(db, 'checkin');
