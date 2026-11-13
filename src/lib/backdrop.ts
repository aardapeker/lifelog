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

let current = '';
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const announce = () => listeners.forEach((l) => l());

openDatabaseAsync(DB_NAME)
  .then((db) => getSetting(db, 'backdrop', ''))
  .then((v) => {
    if (v !== current) {
      current = v;
      announce();
    }
  })
  .catch(() => {});

export const useBackdrop = () => useSyncExternalStore(subscribe, () => current);

export async function setBackdrop(db: SQLiteDatabase, color: string): Promise<void> {
  current = color;
  announce();
  await setSetting(db, 'backdrop', color);
}
