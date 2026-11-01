import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getBackgroundConfig } from './chat';
import { indexPending } from './embeddings';
import { rechunk } from './notes';

export type Photo = { id: number; note_id: number; file: string; caption: string | null };

export function photosDir(): Directory {
  const dir = new Directory(Paths.document, 'photos');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export const photoUri = (file: string) => new File(photosDir(), file).uri;

/** Opens the camera or gallery and copies the picked image into the app's own folder. */
export async function pickPhoto(source: 'camera' | 'library'): Promise<string | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Camera permission is off. Turn it on in Android settings.');
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5 };
  const result =
    source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (result.canceled || !result.assets[0]) return null;
  const name = `${Date.now()}-${Math.round(Math.random() * 1e6)}.jpg`;
  await new File(result.assets[0].uri).copy(new File(photosDir(), name));
  return name;
}

/** Copies an image from elsewhere (e.g. shared from another app) into the app's photos folder. */
export async function importPhoto(uri: string): Promise<string> {
  const name = `${Date.now()}-${Math.round(Math.random() * 1e6)}.jpg`;
  await new File(uri).copy(new File(photosDir(), name));
  return name;
}

export function listPhotos(db: SQLiteDatabase, noteId: number): Promise<Photo[]> {
  return db.getAllAsync<Photo>('SELECT * FROM photos WHERE note_id = ? ORDER BY id', noteId);
}

/** note_id → photo files, for the journal cards */
export async function photoMap(db: SQLiteDatabase): Promise<Map<number, string[]>> {
  const rows = await db.getAllAsync<{ note_id: number; file: string }>('SELECT note_id, file FROM photos ORDER BY id');
  const map = new Map<number, string[]>();
  for (const r of rows) map.set(r.note_id, [...(map.get(r.note_id) ?? []), r.file]);
  return map;
}

/** Makes the note's photo set match `files`: adds new ones, removes (and deletes) dropped ones. */
export async function syncPhotos(db: SQLiteDatabase, noteId: number, files: string[]): Promise<void> {
  const current = await listPhotos(db, noteId);
  for (const p of current) {
    if (!files.includes(p.file)) {
      await db.runAsync('DELETE FROM photos WHERE id = ?', p.id);
      deletePhotoFile(p.file);
    }
  }
  for (const file of files) {
    if (!current.some((p) => p.file === file)) {
      await db.runAsync('INSERT INTO photos(note_id, file, created_at) VALUES (?, ?, ?)', noteId, file, Date.now());
    }
  }
}

export function deletePhotoFile(file: string) {
  try {
    const f = new File(photosDir(), file);
    if (f.exists) f.delete();
  } catch {
    // already gone
  }
}

export async function deleteNotePhotos(db: SQLiteDatabase, noteId: number): Promise<void> {
  for (const p of await listPhotos(db, noteId)) deletePhotoFile(p.file);
}

let running = false;

/** The AI looks at each new photo once and writes a caption, which becomes searchable. */
export async function captionPending(db: SQLiteDatabase): Promise<number> {
  if (running) return 0;
  const ai = await getBackgroundConfig(db);
  if (!ai) return 0;
  running = true;
  let done = 0;
  try {
    const rows = await db.getAllAsync<Photo>('SELECT * FROM photos WHERE caption IS NULL LIMIT 10');
    for (const p of rows) {
      try {
        const file = new File(photosDir(), p.file);
        if (!file.exists) {
          await db.runAsync('DELETE FROM photos WHERE id = ?', p.id);
          continue;
        }
        const caption = await ai.adapter.describeImage(
          ai.apiKey,
          ai.model,
          await file.base64(),
          'image/jpeg',
          'Describe this photo from someone\'s personal journal in one or two plain sentences: ' +
            'who or what is in it, where, what is happening. No preamble.',
        );
        await db.runAsync('UPDATE photos SET caption = ? WHERE id = ?', caption.trim(), p.id);
        await rechunk(db, p.note_id);
        done++;
      } catch (e) {
        console.warn('caption failed', e);
        break;
      }
    }
  } finally {
    running = false;
  }
  if (done) indexPending(db).catch(() => {});
  return done;
}
