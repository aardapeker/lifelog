import type { SQLiteDatabase } from 'expo-sqlite';
import { tooManyTries } from './db';
import { getBackgroundConfig, parseJsonReply } from './chat';
import { getAutonomySettings, isNeverResearch } from './autonomySettings';
import { formatDate } from './notes';
import { MILESTONE_RULE, suggestMilestone, type FoundMilestone } from './milestones';

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
  research?: { topic?: string; query?: string; why?: string }[];
  milestone?: FoundMilestone | null;
};

const SYSTEM = (goals: string, never: string) =>
  `You read one entry from someone's personal journal and return JSON with six things:
1. "mood": {"score": 1-5, "label": one lowercase word}. 1 = awful, 3 = neutral, 5 = great.
2. "facts": durable facts about the writer worth remembering in a month: people in their life, pets, places,
   goals, plans, habits, preferences, notable events, recurring feelings. Each: {"kind", "subject", "text"}.
   kind is one of ${KINDS.join(', ')}. subject is the name of the person, pet or place the fact is about
   (exactly as the writer names them, e.g. "Şemistan", "Mustafa", "Gebze"), or null.
   text is one short third-person sentence ("Has a cat called Şemistan"). Skip trivia.
3. "goals": ids of the writer's goals this entry is clearly about (from the list below), or [].
4. "ideas": ideas for videos, tutorials or other content the writer mentions wanting to make, each a short phrase, or [].
5. "research": things a good friend would quietly look up for them on the web, at most 2: something they want to buy,
   a plan or trip, a question they wondered about, a problem they're stuck on, an event or place they mentioned.
   Each: {"topic": "short title", "query": "a web search query", "why": "what they wrote that made it worth it"}.
   Only when the web would really help; usually []. Never research private details about other people.
   Never research these topics: ${never || '(nothing excluded)'}.
6. ${MILESTONE_RULE}
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
    const never = (await getAutonomySettings(db)).never;
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
          system: SYSTEM(goalList, never.join(', ')),
          prompt: `Entry written ${formatDate(note.created_at)}:\n\n${note.body || '(only photos)'}`,
        });
        const analysis = parseJsonReply<Analysis>(reply);
        await saveAnalysis(db, note, analysis, new Set(goals.map((g) => g.id)), never);
        // a life event: suggested on the Journal page, saved only when you say so
        if (analysis.milestone) await suggestMilestone(db, analysis.milestone, note.id, note.created_at).catch(() => {});
        analyzed++;
      } catch (e) {
        console.warn('entry analysis failed', e);
        // an entry that keeps failing is marked done without facts, not re-sent on every app open
        if (await tooManyTries(db, `facts.${note.id}`, e)) await db.runAsync("UPDATE notes SET facts_status = 'done' WHERE id = ?", note.id);
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
  never: string[],
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
    // only fresh entries get researched: editing an old one shouldn't send the friend searching
    if (Date.now() - note.created_at < 3 * 86_400_000) {
      for (const r of (a.research ?? []).slice(0, 2)) {
        const topic = r.topic?.trim();
        const query = r.query?.trim();
        if (!topic || !query || isNeverResearch(`${topic} ${query}`, never)) continue;
        const seen = await db.getFirstAsync(
          'SELECT id FROM research WHERE lower(query) = lower(?) AND created_at > ?',
          query,
          Date.now() - 30 * 86_400_000,
        );
        if (seen) continue;
        await db.runAsync(
          'INSERT INTO research(note_id, topic, query, why, created_at) VALUES (?, ?, ?, ?, ?)',
          note.id,
          topic,
          query,
          r.why?.trim() || null,
          Date.now(),
        );
      }
    }

    for (const idea of a.ideas ?? []) {
      const text = idea?.trim();
      if (text && !done.has(text.toLowerCase())) {
        await db.runAsync('INSERT INTO ideas(note_id, text, created_at) VALUES (?, ?, ?)', note.id, text, note.created_at);
      }
    }
  });
}
