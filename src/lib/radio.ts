import type { SQLiteDatabase } from 'expo-sqlite';
import { getChatConfig, parseJsonReply, PROVIDERS } from './chat';
import { getCheckinSettings, shiftFor } from './checkins';
import { aboutUser, renderNotes } from './context';
import { formatDate, recentNotes } from './notes';
import { findTrack, musicTaste, type Track } from './spotify';

/*
 * Lifelog Radio: the friend hosts a little radio show just for you. It picks a set of songs
 * that fits your day and your taste, and before each one it says a line or two about why,
 * out loud (Android's text-to-speech), like a radio host. Spotify plays the songs.
 */

export type Slot = { track: Track; intro: string };
export type Show = { title: string; lang: string; slots: Slot[] };

export const VIBES = [
  { key: 'commute', label: 'On the way to work' },
  { key: 'after', label: 'After the shift' },
  { key: 'focus', label: 'Focus' },
  { key: 'chill', label: 'Chill' },
  { key: 'surprise', label: 'Surprise me' },
] as const;
export type Vibe = (typeof VIBES)[number]['key'];

const SHOW_LENGTH = 8;

export async function buildShow(db: SQLiteDatabase, vibe: Vibe, wish: string): Promise<Show> {
  const chat = await getChatConfig(db);
  if (!chat.apiKey) throw new Error('Add an AI key in Settings first.');
  const [about, recent, taste, shifts] = await Promise.all([
    aboutUser(db),
    recentNotes(db, 7, 8),
    musicTaste(db),
    getCheckinSettings(db),
  ]);
  const vibeLabel = VIBES.find((v) => v.key === vibe)?.label ?? vibe;

  const reply = await PROVIDERS[chat.provider].complete({
    apiKey: chat.apiKey,
    model: chat.model,
    json: true,
    maxTokens: 2500,
    system:
      "You are the user's close friend, hosting a private radio show just for them. Pick songs that fit their day, " +
      'mood and taste, in an order that flows (build up, then land softly). Real, well-known enough to be on Spotify. ' +
      'Mix their favourite artists with a few new ones they would probably love. ' +
      'Before each song you say one or two sentences, out loud, like a warm and funny radio host: why this one, for ' +
      'them, today (a callback to what they wrote is gold). The first intro opens the show. These are SPOKEN: no emojis, ' +
      'no markdown, no song lists, natural speech. Same language as their journal. ' +
      `Return {"title":"show name","lang":"tr or en","songs":[{"title":"…","artist":"…","intro":"…"}]} with ${SHOW_LENGTH} songs.\n\n` +
      about,
    prompt:
      `Now: ${formatDate(Date.now())}, ${shiftFor(shifts, Date.now())} shift week.\n` +
      `Vibe: ${vibeLabel}${wish.trim() ? `. They added: ${wish.trim()}` : ''}\n` +
      (taste.length ? `Their top artists lately: ${taste.join(', ')}\n` : '') +
      `\nRecent journal:\n${renderNotes(recent) || '(nothing yet)'}`,
  });
  const plan = parseJsonReply<{ title?: string; lang?: string; songs?: { title: string; artist: string; intro: string }[] }>(reply);

  const slots: Slot[] = [];
  for (const s of plan.songs ?? []) {
    const track = await findTrack(s.title, s.artist).catch(() => null);
    if (track && !slots.some((x) => x.track.id === track.id)) slots.push({ track, intro: s.intro?.trim() ?? '' });
  }
  if (!slots.length) throw new Error("Couldn't find those songs on Spotify. Try again?");
  return { title: plan.title?.trim() || 'Lifelog Radio', lang: plan.lang?.toLowerCase().startsWith('tr') ? 'tr-TR' : 'en-US', slots };
}
