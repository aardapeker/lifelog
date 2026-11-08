import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';
import * as TaskManager from 'expo-task-manager';
import { digestTimeOn, getAutonomySettings, isNeverResearch } from './autonomySettings';
import { getChatConfig, PROVIDERS } from './chat';
import { cancelPending, ensureNotificationPermission } from './checkins';
import { aboutUser } from './context';
import { getSetting, setSetting } from './db';
import { groundedSearch } from './gemini';
import { getKey } from './keys';
import { articleOf, type Read } from './reads';
import { dayParam, dayTitle, getPlace, linkEvents, midnight, parseEventLines, type FoundEvent } from './planner';

/*
 * "On its own": without a server, Android wakes the app every few hours
 * (expo-background-task). Each time, the friend may:
 *   1. look up things you wrote about (up to N searches a day, no asking),
 *   2. search once a day for things to do nearby that fit you,
 *   3. bundle what it found into ONE daily message: a notification + a chat message.
 *      On days with nothing found, the message written ahead of time (ahead.ts) arrives instead.
 * The same jobs also run whenever you open the app, so nothing depends on Android's timing alone.
 */

export const BACKGROUND_TASK = 'lifelog-background';
const DAY = 86_400_000;

export type Research = {
  id: number;
  note_id: number | null;
  topic: string;
  query: string;
  why: string | null;
  status: 'pending' | 'done' | 'failed' | 'skipped';
  result: string | null;
  sources: string | null;
  created_at: number;
  done_at: number | null;
};

/** The pages a lookup used, one per site (Google often cites the same site twice). */
export const researchSources = (r: Research): { title: string; uri: string }[] => {
  try {
    const all = JSON.parse(r.sources ?? '[]') as { title: string; uri: string }[];
    return all.filter((src, i) => all.findIndex((o) => o.title === src.title) === i);
  } catch {
    return [];
  }
};

export function getResearch(db: SQLiteDatabase, id: number): Promise<Research | null> {
  return db.getFirstAsync<Research>('SELECT * FROM research WHERE id = ?', id);
}

export function listResearch(db: SQLiteDatabase, limit = 15): Promise<Research[]> {
  return db.getAllAsync<Research>(
    "SELECT * FROM research WHERE status IN ('done', 'pending') ORDER BY coalesce(done_at, created_at) DESC LIMIT ?",
    limit,
  );
}

export async function deleteResearch(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM research WHERE id = ?', id);
}

// ───────────── 1. research ─────────────

let researching = false;

/** Looks up pending topics, within today's budget. Returns how many it finished. */
export async function runResearch(db: SQLiteDatabase): Promise<number> {
  if (researching) return 0;
  const s = await getAutonomySettings(db);
  const apiKey = await getKey('gemini');
  if (!s.enabled || !apiKey) return 0;

  const today = midnight(Date.now());
  const usedToday =
    (
      await db.getFirstAsync<{ n: number }>(
        "SELECT count(*) AS n FROM research WHERE status = 'done' AND done_at >= ?",
        today,
      )
    )?.n ?? 0;
  const budget = s.researchPerDay - usedToday;
  if (budget <= 0) return 0;

  researching = true;
  let done = 0;
  try {
    const rows = await db.getAllAsync<Research>(
      "SELECT * FROM research WHERE status = 'pending' ORDER BY created_at LIMIT ?",
      budget,
    );
    for (const r of rows) {
      // the list may have changed since the topic was queued
      if (isNeverResearch(`${r.topic} ${r.query}`, s.never)) {
        await db.runAsync("UPDATE research SET status = 'skipped' WHERE id = ?", r.id);
        continue;
      }
      try {
        const found = await groundedSearch(
          apiKey,
          PROVIDERS.gemini.defaultModel,
          `A friend wants to know about this. Topic: ${r.topic}. Search for: ${r.query}.` +
            (r.why ? ` Why it matters to them: ${r.why}.` : '') +
            ' Answer in 2 to 4 short sentences with the useful facts (dates, prices, places, steps) from current sources.' +
            " If you couldn't find solid information, say so plainly. Write in the same language as the 'why' text.",
        );
        await db.runAsync(
          "UPDATE research SET status = 'done', result = ?, sources = ?, done_at = ? WHERE id = ?",
          found.text || "Couldn't find anything solid on this.",
          JSON.stringify(found.sources),
          Date.now(),
          r.id,
        );
        done++;
      } catch (e) {
        console.warn('research failed', e);
        break; // offline or quota: the rest waits for the next run
      }
    }
  } finally {
    researching = false;
  }
  return done;
}

// ───────────── 2. things to do nearby ─────────────

/** Once a day: things in the next 3 days near you that fit you. Empty if nothing is worth it. */
async function findActivities(db: SQLiteDatabase, apiKey: string): Promise<FoundEvent[]> {
  const place = await getPlace(db);
  if (!place) return [];
  const days = [0, 1, 2].map((i) => dayTitle(midnight(Date.now()) + i * DAY)).join(', ');
  const found = await groundedSearch(
    apiKey,
    PROVIDERS.gemini.defaultModel,
    `Find things to do in or near ${place} on ${days} that would genuinely suit this person:\n${await aboutUser(db)}\n\n` +
      'Look for real events and activities: meetups, workshops, concerts, exhibitions, talks, sports or hobby groups, ' +
      'free things. Prefer ones that help them meet people. Only list things you actually found for those dates and ' +
      'that clearly fit them. Output one per line, exactly: TITLE | WHEN | PLACE | social or solo | URL. ' +
      'At most 3 lines. If nothing is really worth it, output NONE.',
    'daysoff',
  );
  return linkEvents(found, parseEventLines(found.text).slice(0, 3), place);
}

// ───────────── 3. the daily message ─────────────

let digesting = false;

/**
 * Sends at most one message a day with what the friend found. Nothing found = no ping.
 * `force` (the "Run now" button) ignores today's limit and the time, and delivers right away.
 */
export async function maybeSendDigest(db: SQLiteDatabase, force = false): Promise<'sent' | 'nothing' | 'later'> {
  if (digesting) return 'later';
  const s = await getAutonomySettings(db);
  const geminiKey = await getKey('gemini');
  const chat = await getChatConfig(db);
  if (!s.enabled || !chat.apiKey) return 'nothing';

  const today = dayParam(Date.now());
  if (!force && (await getSetting(db, 'autonomy.lastDigest')) === today) return 'later';
  if (!force && new Date().getHours() < 6) return 'later'; // don't prepare in the middle of the night

  digesting = true;
  try {
    const research = await db.getAllAsync<Research>(
      "SELECT * FROM research WHERE status = 'done' AND digested = 0 ORDER BY done_at",
    );
    let activities: FoundEvent[] = [];
    if (s.activities && geminiKey && (force || (await getSetting(db, 'autonomy.lastActivities')) !== today)) {
      activities = await findActivities(db, geminiKey).catch(() => []);
      await setSetting(db, 'autonomy.lastActivities', today);
    }
    const reads = await db.getAllAsync<Read>(
      "SELECT * FROM reads WHERE status = 'done' AND digested = 0 ORDER BY done_at",
    );
    if (!research.length && !activities.length && !reads.length) return 'nothing';
    if (!(await ensureNotificationPermission())) return 'later';

    const parts: string[] = [];
    if (reads.length) {
      parts.push(
        'Articles you researched and wrote for them after a chat (give each its link exactly as is, on its own line):\n' +
          reads
            .map((r) => {
              const a = articleOf(r);
              return `- "${a?.title ?? r.topic}": ${a?.hook ?? ''}\n  lifelog://read/${r.id}`;
            })
            .join('\n'),
      );
    }
    if (research.length) {
      parts.push(
        'Things you looked up for them:\n' +
          research
            .map((r) => {
              const link = researchSources(r)[0]?.uri;
              return `- ${r.topic} (they wrote: ${r.why ?? 'n/a'}): ${r.result}${link ? `\n  ${link}` : ''}`;
            })
            .join('\n'),
      );
    }
    if (activities.length) {
      parts.push(
        'Things to do nearby you found:\n' + activities.map((a) => `- ${a.title}, ${a.when}, ${a.where}\n  ${a.url}`).join('\n'),
      );
    }

    const body = (
      await PROVIDERS[chat.provider].complete({
        feature: 'checkins',
        apiKey: chat.apiKey,
        model: chat.model,
        maxTokens: 900,
        system:
          "You are the user's close friend who has read their journal. You looked a few things up for them today " +
          'without being asked, and now you message them about it. Casual, short, a little funny, like a text from a friend. ' +
          'Mention each item briefly and keep every URL exactly as given, each on its own line. ' +
          "Write in the language of their journal. No headings, no bullet lists unless there are 3+ items.\n\n" +
          (await aboutUser(db)),
        prompt: parts.join('\n\n'),
      })
    ).trim();
    if (!body) return 'nothing';

    const at = force ? Date.now() : Math.max(Date.now(), digestTimeOn(s));
    // today's pre-written message (see ahead.ts) steps aside for the real one
    await cancelPending(db, 'ahead', midnight(at), midnight(at) + DAY);
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: reads.length
          ? `I dug into ${articleOf(reads[0])?.title ?? reads[0].topic} for you`
          : research.length
            ? 'I looked a few things up for you'
            : 'Something to do nearby',
        body: body.length > 140 ? `${body.slice(0, 137)}…` : body,
        // a Read opens the article itself; anything else opens the chat
        data: reads.length ? { kind: 'read', id: reads[0].id } : { kind: 'checkin' },
      },
      trigger:
        at > Date.now() + 5000
          ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at), channelId: 'checkins' }
          : null,
    });
    await db.runAsync(
      "INSERT OR IGNORE INTO checkins(fire_at, body, notification_id, kind) VALUES (?, ?, ?, 'digest')",
      at,
      body,
      notificationId,
    );
    for (const r of research) await db.runAsync('UPDATE research SET digested = 1 WHERE id = ?', r.id);
    for (const r of reads) await db.runAsync('UPDATE reads SET digested = 1 WHERE id = ?', r.id);
    await setSetting(db, 'autonomy.lastDigest', today);
    return 'sent';
  } catch (e) {
    console.warn('digest failed', e);
    return 'later';
  } finally {
    digesting = false;
  }
}

// ───────────── Android background task ─────────────

/** Registers or removes the background task to match the setting. Safe to call on every launch. */
export async function syncBackgroundTask(db: SQLiteDatabase): Promise<void> {
  const { enabled } = await getAutonomySettings(db);
  const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK);
  if (enabled && !registered) await BackgroundTask.registerTaskAsync(BACKGROUND_TASK, { minimumInterval: 120 });
  if (!enabled && registered) await BackgroundTask.unregisterTaskAsync(BACKGROUND_TASK);
}

/** When the background task last really ran (not the app being open): proof Android isn't killing it. */
export async function lastBackgroundRun(db: SQLiteDatabase): Promise<number> {
  return Number(await getSetting(db, 'autonomy.lastRun', '0'));
}

export async function backgroundAvailable(): Promise<boolean> {
  return (await BackgroundTask.getStatusAsync()) === BackgroundTask.BackgroundTaskStatus.Available;
}
