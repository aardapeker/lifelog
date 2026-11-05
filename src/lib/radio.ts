import type { SQLiteDatabase } from 'expo-sqlite';
import { getChatConfig, parseJsonReply, PROVIDERS } from './chat';
import { getCheckinSettings, shiftFor } from './checkins';
import { aboutUser, renderNotes } from './context';
import { getSetting } from './db';
import { formatDate, recentNotes } from './notes';
import { findTrack, musicTaste, type Track } from './spotify';
import type { Persona, Station } from './stations';
import type { SpokenLine } from './tts';

/*
 * Lifelog Radio: a station's host (and sidekick) run a show just for you. Songs are real
 * (Spotify plays them); before each one the hosts talk, and every few songs there's a
 * fake commercial or a news bulletin made from your own life. Voices: Gemini TTS.
 */

export type Slot = { track: Track; talk: SpokenLine[]; label: string | null };
export type Show = { title: string; lang: string; station: Station; slots: Slot[] };

/** Quick ideas for the "anything else?" box. */
export const WISHES = ['On the way to work', 'After the shift', 'Focus', 'Rainy day', 'Make me laugh'];

const SHOW_LENGTH = 8;

const persona = (p: Persona, role: string) => `- ${p.name} (${role}): ${p.bio}`;

export async function buildShow(db: SQLiteDatabase, station: Station, wish: string): Promise<Show> {
  const chat = await getChatConfig(db);
  if (!chat.apiKey) throw new Error('Add an AI key in Settings first.');
  const [about, recent, taste, shifts, city] = await Promise.all([
    aboutUser(db),
    recentNotes(db, 7, 8),
    musicTaste(db),
    getCheckinSettings(db),
    getSetting(db, 'planner').then((p) => {
      try {
        return (JSON.parse(p) as { city?: string }).city ?? '';
      } catch {
        return '';
      }
    }),
  ]);
  const duo = !!station.sidekick;
  const names = duo ? `"${station.host.name}" or "${station.sidekick!.name}"` : `"${station.host.name}"`;

  const reply = await PROVIDERS[chat.provider].complete({
    apiKey: chat.apiKey,
    model: chat.model,
    json: true,
    maxTokens: 5000,
    system:
      `You write a private radio show on "${station.name} ${station.freq}" (${station.tagline}) for ONE listener, ` +
      `in the spirit of the radio stations in classic open-world crime games: larger-than-life hosts, absurd humour, ` +
      `fake commercials. All characters are original.\n\n` +
      `Hosts:\n${persona(station.host, 'host')}\n${duo ? persona(station.sidekick!, 'sidekick, the comedian') : ''}\n\n` +
      `Music: ${station.music}. Pick ${SHOW_LENGTH} REAL songs that exist on Spotify, in an order that flows. ` +
      (station.key === 'friend' ? 'Use their taste and their day. ' : 'Stay true to the station\'s style. ') +
      `\n\nBefore every song the hosts talk${duo ? ' as a quick back-and-forth (2 to 5 lines; the sidekick gets the punchlines)' : ' (1 to 3 sentences)'}. ` +
      'The first talk opens the show with a station ID. Make it about THIS listener: callbacks to what they wrote, ' +
      'their shift, their cat, their plans. Teasing is welcome, cruelty is not. ' +
      (station.ads.startsWith('none')
        ? ''
        : `Before songs 3 and 6, instead of a normal intro, do a break: one fake commercial (${station.ads}) or a short ` +
          'news bulletin (their weather, their week, their goals, read like breaking news), then lead into the song. ') +
      'Lines are SPOKEN aloud by a voice engine: no emojis, no markdown, no stage directions in brackets, natural speech, ' +
      'short sentences. You may put <laugh> or <short pause> inside a line. Use the language of their journal.\n\n' +
      `Return {"title":"show name","lang":"tr or en","songs":[{"title":"…","artist":"…","label":null or "Commercial" or "News",` +
      `"talk":[{"who":${names},"text":"…"}]}]} with ${SHOW_LENGTH} songs.\n\n` +
      about,
    prompt:
      `Now: ${formatDate(Date.now())}, ${shiftFor(shifts, Date.now())} shift week${city ? `, in ${city}` : ''}.\n` +
      (wish.trim() ? `The listener asked for: ${wish.trim()}\n` : '') +
      (taste.length ? `Their top artists lately: ${taste.join(', ')}\n` : '') +
      `\nRecent journal:\n${renderNotes(recent) || '(nothing yet)'}`,
  });
  const plan = parseJsonReply<{
    title?: string;
    lang?: string;
    songs?: { title: string; artist: string; label?: string | null; talk?: { who?: string; text?: string }[] }[];
  }>(reply);

  const cast = [station.host.name, station.sidekick?.name].filter(Boolean) as string[];
  const slots: Slot[] = [];
  for (const s of plan.songs ?? []) {
    const track = await findTrack(s.title, s.artist).catch(() => null);
    if (!track || slots.some((x) => x.track.id === track.id)) continue;
    const talk = (s.talk ?? [])
      .filter((l) => l.text?.trim())
      .map((l) => ({ speaker: cast.includes(l.who ?? '') ? l.who! : cast[0], text: l.text!.trim() }));
    slots.push({ track, talk, label: s.label === 'Commercial' || s.label === 'News' ? s.label : null });
  }
  if (!slots.length) throw new Error("Couldn't find those songs on Spotify. Try again?");
  return {
    title: plan.title?.trim() || station.name,
    lang: plan.lang?.toLowerCase().startsWith('tr') ? 'tr-TR' : 'en-US',
    station,
    slots,
  };
}

/** The voices a show needs, for the speech engine. */
export const castOf = (station: Station) =>
  [station.host, station.sidekick].filter((p): p is Persona => !!p).map((p) => ({ name: p.name, voice: p.voice, style: p.style }));
