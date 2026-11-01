import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getBackgroundConfig, parseJsonReply } from './chat';
import { aboutUser, renderNotes } from './context';
import { getSetting, setSetting } from './db';
import { formatDate, recentNotes } from './notes';
import { weekStart } from './recap';

/*
 * Check-ins: the friend messages you at your break time.
 * There is no server, so messages are written ahead of time (when the app opens)
 * and scheduled as local notifications for the next two days.
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
const HORIZON = 2 * DAY;
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
    enabled: false,
    anchorWeek: weekStart(Date.now()),
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

/** Break-time moments in the next two days. Sundays are off. */
function upcomingSlots(s: CheckinSettings, now = Date.now()): { at: number; shift: Shift }[] {
  const slots: { at: number; shift: Shift }[] = [];
  for (let i = 0; i <= 2; i++) {
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

    const [about, recent] = await Promise.all([aboutUser(db), recentNotes(db, 7, 10)]);
    const reply = await ai.adapter.complete({
      apiKey: ai.apiKey,
      model: ai.model,
      json: true,
      maxTokens: 800,
      system:
        "You are the user's close friend who has read their journal. You will ping them during short work breaks " +
        '(their phone is locked away while working). Write one short message per slot: one or two sentences, ' +
        'casual, specific to what they wrote recently, sometimes a question, sometimes just encouragement or a joke. ' +
        'Never generic. Same language as their journal. Return {"messages":["…", …]} with exactly one per slot, in order.\n\n' +
        about,
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
  const due = await db.getAllAsync<{ id: number; fire_at: number; body: string }>(
    'SELECT id, fire_at, body FROM checkins WHERE delivered = 0 AND fire_at <= ? ORDER BY fire_at',
    Date.now(),
  );
  for (const c of due) {
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        'INSERT INTO messages(role, content, created_at) VALUES (?, ?, ?)',
        'assistant',
        c.body,
        c.fire_at,
      );
      await db.runAsync('UPDATE checkins SET delivered = 1 WHERE id = ?', c.id);
    });
  }
  return due.length;
}

/** Cancels everything not yet delivered (used when settings change or check-ins are turned off). */
export async function cancelFuture(db: SQLiteDatabase): Promise<void> {
  const rows = await db.getAllAsync<{ id: number; notification_id: string | null }>(
    'SELECT id, notification_id FROM checkins WHERE delivered = 0',
  );
  for (const r of rows) {
    if (r.notification_id) await Notifications.cancelScheduledNotificationAsync(r.notification_id).catch(() => {});
  }
  await db.runAsync('DELETE FROM checkins WHERE delivered = 0');
}
