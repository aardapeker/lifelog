import type { SQLiteDatabase } from 'expo-sqlite';
import { getSetting } from './db';
import { formatDate, recentNotes, type Note } from './notes';
import { hybridSearch } from './search';

const MAX_NOTE_CHARS = 1500;

function renderNotes(notes: Note[]): string {
  return notes
    .map((n) => {
      const body = n.body.length > MAX_NOTE_CHARS ? `${n.body.slice(0, MAX_NOTE_CHARS)}…` : n.body;
      return `[${formatDate(n.created_at)}]\n${body}`;
    })
    .join('\n\n---\n\n');
}

/**
 * The "brain" of the friend: profile + last 2 weeks + whatever the
 * hybrid search finds for the current message.
 */
export async function buildSystemPrompt(db: SQLiteDatabase, userMessage: string): Promise<string> {
  const [profile, recent, related] = await Promise.all([
    getSetting(db, 'profile'),
    recentNotes(db, 14, 20),
    hybridSearch(db, userMessage, 8),
  ]);

  const recentIds = new Set(recent.map((n) => n.id));
  const olderRelated = related.filter((n) => !recentIds.has(n.id));

  const parts = [
    `You are the user's close friend who lives inside their personal journal app.
You have read their journal. Talk casually and warmly, like a real friend: short messages,
humor and light teasing are welcome, no corporate tone, no bullet-point lectures unless asked.
Reply in the language the user writes in.
Use what you know from the journal naturally ("didn't you say last week...") but never invent
memories: if something isn't in the notes below, say you don't know or ask.
Current time: ${formatDate(Date.now())}.`,
  ];

  if (profile.trim()) parts.push(`## About the user (written by them)\n${profile.trim()}`);
  if (recent.length) parts.push(`## Journal — last 14 days (newest first)\n${renderNotes(recent)}`);
  if (olderRelated.length)
    parts.push(`## Older journal entries related to the current message\n${renderNotes(olderRelated)}`);
  if (!recent.length && !olderRelated.length)
    parts.push('The journal is still empty. Be curious and get to know them.');

  return parts.join('\n\n');
}
