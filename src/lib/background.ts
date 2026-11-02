import type { SQLiteDatabase } from 'expo-sqlite';
import { maybeSendDigest, runResearch } from './autonomy';
import { deliverDue, planCheckins } from './checkins';
import { indexPending } from './embeddings';
import { learnFacts } from './facts';
import { captionPending } from './photos';
import { scheduleDayOffReminders } from './planner';
import { ensureRecap } from './recap';

/**
 * Everything the app does "on its own", run when it opens or after you save.
 * Each job is idempotent, skips itself without a key, and never throws.
 */
export async function runBackgroundJobs(db: SQLiteDatabase): Promise<void> {
  const safe = (p: Promise<unknown>) => p.catch((e) => console.warn('background job failed', e));
  await safe(deliverDue(db));
  await safe(captionPending(db)); // captions first, so they get embedded right after
  await safe(indexPending(db));
  await safe(learnFacts(db));
  await safe(ensureRecap(db));
  await safe(planCheckins(db));
  await safe(scheduleDayOffReminders(db));
  // the friend acting on its own: research what you wrote about, then maybe one message for the day
  await safe(runResearch(db));
  await safe(maybeSendDigest(db));
}
