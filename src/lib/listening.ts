import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { strFromU8, unzipSync } from 'fflate';
import { getSetting, setSetting } from './db';
import { isAudioHistory, parseHistory, slotOf, type Listen, type SongHistory } from './listenText';
import { recentlyPlayed, spotifyConnected } from './spotify';

/*
 * Your listening history, kept by Lifelog: Spotify's API only remembers your last 50 plays and no
 * play counts, so every few hours (the background job, opening the app, starting a show) the new plays
 * are saved here. Spotify's "Extended streaming history" export can be imported once for the years
 * before. The radio's hosts use it ("you played this 9 times this week", "you haven't played this for
 * a month"). Only on your phone, in the backup like everything else.
 */

export { historyLine } from './listenText';

async function insert(db: SQLiteDatabase, rows: Listen[]): Promise<number> {
  let added = 0;
  await db.withTransactionAsync(async () => {
    const st = await db.prepareAsync(
      'INSERT OR IGNORE INTO listens (track_id, name, artist, played_at, slot, ms_played, source) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    try {
      for (const r of rows) {
        const res = await st.executeAsync(r.trackId, r.name, r.artist, r.playedAt, slotOf(r.playedAt), r.msPlayed, r.source);
        added += res.changes;
      }
    } finally {
      await st.finalizeAsync();
    }
  });
  return added;
}

let syncing: Promise<number> | null = null;

/** Saves the plays since the last time (Spotify gives the newest 50). Quietly does nothing without Spotify. */
export function syncListens(db: SQLiteDatabase): Promise<number> {
  syncing ??= (async () => {
    if (!(await spotifyConnected())) return 0;
    const after = Number(await getSetting(db, 'listens.after', '0'));
    const plays = await recentlyPlayed(after);
    if (!plays.length) return 0;
    const added = await insert(
      db,
      plays.map((p) => ({ trackId: p.track.id, name: p.track.name, artist: p.track.artist, playedAt: p.playedAt, msPlayed: null, source: 'api' as const })),
    );
    await setSetting(db, 'listens.after', String(Math.max(...plays.map((p) => p.playedAt))));
    return added;
  })().finally(() => (syncing = null));
  return syncing;
}

/**
 * Settings → Radio: pick Spotify's export (the .zip, or the Streaming_History_Audio .json files)
 * and add every song play in it. Returns how many plays were new, or null when nothing was picked.
 */
export async function importSpotifyHistory(db: SQLiteDatabase, onProgress?: (msg: string) => void): Promise<{ added: number; total: number } | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: ['application/zip', 'application/json', '*/*'], multiple: true, copyToCacheDirectory: true });
  if (picked.canceled || !picked.assets.length) return null;
  let total = 0;
  let added = 0;
  for (const asset of picked.assets) {
    const name = asset.name ?? asset.uri;
    onProgress?.(`Reading ${name}…`);
    const bytes = await new File(asset.uri).bytes();
    // a zip: only the music files inside it (it also has video and podcast history)
    const texts = /\.zip$/i.test(name) || (bytes[0] === 0x50 && bytes[1] === 0x4b)
      ? Object.entries(unzipSync(bytes, { filter: (f) => isAudioHistory(f.name) })).map(([, data]) => strFromU8(data))
      : [strFromU8(bytes)];
    for (const text of texts) {
      let rows: Listen[] = [];
      try {
        rows = parseHistory(JSON.parse(text));
      } catch {
        continue; // not a history file
      }
      total += rows.length;
      onProgress?.(`Saving ${total.toLocaleString('en')} plays…`);
      added += await insert(db, rows);
    }
  }
  if (!total) throw new Error('No song plays in that file. Pick the zip from Spotify, or the Streaming_History_Audio files in it.');
  return { added, total };
}

/** How much history there is: plays saved, and since when. */
export async function historySummary(db: SQLiteDatabase): Promise<{ plays: number; since: number | null }> {
  const r = await db.getFirstAsync<{ n: number; first: number | null }>('SELECT COUNT(*) AS n, MIN(played_at) AS first FROM listens');
  return { plays: r?.n ?? 0, since: r?.first ?? null };
}

/** Each song's plays, plays this week and last play (for the songs asked about). */
export async function songHistories(db: SQLiteDatabase, trackIds: string[], now = Date.now()): Promise<Map<string, SongHistory>> {
  const out = new Map<string, SongHistory>();
  if (!trackIds.length) return out;
  const rows = await db.getAllAsync<{ track_id: string; plays: number; week: number; last_at: number }>(
    `SELECT track_id, COUNT(*) AS plays, SUM(played_at >= ?) AS week, MAX(played_at) AS last_at
     FROM listens WHERE track_id IN (${trackIds.map(() => '?').join(',')}) GROUP BY track_id`,
    now - 7 * 86_400_000,
    ...trackIds,
  );
  for (const r of rows) out.set(r.track_id, { plays: r.plays, week: r.week ?? 0, lastAt: r.last_at });
  return out;
}

/**
 * The listener's numbers for these artists, from their real Spotify plays: how many times, and where the artist
 * ranks among everyone they listen to ("Sezen Aksu, your 3rd most played, 412 plays"). The radio's milestones.
 */
export async function artistStats(db: SQLiteDatabase, artists: string[]): Promise<{ artist: string; plays: number; rank: number }[]> {
  const rows = await db.getAllAsync<{ a: string; n: number }>(
    // the first credited artist ("Ezhel, Ufo361" counts for Ezhel)
    `SELECT lower(trim(CASE WHEN instr(artist, ',') > 0 THEN substr(artist, 1, instr(artist, ',') - 1) ELSE artist END)) AS a,
            COUNT(*) AS n FROM listens GROUP BY a ORDER BY n DESC`,
  );
  const want = [...new Set(artists.map((x) => x.split(',')[0].trim()))];
  return want
    .map((artist) => {
      const i = rows.findIndex((r) => r.a === artist.toLowerCase());
      return i < 0 ? null : { artist, plays: rows[i].n, rank: i + 1 };
    })
    .filter((x): x is { artist: string; plays: number; rank: number } => !!x && x.plays >= 5);
}
