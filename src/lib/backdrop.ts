import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { useSyncExternalStore } from 'react';
import { DB_NAME, getSetting, setSetting } from './db';

/*
 * The app's background colour when no show is playing (Settings → Me → Background): '' is the plain
 * dark background, a colour gives the playlist look (that colour at the top, fading into black).
 * While a show plays, the song's colour always wins.
 */

export const BACKDROPS: { key: string; label: string; color: string }[] = [
  { key: '', label: 'Plain', color: '#272626' },
  { key: 'rgb(150, 90, 190)', label: 'Purple', color: 'rgb(150, 90, 190)' },
  { key: 'rgb(200, 40, 60)', label: 'Red', color: 'rgb(200, 40, 60)' },
  { key: 'rgb(230, 120, 60)', label: 'Sunset', color: 'rgb(230, 120, 60)' },
  { key: 'rgb(210, 170, 70)', label: 'Gold', color: 'rgb(210, 170, 70)' },
  { key: 'rgb(60, 160, 110)', label: 'Green', color: 'rgb(60, 160, 110)' },
  { key: 'rgb(40, 150, 170)', label: 'Teal', color: 'rgb(40, 150, 170)' },
  { key: 'rgb(60, 110, 220)', label: 'Blue', color: 'rgb(60, 110, 220)' },
  { key: 'rgb(220, 80, 160)', label: 'Pink', color: 'rgb(220, 80, 160)' },
];

/**
 * A look setting the whole app reads (no db context needed): kept in memory, loaded once from the
 * database, and every screen using it updates when it changes.
 */
function lookSetting(key: string, fallback: string) {
  let current = fallback;
  const listeners = new Set<() => void>();
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  const announce = () => listeners.forEach((l) => l());
  const apply = (v: string) => {
    if (v === current) return;
    current = v;
    announce();
  };
  return {
    get: () => current,
    load: (db: SQLiteDatabase) => getSetting(db, key, fallback).then(apply),
    use: () => useSyncExternalStore(subscribe, () => current),
    set: async (db: SQLiteDatabase, v: string) => {
      apply(v);
      await setSetting(db, key, v);
    },
  };
}

const backdrop = lookSetting('backdrop', '');
/** Frosted glass on the top bar and the tab bar ('1'), or the plain dark bars ('0', lighter on the GPU). */
export const frosted = lookSetting('frosted', '1');

openDatabaseAsync(DB_NAME)
  .then((db) => Promise.all([backdrop.load(db), frosted.load(db)]))
  .catch(() => {});

export const useBackdrop = backdrop.use;
export const setBackdrop = backdrop.set;
