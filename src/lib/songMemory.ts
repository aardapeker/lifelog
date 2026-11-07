import type { SQLiteDatabase } from 'expo-sqlite';
import { getSetting, setSetting } from './db';
import type { Track } from './spotify';

/*
 * What the radio has played, and the songs you hearted. Played songs aren't repeated
 * (the newest 150 are remembered); hearted songs may come back now and then.
 */

export type SongRef = { id: string; uri: string; name: string; artist: string };

const PLAYED = 'radio.played';
const LIKED = 'radio.liked';
const KEEP = 150;

const ref = (t: Track | SongRef): SongRef => ({ id: t.id, uri: t.uri, name: t.name, artist: t.artist });

async function list(db: SQLiteDatabase, key: string): Promise<SongRef[]> {
  try {
    return JSON.parse(await getSetting(db, key, '[]')) as SongRef[];
  } catch {
    return [];
  }
}

export const playedSongs = (db: SQLiteDatabase) => list(db, PLAYED);
export const likedSongs = (db: SQLiteDatabase) => list(db, LIKED);

/** Remembers a song as played (newest first, no duplicates, capped). */
export async function rememberPlayed(db: SQLiteDatabase, t: Track): Promise<void> {
  const old = await playedSongs(db);
  const next = [ref(t), ...old.filter((s) => s.id !== t.id)].slice(0, KEEP);
  await setSetting(db, PLAYED, JSON.stringify(next));
}

/** Hearts or un-hearts a song. Returns whether it's hearted now. */
export async function toggleLiked(db: SQLiteDatabase, t: Track | SongRef): Promise<boolean> {
  const old = await likedSongs(db);
  const has = old.some((s) => s.id === t.id);
  await setSetting(db, LIKED, JSON.stringify(has ? old.filter((s) => s.id !== t.id) : [ref(t), ...old]));
  return !has;
}

export const songLine = (s: SongRef) => `${s.name} - ${s.artist}`;
