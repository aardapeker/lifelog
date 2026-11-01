import type { SQLiteDatabase } from 'expo-sqlite';
import { getBackgroundConfig, parseJsonReply } from './chat';
import { formatDate } from './notes';

export type Fact = {
  id: number;
  note_id: number | null;
  kind: string;
  subject: string | null;
  text: string;
  created_at: number;
};

const KINDS = ['person', 'pet', 'place', 'goal', 'plan', 'habit', 'preference', 'event', 'feeling'];

export function listFacts(db: SQLiteDatabase, limit = 200): Promise<Fact[]> {
  return db.getAllAsync<Fact>('SELECT * FROM facts ORDER BY created_at DESC LIMIT ?', limit);
}

export async function deleteFact(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM facts WHERE id = ?', id);
}

type Analysis = {
  mood?: { score?: number; label?: string };
  facts?: { kind?: string; subject?: string | null; text?: string }[];
  goals?: number[];
  ideas?: string[];
};

const SYSTEM = (goals: string) =>
  `You read one entry from someone's personal journal and return JSON with four things:
1. "mood": {"score": 1-5, "label": one lowercase word}. 1 = awful, 3 = neutral, 5 = great.
2. "facts": durable facts about the writer worth remembering in a month: people in their life, pets, places,
   goals, plans, habits, preferences, notable events, recurring feelings. Each: {"kind", "subject", "text"}.
   kind is one of ${KINDS.join(', ')}. subject is the name of the person, pet or place the fact is about
   (exactly as the writer names them, e.g. "Şemistan", "Mustafa", "Gebze"), or null.
   text is one short third-person sentence ("Has a cat called Şemistan"). Skip trivia.
3. "goals": ids of the writer's goals this entry is clearly about (from the list below), or [].
4. "ideas": ideas for videos, tutorials or other content the writer mentions wanting to make, each a short phrase, or [].
Write facts and ideas in the language of the entry.
The writer's goals: ${goals || '(none yet)'}`;

let running = false;

/**
 * Reads each entry it hasn't analyzed yet, once: mood, facts (with who they're about),
 * which goals it touches, and video ideas. Runs in the background after saving and on app open.
 */
export async function learnFacts(db: SQLiteDatabase): Promise<number> {
  if (running) return 0;
  const ai = await getBackgroundConfig(db);
  if (!ai) return 0;
  running = true;
  let analyzed = 0;
  try {
    const goals = await db.getAllAsync<{ id: number; title: string }>('SELECT id, title FROM goals WHERE done = 0');
    const goalList = goals.map((g) => `${g.id}: ${g.title}`).join('; ');
    const notes = await db.getAllAsync<{ id: number; body: string; created_at: number }>(
      "SELECT id, body, created_at FROM notes WHERE facts_status != 'done' ORDER BY created_at DESC LIMIT 8",
    );
    for (const note of notes) {
      try {
        const reply = await ai.adapter.complete({
          apiKey: ai.apiKey,
          model: ai.model,
          json: true,
          system: SYSTEM(goalList),
          prompt: `Entry written ${formatDate(note.created_at)}:\n\n${note.body || '(only photos)'}`,
        });
        await saveAnalysis(db, note, parseJsonReply<Analysis>(reply), new Set(goals.map((g) => g.id)));
        analyzed++;
      } catch (e) {
        console.warn('entry analysis failed', e);
        break; // offline or quota: try again next time
      }
    }
  } finally {
    running = false;
  }
  return analyzed;
}

async function saveAnalysis(
  db: SQLiteDatabase,
  note: { id: number; created_at: number },
  a: Analysis,
  goalIds: Set<number>,
): Promise<void> {
  const score = Math.round(Number(a.mood?.score));
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "UPDATE notes SET mood = ?, mood_label = ?, facts_status = 'done' WHERE id = ?",
      score >= 1 && score <= 5 ? score : null,
      a.mood?.label?.trim().toLowerCase().slice(0, 30) || null,
      note.id,
    );

    await db.runAsync('DELETE FROM facts WHERE note_id = ?', note.id);
    for (const f of a.facts ?? []) {
      if (!f.text?.trim()) continue;
      await db.runAsync(
        'INSERT INTO facts(note_id, kind, subject, text, created_at) VALUES (?, ?, ?, ?, ?)',
        note.id,
        KINDS.includes(f.kind ?? '') ? f.kind! : 'event',
        f.subject?.trim() || null,
        f.text.trim(),
        note.created_at,
      );
    }

    await db.runAsync('DELETE FROM note_goals WHERE note_id = ?', note.id);
    for (const id of a.goals ?? []) {
      if (goalIds.has(Number(id))) {
        await db.runAsync('INSERT OR IGNORE INTO note_goals(note_id, goal_id) VALUES (?, ?)', note.id, Number(id));
      }
    }

    // keep ideas you already ticked off; replace the open ones from this entry
    await db.runAsync('DELETE FROM ideas WHERE note_id = ? AND done = 0', note.id);
    const done = new Set(
      (await db.getAllAsync<{ text: string }>('SELECT text FROM ideas WHERE note_id = ?', note.id)).map((r) =>
        r.text.toLowerCase(),
      ),
    );
    for (const idea of a.ideas ?? []) {
      const text = idea?.trim();
      if (text && !done.has(text.toLowerCase())) {
        await db.runAsync('INSERT INTO ideas(note_id, text, created_at) VALUES (?, ?, ?)', note.id, text, note.created_at);
      }
    }
  });
}
