import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { DB_NAME } from './db';

/*
 * Every notification the app sends goes through here, so it also lands in the 🔔 inbox:
 * check-ins, the daily message, Reads, day-off reminders, radio problems, budget warnings.
 * Scheduled ones appear in the inbox once their time has come; cancelled ones disappear from both.
 */

export type NotifyData = { kind: string; [k: string]: unknown };
export type InboxItem = { id: number; kind: string; title: string; body: string; data: string | null; at: number; read: number };

let conn: Promise<SQLiteDatabase> | null = null;
const database = () => (conn ??= openDatabaseAsync(DB_NAME));

/** Shows a notification now (at omitted) or at a time, and files it in the inbox. Returns the notification id. */
export async function notify(n: {
  title: string;
  body: string;
  data: NotifyData;
  at?: number;
  channelId?: string;
  quiet?: boolean; // only the 🔔 inbox, no buzz on the phone (small things like a milestone suggestion)
}): Promise<string> {
  const later = n.at !== undefined && n.at > Date.now() + 5000;
  const id = n.quiet ? `quiet-${Date.now()}` : await Notifications.scheduleNotificationAsync({
    content: { title: n.title, body: n.body, data: n.data },
    trigger: later
      ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(n.at!), ...(n.channelId ? { channelId: n.channelId } : {}) }
      : null,
  });
  try {
    const db = await database();
    await db.runAsync(
      'INSERT INTO inbox(notification_id, kind, title, body, data, at) VALUES (?, ?, ?, ?, ?, ?)',
      id,
      n.data.kind,
      n.title,
      n.body,
      JSON.stringify(n.data),
      later ? n.at! : Date.now(),
    );
  } catch {} // the inbox is a convenience: never let it stop a notification
  return id;
}

/** Cancels a scheduled notification, and takes it out of the inbox too. */
export async function cancelNotify(notificationId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(notificationId).catch(() => {});
  try {
    // only if it hasn't shown yet: one you already got stays in the inbox
    await (await database()).runAsync('DELETE FROM inbox WHERE notification_id = ? AND at > ?', notificationId, Date.now());
  } catch {}
}

/** What has arrived so far (scheduled ones only once their time has come), newest first. */
export const inboxItems = (db: SQLiteDatabase, limit = 100) =>
  db.getAllAsync<InboxItem>('SELECT * FROM inbox WHERE at <= ? ORDER BY at DESC LIMIT ?', Date.now(), limit);

export async function unreadCount(db: SQLiteDatabase): Promise<number> {
  return (await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM inbox WHERE read = 0 AND at <= ?', Date.now()))?.n ?? 0;
}

export const markAllRead = (db: SQLiteDatabase) => db.runAsync('UPDATE inbox SET read = 1 WHERE at <= ?', Date.now());
export const markRead = (db: SQLiteDatabase, id: number) => db.runAsync('UPDATE inbox SET read = 1 WHERE id = ?', id);
export const clearInbox = (db: SQLiteDatabase) => db.runAsync('DELETE FROM inbox WHERE at <= ?', Date.now());

/** Where a notification leads, from the system tray or from the inbox (one place for both). */
export function openNotification(data: Record<string, unknown> | undefined | null): void {
  if (!data) return;
  if (data.kind === 'checkin') router.navigate('/chat');
  else if (data.kind === 'planner' && typeof data.day === 'string') router.push(`/plan/${data.day}`);
  else if (data.kind === 'read' && data.id !== undefined) router.push(`/read/${data.id}`);
  else if (data.kind === 'radio') router.navigate('/radio');
  else if (data.kind === 'usage') router.push('/settings/ai');
  else if (data.kind === 'milestone') router.navigate('/insights');
}

/** Icon and label per kind, for the inbox list. */
export const KIND_LOOK: Record<string, { emoji: string; label: string }> = {
  checkin: { emoji: '👋', label: 'Your friend' },
  read: { emoji: '📰', label: 'A Read' },
  planner: { emoji: '🌤️', label: 'Day off' },
  radio: { emoji: '📻', label: 'Radio' },
  usage: { emoji: '💰', label: 'AI budget' },
  milestone: { emoji: '📌', label: 'Milestone' },
};
