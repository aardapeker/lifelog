import type { SQLiteDatabase } from 'expo-sqlite';
import { planAhead } from './ahead';
import { maybeSendDigest, runResearch } from './autonomy';
import { deliverDue, planCheckins } from './checkins';
import { indexPending } from './embeddings';
import { learnFromChats } from './chatMemory';
import { learnFacts } from './facts';
import { captionPending } from './photos';
import { writePendingReads } from './reads';
import { scheduleDayOffReminders } from './planner';
import { ensureRecap } from './recap';

/**
 * Everything the app does "on its own", run when it opens or after you save.
 * Each job is idempotent, skips itself without a key, and never throws.
 */
let running: Promise<void> | null = null;
let lastRun = 0;

/**
 * soft: from coming back to the Journal. Skipped if a run is going or one finished in the last
 * 2 minutes (it used to run all 13 jobs on every tab switch, which made switching sluggish).
 */
export function runBackgroundJobs(db: SQLiteDatabase, opts: { soft?: boolean } = {}): Promise<void> {
  if (running) return running;
  if (opts.soft && Date.now() - lastRun < 2 * 60_000) return Promise.resolve();
  running = runAll(db).finally(() => {
    running = null;
    lastRun = Date.now();
  });
  return running;
}

async function runAll(db: SQLiteDatabase): Promise<void> {
  const safe = (p: Promise<unknown>) => p.catch((e) => console.warn('background job failed', e));
  await safe(deliverDue(db));
  await safe(captionPending(db)); // captions first, so they get embedded right after
  await safe(indexPending(db));
  await safe(learnFacts(db));
  await safe(learnFromChats(db)); // chats that went quiet become memory (and maybe a Read)
  await safe(ensureRecap(db));
  await safe(planAhead(db)); // a message for each of the next 7 days, in case Android keeps us asleep
  await safe(planCheckins(db)); // fills the next week of break-time check-ins
  await safe(scheduleDayOffReminders(db));
  // the friend acting on its own: research what you wrote about, then maybe one message for the day
  await safe(runResearch(db));
  await safe(writePendingReads(db)); // at most one Read a day
  await safe(maybeSendDigest(db));
}
