import { gcm } from '@noble/ciphers/aes.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { getRandomBytes } from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { deserializeDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import { getSetting, migrate, setSetting } from './db';
import { photosDir } from './photos';

/*
 * Backup file format (.lifelog):
 *   "LLBK1" | salt (16) | nonce (12) | AES-256-GCM( packed entries )
 * Key = scrypt(passphrase, salt). Without the passphrase the file is random bytes,
 * so it's safe to keep on Google Drive.
 * Packed entries: u32 count, then per entry u16 nameLength, name, u32 dataLength, data.
 * Entries: "db" (the whole SQLite database) and "photos/<file>".
 */

const MAGIC = new Uint8Array([76, 76, 66, 75, 49]); // LLBK1
const PASS_KEY = 'backup.passphrase';
// Order matters: parents before children when inserting, reverse when deleting.
const TABLES = ['notes', 'chunks', 'photos', 'facts', 'messages', 'recaps', 'kv'];

export const getPassphrase = () => SecureStore.getItemAsync(PASS_KEY);
export async function setPassphrase(p: string) {
  if (p.trim().length < 8) throw new Error('Use at least 8 characters. You will need it to restore.');
  await SecureStore.setItemAsync(PASS_KEY, p.trim());
}

const deriveKey = (pass: string, salt: Uint8Array) => scryptAsync(pass, salt, { N: 2 ** 14, r: 8, p: 1, dkLen: 32 });

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const fromAscii = (b: Uint8Array) => String.fromCharCode(...b);

function pack(entries: [string, Uint8Array][]): Uint8Array {
  const size = 4 + entries.reduce((n, [name, data]) => n + 2 + name.length + 4 + data.length, 0);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let o = 0;
  view.setUint32(o, entries.length);
  o += 4;
  for (const [name, data] of entries) {
    view.setUint16(o, name.length);
    o += 2;
    out.set(ascii(name), o);
    o += name.length;
    view.setUint32(o, data.length);
    o += 4;
    out.set(data, o);
    o += data.length;
  }
  return out;
}

function unpack(buf: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const entries = new Map<string, Uint8Array>();
  let o = 0;
  const count = view.getUint32(o);
  o += 4;
  for (let i = 0; i < count; i++) {
    const nameLen = view.getUint16(o);
    o += 2;
    const name = fromAscii(buf.subarray(o, o + nameLen));
    o += nameLen;
    const len = view.getUint32(o);
    o += 4;
    entries.set(name, buf.subarray(o, o + len));
    o += len;
  }
  return entries;
}

export async function lastBackupAt(db: SQLiteDatabase): Promise<number> {
  return Number(await getSetting(db, 'lastBackup', '0'));
}

/** True when there are entries and the last backup is more than a day old. */
export async function backupDue(db: SQLiteDatabase): Promise<boolean> {
  const any = await db.getFirstAsync('SELECT id FROM notes LIMIT 1');
  return !!any && Date.now() - (await lastBackupAt(db)) > 86_400_000;
}

/** Builds the encrypted file and opens the share sheet (pick "Drive" to keep it safe). */
export async function backupNow(db: SQLiteDatabase): Promise<void> {
  const pass = await getPassphrase();
  if (!pass) throw new Error('Set a backup passphrase first.');

  const entries: [string, Uint8Array][] = [['db', await db.serializeAsync()]];
  const photos = await db.getAllAsync<{ file: string }>('SELECT file FROM photos');
  for (const { file } of photos) {
    const f = new File(photosDir(), file);
    if (f.exists) entries.push([`photos/${file}`, await f.bytes()]);
  }

  const salt = getRandomBytes(16);
  const nonce = getRandomBytes(12);
  const key = await deriveKey(pass, salt);
  const sealed = gcm(key, nonce).encrypt(pack(entries));

  const out = new Uint8Array(MAGIC.length + 16 + 12 + sealed.length);
  out.set(MAGIC, 0);
  out.set(salt, 5);
  out.set(nonce, 21);
  out.set(sealed, 33);

  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const file = new File(Paths.cache, `lifelog-${stamp}.lifelog`);
  if (file.exists) file.delete();
  file.create();
  await file.write(out);

  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/octet-stream',
    dialogTitle: 'Save your Lifelog backup (pick Drive)',
  });
  await setSetting(db, 'lastBackup', String(Date.now()));
}

/** Picks a .lifelog file, decrypts it and replaces everything in the app with its contents. */
export async function restoreFromFile(db: SQLiteDatabase, pass: string): Promise<boolean> {
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (picked.canceled || !picked.assets[0]) return false;
  const buf = await new File(picked.assets[0].uri).bytes();

  if (buf.length < 34 || MAGIC.some((b, i) => buf[i] !== b)) throw new Error('This is not a Lifelog backup file.');
  const key = await deriveKey(pass.trim(), buf.subarray(5, 21));
  let plain: Uint8Array;
  try {
    plain = gcm(key, buf.subarray(21, 33)).decrypt(buf.subarray(33));
  } catch {
    throw new Error('Wrong passphrase, or the file is damaged.');
  }
  const entries = unpack(plain);
  const dbBytes = entries.get('db');
  if (!dbBytes) throw new Error('The backup has no database inside.');

  // Bring an older backup up to today's schema, then write it to disk so we can ATTACH it.
  const restored = await deserializeDatabaseAsync(dbBytes);
  await migrate(restored);
  const upgraded = await restored.serializeAsync();
  await restored.closeAsync();
  const tmp = new File(Paths.cache, 'restore.db');
  if (tmp.exists) tmp.delete();
  tmp.create();
  await tmp.write(upgraded);

  for (const [name, data] of entries) {
    if (!name.startsWith('photos/')) continue;
    const f = new File(photosDir(), name.slice('photos/'.length));
    if (f.exists) f.delete();
    f.create();
    await f.write(data);
  }

  const path = decodeURIComponent(tmp.uri.replace(/^file:\/\//, ''));
  await db.execAsync(`ATTACH DATABASE '${path.replace(/'/g, "''")}' AS r`);
  try {
    await db.withTransactionAsync(async () => {
      for (const t of [...TABLES].reverse()) await db.execAsync(`DELETE FROM main.${t}`);
      await db.execAsync('DELETE FROM main.checkins');
      for (const t of TABLES) await db.execAsync(`INSERT INTO main.${t} SELECT * FROM r.${t}`);
      await db.execAsync("INSERT INTO notes_fts(notes_fts) VALUES ('rebuild')");
    });
  } finally {
    await db.execAsync('DETACH DATABASE r');
    tmp.delete();
  }
  await setSetting(db, 'lastBackup', String(Date.now()));
  return true;
}
