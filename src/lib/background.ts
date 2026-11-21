import type { SQLiteDatabase } from 'expo-sqlite';
import { planAhead } from './ahead';
import { maybeSendDigest, runResearch } from './autonomy';
import { deliverDue, planCheckins } from './checkins';
import { indexPending } from './embeddings';
import { learnFromChats } from './chatMemory';
import { learnFacts, tidyFacts } from './facts';
import { captionPending } from './photos';
import { writePendingReads } from './reads';
import { scheduleDayOffReminders } from './planner';
import { ensureRecap } from './recap';
import { checkAchievements } from './achievements';
import { ensureWrapped } from './wrapped';
import { radarJob } from '../radar/local';
import { getSetting, setSetting } from './db';
import { syncListens } from './listening';
import { time } from './perf';

/**
 * Everything the app does "on its own", run when it opens or after you save.
 * Each job is idempotent, skips itself without a key, and never throws.
 */
let running: Promise<void> | null = null;
let lastRun = 0;
const SOFT_GAP = 2 * 60_000;
const COLD_GAP = 15 * 60_000;

/**
 * soft: from coming back to the Journal. Skipped if a run is going or one finished in the last
 * 2 minutes (it used to run all 13 jobs on every tab switch, which made switching sluggish).
 * Android often closes Lifelog in the background, so most openings are fresh starts: the time of the
 * last run is kept in the database too, and a fresh start skips the jobs if they ran in the last
 * 15 minutes (they were part of the warm phone right after opening).
 */
export function runBackgroundJobs(db: SQLiteDatabase, opts: { soft?: boolean } = {}): Promise<void> {
  if (running) return running;
  if (opts.soft && Date.now() - lastRun < SOFT_GAP) return Promise.resolve();
  running = (async () => {
    if (opts.soft && lastRun === 0) {
      const before = Number(await getSetting(db, 'jobs.lastRun', '0'));
      if (Date.now() - before < COLD_GAP) {
        lastRun = before;
        return;
      }
    }
    await time('background jobs', () => runAll(db));
    lastRun = Date.now();
    await setSetting(db, 'jobs.lastRun', String(lastRun)).catch(() => {});
  })().finally(() => {
    running = null;
  });
  return running;
}

async function runAll(db: SQLiteDatabase): Promise<void> {
  const safe = (p: Promise<unknown>) => p.catch((e) => console.warn('background job failed', e));
  await safe(deliverDue(db));
  await safe(syncListens(db)); // your Spotify plays, before Spotify forgets them (it keeps the last 50)
  await safe(checkAchievements(db)); // silly badges: a few counts, no AI
  await safe(captionPending(db)); // captions first, so they get embedded right after
  await safe(indexPending(db));
  await safe(learnFacts(db));
  await safe(learnFromChats(db)); // chats that went quiet become memory (and maybe a Read)
  await safe(tidyFacts(db)); // weekly: duplicate facts become one, all in English
  await safe(ensureRecap(db));
  await safe(ensureWrapped(db)); // last month's Wrapped, on the 1st
  await safe(planAhead(db)); // a message for each of the next 7 days, in case Android keeps us asleep
  await safe(planCheckins(db)); // fills the next week of break-time check-ins
  await safe(scheduleDayOffReminders(db));
  // the friend acting on its own: research what you wrote about, then maybe one message for the day
  await safe(runResearch(db));
  await safe(writePendingReads(db)); // at most one Read a day
  await safe(maybeSendDigest(db));
  await safe(radarJob(db)); // Radar: new news every ~2 hours, and the morning digest
}
