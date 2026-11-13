import { useSQLiteContext } from 'expo-sqlite';
import { useMemo } from 'react';
import type { RadarBackend } from './backend';
import { localBackend } from './local';

/** The Radar backend the screens talk to: the phone itself for now (swap for an ApiBackend later). */
export function useRadar(): RadarBackend {
  const db = useSQLiteContext();
  return useMemo(() => localBackend(db), [db]);
}
