import type { SQLiteDatabase } from 'expo-sqlite';

export const DB_NAME = 'lifelog.db';

// Each entry runs once, in order. Never edit an old migration — append a new one.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    body       TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- Keyword index. remove_diacritics lets "semistan" find "Şemistan".
  CREATE VIRTUAL TABLE notes_fts USING fts5(
    body,
    content='notes',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
  );
  CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts(rowid, body) VALUES (new.id, new.body);
  END;
  CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, body) VALUES ('delete', old.id, old.body);
  END;
  CREATE TRIGGER notes_au AFTER UPDATE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, body) VALUES ('delete', old.id, old.body);
    INSERT INTO notes_fts(rowid, body) VALUES (new.id, new.body);
  END;

  -- Meaning index. One row per chunk of a note.
  CREATE TABLE chunks (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    text    TEXT    NOT NULL,
    model   TEXT,
    dims    INTEGER,
    vector  BLOB,                       -- normalized float32
    status  TEXT    NOT NULL DEFAULT 'pending'  -- pending | done | failed
  );
  CREATE INDEX chunks_note_idx ON chunks(note_id);
  CREATE INDEX chunks_status_idx ON chunks(status);

  CREATE TABLE messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    role       TEXT    NOT NULL,        -- user | assistant
    content    TEXT    NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE kv (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  // v2: photos, learned facts, weekly recaps, scheduled check-ins
  `
  CREATE TABLE photos (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id    INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    file       TEXT    NOT NULL,        -- file name inside the app's photos folder
    caption    TEXT,                    -- written by the AI, searchable
    created_at INTEGER NOT NULL
  );
  CREATE INDEX photos_note_idx ON photos(note_id);

  CREATE TABLE facts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id    INTEGER REFERENCES notes(id) ON DELETE CASCADE,
    kind       TEXT    NOT NULL,        -- person | place | goal | plan | habit | preference | event | feeling
    text       TEXT    NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX facts_note_idx ON facts(note_id);
  ALTER TABLE notes ADD COLUMN facts_status TEXT NOT NULL DEFAULT 'pending';

  CREATE TABLE recaps (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    week_start INTEGER NOT NULL UNIQUE, -- Monday 00:00, local time
    body       TEXT    NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE checkins (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    fire_at         INTEGER NOT NULL UNIQUE,
    body            TEXT    NOT NULL,
    notification_id TEXT,
    delivered       INTEGER NOT NULL DEFAULT 0
  );
  `,
  // v3: mood, who a fact is about, goals, video ideas. Every entry gets re-read once.
  `
  ALTER TABLE notes ADD COLUMN mood INTEGER;          -- 1 (awful) … 5 (great)
  ALTER TABLE notes ADD COLUMN mood_label TEXT;       -- one word, e.g. "tired"
  ALTER TABLE facts ADD COLUMN subject TEXT;          -- person / pet / place the fact is about
  CREATE INDEX facts_subject_idx ON facts(subject);

  CREATE TABLE goals (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    done       INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE note_goals (
    note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, goal_id)
  );

  CREATE TABLE ideas (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id    INTEGER REFERENCES notes(id) ON DELETE SET NULL,
    text       TEXT    NOT NULL,
    done       INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  UPDATE notes SET facts_status = 'pending';
  `,
  // v4: AI day plans for days off
  `
  CREATE TABLE plans (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    day        INTEGER NOT NULL UNIQUE,  -- local midnight of the planned day
    body       TEXT    NOT NULL,         -- JSON: weather, intro, items (with done flags), sources
    created_at INTEGER NOT NULL
  );
  `,
  // v5: things the friend decided to look up for you, and an outbox kind (check-in vs daily digest)
  `
  CREATE TABLE research (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id    INTEGER REFERENCES notes(id) ON DELETE SET NULL,
    topic      TEXT    NOT NULL,         -- shown to you, e.g. "2027 Honda PCX release"
    query      TEXT    NOT NULL,         -- what gets searched
    why        TEXT,                     -- what in the entry made it worth looking up
    status     TEXT    NOT NULL DEFAULT 'pending',  -- pending | done | failed | skipped
    result     TEXT,                     -- short summary in the friend's voice
    sources    TEXT,                     -- JSON [{title, uri}]
    digested   INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    done_at    INTEGER
  );
  CREATE INDEX research_status_idx ON research(status);
  ALTER TABLE checkins ADD COLUMN kind TEXT NOT NULL DEFAULT 'checkin';
  `,
];

export async function migrate(db: SQLiteDatabase): Promise<void> {
  // busy_timeout: the background task and the open app may both use the database at once
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    const next = version + 1;
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
      await db.execAsync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
}

// --- tiny key/value store for non-secret settings (profile, model names) ---

export async function getSetting(db: SQLiteDatabase, key: string, fallback = ''): Promise<string> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
  return row?.value ?? fallback;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO kv(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}
