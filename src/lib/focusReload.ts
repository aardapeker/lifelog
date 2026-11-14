import { useFocusEffect } from 'expo-router';
import type { SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useRef } from 'react';
import { changeStamp } from './db';
import { time } from './perf';

const MAX_AGE_MS = 10 * 60_000; // "this week", "today" still move on their own

/**
 * Reloads a tab's data when it's opened, but only if something was written since the last load (or
 * it's 10 minutes old). Tabs stay mounted, so otherwise the last result is simply still on screen:
 * opening the tab costs nothing. (The screen's own writes already reload it directly.)
 */
export function useFocusReload(db: SQLiteDatabase, name: string, load: () => Promise<void>): void {
  const last = useRef<{ stamp: string; at: number } | null>(null);
  const run = useCallback(async () => {
    const stamp = await changeStamp(db).catch(() => '');
    await time(name, load);
    last.current = { stamp, at: Date.now() };
  }, [db, name, load]);
  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(async () => {
        const l = last.current;
        if (l && Date.now() - l.at < MAX_AGE_MS && l.stamp && (await changeStamp(db).catch(() => '')) === l.stamp) return; // nothing new
        run();
      }, 250); // after the tab switch, so it stays smooth
      return () => clearTimeout(t);
    }, [db, run]),
  );
}
