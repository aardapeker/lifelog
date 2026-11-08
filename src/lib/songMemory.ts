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

/** Remembers a song as played (newest first, no duplicates, capped), and counts the play. */
export async function rememberPlayed(db: SQLiteDatabase, t: Track): Promise<void> {
  const old = await playedSongs(db);
  const next = [ref(t), ...old.filter((s) => s.id !== t.id)].slice(0, KEEP);
  await setSetting(db, PLAYED, JSON.stringify(next));
  const plays = await playTimes(db);
  plays[t.id] = [Date.now(), ...(plays[t.id] ?? [])].slice(0, 10);
  await setSetting(db, PLAYS, JSON.stringify(plays));
}

// when each song was played (newest 10 per song), so favourites that keep coming back get rarer
const PLAYS = 'radio.plays';
const MONTH = 30 * 86_400_000;

async function playTimes(db: SQLiteDatabase): Promise<Record<string, number[]>> {
  try {
    const all = JSON.parse(await getSetting(db, PLAYS, '{}')) as Record<string, number[]>;
    for (const id of Object.keys(all)) {
      all[id] = all[id].filter((at) => Date.now() - at < MONTH);
      if (!all[id].length) delete all[id];
    }
    return all;
  } catch {
    return {};
  }
}

/** How many times each song played on the radio in the last 30 days. */
export async function playsThisMonth(db: SQLiteDatabase): Promise<Map<string, number>> {
  return new Map(Object.entries(await playTimes(db)).map(([id, at]) => [id, at.length]));
}

/** Hearts or un-hearts a song. Returns whether it's hearted now. */
export async function toggleLiked(db: SQLiteDatabase, t: Track | SongRef): Promise<boolean> {
  const old = await likedSongs(db);
  const has = old.some((s) => s.id === t.id);
  await setSetting(db, LIKED, JSON.stringify(has ? old.filter((s) => s.id !== t.id) : [ref(t), ...old]));
  return !has;
}

export const songLine = (s: SongRef) => `${s.name} - ${s.artist}`;

// ── songs you never want to hear on the radio ──

const BANNED = 'radio.banned';
export const bannedSongs = (db: SQLiteDatabase) => list(db, BANNED);

/** Bans a song from the radio for good (and un-hearts it). */
export async function banSong(db: SQLiteDatabase, t: Track | SongRef): Promise<void> {
  const old = await bannedSongs(db);
  if (!old.some((s) => s.id === t.id)) await setSetting(db, BANNED, JSON.stringify([ref(t), ...old]));
  const liked = await likedSongs(db);
  if (liked.some((s) => s.id === t.id)) await setSetting(db, LIKED, JSON.stringify(liked.filter((s) => s.id !== t.id)));
}

export const clearBanned = (db: SQLiteDatabase) => setSetting(db, BANNED, '[]');

/** Lets one banned song play again. */
export async function unbanSong(db: SQLiteDatabase, id: string): Promise<void> {
  await setSetting(db, BANNED, JSON.stringify((await bannedSongs(db)).filter((s) => s.id !== id)));
}

// ── how the radio picks songs (Settings → Radio) ──

export type RadioPrefs = {
  hits: number; // big, well-known hits per show (0-4)
  favourites: 'never' | 'sometimes' | 'often'; // hearted, journal and Spotify Liked songs coming back
  spotifyLiked: boolean; // use your Spotify Liked Songs as favourites
  twists: boolean; // a random theme per show
  talk: 'short' | 'normal' | 'long'; // how much the hosts say between songs
};

const PREFS_DEFAULT: RadioPrefs = { hits: 2, favourites: 'sometimes', spotifyLiked: true, twists: true, talk: 'normal' };

export async function getRadioPrefs(db: SQLiteDatabase): Promise<RadioPrefs> {
  try {
    return { ...PREFS_DEFAULT, ...JSON.parse(await getSetting(db, 'radio.prefs', '{}')) };
  } catch {
    return PREFS_DEFAULT;
  }
}

export const saveRadioPrefs = (db: SQLiteDatabase, p: RadioPrefs) => setSetting(db, 'radio.prefs', JSON.stringify(p));

/** How many favourites a show may bring back, per setting. */
export const FAVOURITES_PER_SHOW = { never: 0, sometimes: 2, often: 4 } as const;
