import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getSetting } from './db';
import type { PastShow } from './radioEngine';

/** Bytes in a folder and everything under it. */
function sizeOf(dir: Directory): number {
  if (!dir.exists) return 0;
  let total = 0;
  for (const x of dir.list()) total += x instanceof File ? (x.size ?? 0) : sizeOf(x);
  return total;
}

export type RadioStorage = {
  saved: { id: string; title: string; emoji: string; bytes: number }[]; // 🔖 shows, biggest first
  recentBytes: number; // the voices of the newest shows (not saved)
  scriptsBytes: number; // the scripts of every kept show (text)
  samplesBytes: number; // voice previews
  total: number;
  free: number; // free space on the phone
};

/** How much room the radio takes on the phone (Settings → Usage). */
export async function radioStorage(db: SQLiteDatabase): Promise<RadioStorage> {
  const raw = await getSetting(db, 'radio.history', '[]');
  const history = JSON.parse(raw) as PastShow[];
  const voices = new Directory(Paths.document, 'show-voices');
  const bytesOf = (id: string) => sizeOf(new Directory(voices, id));
  const saved = history
    .filter((h) => h.kept)
    .map((h) => ({ id: h.id, title: h.show.title, emoji: h.show.station.emoji, bytes: bytesOf(h.id) }))
    .sort((a, b) => b.bytes - a.bytes);
  const savedBytes = saved.reduce((n, s) => n + s.bytes, 0);
  const recentBytes = Math.max(0, sizeOf(voices) - savedBytes);
  const scriptsBytes = raw.length; // close enough: mostly plain text
  const samplesBytes = sizeOf(new Directory(Paths.document, 'voice-samples'));
  let free = 0;
  try {
    free = Paths.availableDiskSpace;
  } catch {}
  return { saved, recentBytes, scriptsBytes, samplesBytes, total: savedBytes + recentBytes + scriptsBytes + samplesBytes, free };
}

/** 23.4 MB, 812 KB, 1.2 GB. */
export function bytesLabel(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}
