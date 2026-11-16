import { milestonesForContext } from './milestones';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { Tool } from './chat';
import { getSetting } from './db';
import { listFacts } from './facts';
import { formatDate, recentNotes, type Note } from './notes';
import { musicTaste, spotifyConnected } from './spotify';
import { hybridSearch } from './search';

const MAX_NOTE_CHARS = 1500;
const RECENT_DAYS = 14;

export function renderNotes(notes: Note[]): string {
  return notes
    .map((n) => {
      const body = n.body.length > MAX_NOTE_CHARS ? `${n.body.slice(0, MAX_NOTE_CHARS)}…` : n.body;
      return `[${formatDate(n.created_at)}]\n${body}`;
    })
    .join('\n\n---\n\n');
}

/** What the friend always knows: their name, the profile, learned facts. */
export async function aboutUser(db: SQLiteDatabase): Promise<string> {
  const [name, profile, facts, milestones] = await Promise.all([
    getSetting(db, 'name'),
    getSetting(db, 'profile'),
    listFacts(db, 80),
    milestonesForContext(db).catch(() => ''),
  ]);
  const parts: string[] = [];
  if (name.trim()) parts.push(`Their name is ${name.trim()}.`);
  if (profile.trim()) parts.push(`## About them (written by them)\n${profile.trim()}`);
  if (facts.length) parts.push(`## Things you've learned from their journal\n${facts.map((f) => `- ${f.text}`).join('\n')}`);
  if (milestones) parts.push(milestones); // their life story, and today's anniversaries
  return parts.join('\n\n');
}

/** Lets the model look further back than the last two weeks, only when it needs to. */
export function searchTool(db: SQLiteDatabase): Tool {
  return {
    name: 'search_notes',
    description:
      'Search the whole journal by meaning and keywords. Use it whenever the user asks about something ' +
      `older than the last ${RECENT_DAYS} days, or something not in the entries you can already see.`,
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'What to look for, in a few words.' } },
      required: ['query'],
    },
    run: async (args) => {
      const notes = await hybridSearch(db, String(args.query ?? ''), 8);
      return notes.length ? renderNotes(notes) : 'No matching entries.';
    },
  };
}

/**
 * The friend talks like a real friend: now and then a moment from their day reminds it of a famous scene
 * or meme ("this is literally the Ramiz Dayı scene"). Used by the chat and the friend's automatic
 * messages (check-ins, the messages it plans ahead, things it looked up); not the letter, Reads or the radio.
 */
export const REFERENCES =
  'Like a real friend, now and then you may connect what happened to them with a scene, character or meme from a ' +
  'film, series, song or the internet: anything well known, it does NOT have to be something they mentioned. Rules: ' +
  '(1) The scene must share something REAL with their moment: the same situation, the same feeling, the same object or ' +
  'word a famous viral moment is about (they ate biscuits → a well-known viral clip about biscuits), or a clear funny ' +
  'contrast you can explain. Before using one, ask yourself what exactly the two have in common; if the honest answer ' +
  'is "nothing, it is just famous", drop it. (2) They may not have seen it: say it the way a friend introduces something ' +
  '("there is a scene in X where… that is you today"), so it works even if they never watched it, and they can go find ' +
  'it. If it is something they told you they love, just make the joke. (3) Rarely: most messages have none. ' +
  '(4) Viral moments of politicians or public figures are fine as harmless memes (a funny word, a famous blooper), ' +
  'never as a political opinion or a dig at their side. (5) Never invent scenes, never quote song lyrics or long dialogue (a famous short catchphrase is fine). ' +
  'A missing reference is always better than a forced one.';

/** The friend's system prompt: who you are + the last two weeks. Older stuff comes via search_notes. */
export async function buildSystemPrompt(db: SQLiteDatabase): Promise<string> {
  const [about, recent] = await Promise.all([aboutUser(db), recentNotes(db, RECENT_DAYS, 20)]);

  const parts = [
    `You are the user's close friend who lives inside their personal journal app.
You have read their journal. Talk casually and warmly, like a real friend: short messages,
humor and light teasing are welcome, no corporate tone, no bullet-point lectures unless asked.
Reply in the language the user writes in.
Use what you know naturally ("didn't you say last week...") but never invent memories.
${REFERENCES}
For anything older than the entries below, call search_notes before answering.
If it's still not there, say you don't know or ask.
Current time: ${formatDate(Date.now())}.`,
  ];
  if (about) parts.push(about);
  if (await spotifyConnected()) {
    const taste = await musicTaste(db);
    parts.push(
      `## Music
They use Spotify Premium and you can play songs for them. When music would fit (their mood, a long shift,
they ask), suggest a few songs: call find_songs, then copy each returned lifelog://play link exactly, on its
own line under the song's name. Don't push music into every message.` +
        (taste.length ? `\nTheir top artists lately: ${taste.join(', ')}.` : ''),
    );
  }
  parts.push(
    recent.length
      ? `## Journal, last ${RECENT_DAYS} days (newest first)\n${renderNotes(recent)}`
      : 'There are no entries from the last two weeks. Be curious and get to know them.',
  );
  return parts.join('\n\n');
}
