import type { SQLiteDatabase } from 'expo-sqlite';
import { getBackgroundConfig, parseJsonReply } from './chat';
import { formatDate } from './notes';

export type Fact = { id: number; note_id: number | null; kind: string; text: string; created_at: number };

const KINDS = ['person', 'place', 'goal', 'plan', 'habit', 'preference', 'event', 'feeling'];

export function listFacts(db: SQLiteDatabase, limit = 200): Promise<Fact[]> {
  return db.getAllAsync<Fact>('SELECT * FROM facts ORDER BY created_at DESC LIMIT ?', limit);
}

export async function deleteFact(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM facts WHERE id = ?', id);
}

let running = false;

/**
 * Reads entries it hasn't learned from yet and pulls out durable facts
 * (people, goals, plans…). Runs in the background after saving and on app open.
 */
export async function learnFacts(db: SQLiteDatabase): Promise<number> {
  if (running) return 0;
  const ai = await getBackgroundConfig(db);
  if (!ai) return 0;
  running = true;
  let learned = 0;
  try {
    const notes = await db.getAllAsync<{ id: number; body: string; created_at: number }>(
      "SELECT id, body, created_at FROM notes WHERE facts_status != 'done' ORDER BY created_at LIMIT 5",
    );
    for (const note of notes) {
      try {
        const reply = await ai.adapter.complete({
          apiKey: ai.apiKey,
          model: ai.model,
          json: true,
          system:
            'You read one journal entry and extract durable facts about the writer: people in their life, ' +
            'places, goals, plans, habits, preferences, notable events, recurring feelings. ' +
            'Each fact is one short sentence in third person ("Has a cat called Şemistan"). ' +
            'Skip trivia that will not matter in a month. Return {"facts":[{"kind":"…","text":"…"}]}; ' +
            `kind is one of ${KINDS.join(', ')}. Return {"facts":[]} if nothing durable.`,
          prompt: `Entry written ${formatDate(note.created_at)}:\n\n${note.body}`,
        });
        const { facts } = parseJsonReply<{ facts?: { kind?: string; text?: string }[] }>(reply);
        await db.withTransactionAsync(async () => {
          await db.runAsync('DELETE FROM facts WHERE note_id = ?', note.id);
          for (const f of facts ?? []) {
            if (!f.text?.trim()) continue;
            const kind = KINDS.includes(f.kind ?? '') ? f.kind! : 'event';
            await db.runAsync(
              'INSERT INTO facts(note_id, kind, text, created_at) VALUES (?, ?, ?, ?)',
              note.id,
              kind,
              f.text.trim(),
              note.created_at,
            );
            learned++;
          }
          await db.runAsync("UPDATE notes SET facts_status = 'done' WHERE id = ?", note.id);
        });
      } catch (e) {
        console.warn('fact extraction failed', e);
        break; // offline or quota: try again next time
      }
    }
  } finally {
    running = false;
  }
  return learned;
}
