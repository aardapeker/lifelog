import type { SQLiteDatabase } from 'expo-sqlite';
import { getChatConfig, getRadioModel, parseJsonReply, PROVIDERS } from './chat';
import { getCheckinSettings, shiftFor } from './checkins';
import { aboutUser, renderNotes } from './context';
import { getSetting } from './db';
import { formatDate, noteSong, recentNotes } from './notes';
import { bannedSongs, FAVOURITES_PER_SHOW, getRadioPrefs, likedSongs, playedSongs, playsThisMonth, songLine } from './songMemory';
import { findTrack, musicTaste, spotifyLikedSongs, type Track } from './spotify';
import type { Persona, Station } from './stations';
import type { SpokenLine } from './tts';

/*
 * Lifelog Radio: a station's host (and sidekick) run a show just for you. Songs are real
 * (Spotify plays them); before each one the hosts talk, and every few songs there's a
 * fake commercial or a news bulletin made from your own life. Voices: Gemini TTS.
 */

/** overlap: seconds the talk before this song may run over the END of the previous one (0 = wait for it). */
export type Slot = { track: Track; talk: SpokenLine[]; label: string | null; overlap: number };
/** outro: the goodbye after the last song. */
export type Show = { title: string; lang: string; station: Station; slots: Slot[]; outro: SpokenLine[] };

/** Quick ideas for the "anything else?" box. */
export const WISHES = ['On the way to work', 'After the shift', 'Focus', 'Rainy day', 'Make me laugh'];

/**
 * Draws the favourites for one show. Every list a song is on is one more ticket in the bag (in your
 * journal + Spotify Liked + hearted here = 3 tickets), and every play in the last 30 days halves its
 * chances, so a song you love comes back often but can't take over every show.
 */
export function drawFavourites<T extends { id: string }>(
  lists: T[][],
  plays: Map<string, number>,
  count: number,
  allowed: (t: T) => boolean,
): T[] {
  const tickets = new Map<string, { song: T; weight: number }>();
  for (const list of lists) {
    const seen = new Set<string>(); // one ticket per list, even if a list repeats a song
    for (const song of list) {
      if (seen.has(song.id) || !allowed(song)) continue;
      seen.add(song.id);
      const t = tickets.get(song.id) ?? { song, weight: 0 };
      t.weight++;
      tickets.set(song.id, t);
    }
  }
  // weighted draw without repeats: each song gets random^(1/weight), the highest keys win
  return [...tickets.values()]
    .map((t) => ({ song: t.song, key: Math.random() ** (1 / (t.weight / 2 ** (plays.get(t.song.id) ?? 0))) }))
    .sort((a, b) => b.key - a.key)
    .slice(0, count)
    .map((x) => x.song);
}

/** A favourite among the last this-many played songs (about 3 or 4 shows) waits for a later show. */
const REST = 40;

/** How many songs a show can have (the Radio screen offers these). */
export const SHOW_LENGTHS = [5, 8, 12, 16] as const;

/** One random flavour per show, so the same station never plays the same set twice. */
const TWISTS = [
  'mostly from one specific year of the era, your pick',
  'female vocalists lead the way',
  'one-hit wonders and forgotten gems',
  'songs about the night, cities or driving',
  'B-sides and album tracks only, plus one hit',
  'artists from different countries',
  'covers and reinterpretations',
  'a slow build: start soft, end loud',
  'songs with great opening seconds',
  'duets and collaborations',
  'the underdog bands of the genre',
  'songs that were bigger outside the US and UK',
];

const LANGUAGE: Record<Station['lang'], string> = {
  auto: 'Speak the language of their journal.',
  en: 'Speak English only (simple, natural, fun; the listener is learning English), and lean towards English-language songs.',
  tr: 'Sadece Türkçe konuş (doğal, samimi İstanbul Türkçesi). Speak Turkish only, and lean towards Turkish songs.',
};

/** How much the hosts say before each song (Settings → Radio). */
const TALK = {
  short: { duo: '1 to 3 quick lines', solo: '1 or 2 sentences', tokens: 450 },
  normal: { duo: '2 to 5 lines', solo: '1 to 3 sentences', tokens: 600 },
  long: { duo: '5 to 8 lines, a real little scene with a story or a running bit', solo: '3 to 5 sentences, a proper monologue', tokens: 900 },
} as const;

/** Lowercase, no accents or Turkish letters, no punctuation: for comparing artist names. */
const plain = (s: string) =>
  s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Did Spotify find the artist the hosts talk about? ("Sena Şener - Cambaz" finding mor ve ötesi = no) */
export function sameArtist(asked: string, found: string): boolean {
  const a = plain(asked);
  const f = plain(found);
  if (!a || !f) return true;
  if (a.includes(f) || f.includes(a)) return true;
  const words = (s: string) => s.split(' ').filter((w) => w.length >= 4 && !['band', 'feat', 'with', 'orchestra'].includes(w));
  return words(a).some((w) => words(f).includes(w));
}

const persona = (p: Persona, role: string) => `- ${p.name} (${role}): ${p.bio}`;

export async function buildShow(db: SQLiteDatabase, station: Station, wish: string, length = 8): Promise<Show> {
  const SHOW_LENGTH = length;
  const chat = await getChatConfig(db);
  if (!chat.apiKey) throw new Error('Add an AI key in Settings first.');
  const [about, recent, taste, shifts, city, played, liked] = await Promise.all([
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
    playedSongs(db),
    likedSongs(db),
  ]);
  const [prefs, banned] = await Promise.all([getRadioPrefs(db), bannedSongs(db)]);
  // favourites take turns: one that played in the last few shows sits this one out
  const resting = new Set(played.slice(0, REST).map((p) => p.id));
  const ok = (t: { id: string }) => !banned.some((b) => b.id === t.id);
  const fresh = (t: { id: string }) => ok(t) && !resting.has(t.id);
  const favs = FAVOURITES_PER_SHOW[prefs.favourites];
  const spotifyFavs = favs && prefs.spotifyLiked ? (await spotifyLikedSongs(db).catch(() => [])).filter(ok) : [];
  const twist = prefs.twists ? TWISTS[Math.floor(Math.random() * TWISTS.length)] : null;
  // ONE pool of favourites: songs from this week's entries, hearted songs and Spotify Liked Songs.
  // The app draws a random few (Settings → Radio: 2 sometimes, 4 often) and the show plays exactly those.
  const journalSongs = recent
    .map((n) => noteSong(n))
    .filter((x): x is NonNullable<typeof x> => !!x)
    .map((x) => ({ id: x.id, uri: `spotify:track:${x.id}`, name: x.name, artist: x.artist }));
  const welcome = favs ? drawFavourites([journalSongs, liked, spotifyFavs], await playsThisMonth(db), favs, fresh) : [];
  const duo = !!station.sidekick;
  const names = duo ? `"${station.host.name}" or "${station.sidekick!.name}"` : `"${station.host.name}"`;

  const writer = (await getRadioModel(db, chat.provider)) || chat.model; // Settings → AI Models
  const reply = await PROVIDERS[chat.provider].complete({
    feature: 'radio',
    apiKey: chat.apiKey,
    model: writer,
    json: true,
    maxTokens: 1500 + SHOW_LENGTH * TALK[prefs.talk].tokens,
    system:
      `You write a private radio show on "${station.name} ${station.freq}" (${station.tagline}) for ONE listener, ` +
      `in the spirit of the radio stations in classic open-world crime games: larger-than-life hosts, absurd humour, ` +
      `fake commercials. All characters are original.\n\n` +
      `Hosts:\n${persona(station.host, 'host')}\n${duo ? persona(station.sidekick!, 'sidekick, the comedian') : ''}\n\n` +
      `Music: ${station.music}. Pick ${SHOW_LENGTH} REAL songs that exist on Spotify, in an order that flows. ` +
      (station.key === 'friend' ? 'Use their taste and their day. ' : 'Stay true to the station\'s style. ') +
      (prefs.hits ? `DEEP CUTS: at most ${prefs.hits} song${prefs.hits > 1 ? 's' : ''} per show may be big, obvious hits` : 'DEEP CUTS: no big, obvious hits at all') +
      (welcome.length ? "; the listener's favourites listed below come on top of that" : '') +
      '. Every other ' +
      'song must be a lesser-known track, album cut, B-side or forgotten gem that still fits perfectly. Never repeat ' +
      'a song from the "already played" list. Surprise them. ' +
      `\n\nBefore every song the hosts talk${duo ? ` as a back-and-forth (${TALK[prefs.talk].duo}; the sidekick gets the punchlines)` : ` (${TALK[prefs.talk].solo})`}. ` +
      'FACTS: when the hosts name a song or artist, it must be exactly the one in that "songs" entry (the song just ' +
      'played is the previous entry). Never invent facts about artists (who sang what, years, gossip); if unsure, ' +
      'joke about the listener\'s life instead. ' +
      'The first talk opens the show with a station ID. Make it about THIS listener: callbacks to what they wrote, ' +
      'their shift, their cat, their plans. Teasing is welcome, cruelty is not. ' +
      (station.ads.startsWith('none')
        ? ''
        : `Before every third song (3, 6, 9…), instead of a normal intro, do a break: one fake commercial (${station.ads}) or a short ` +
          'news bulletin (their weather, their week, their goals, read like breaking news), then lead into the song. ') +
      'Like a real DJ, sometimes talk over the END of a song: for each song after the first, set "overlap" to the ' +
      'seconds (4 to 12) the talk before it may run over the outro of the PREVIOUS song, but only when that previous ' +
      'song fades out or ends on a long instrumental tail; use 0 when it ends abruptly, on a big final line or a ' +
      'final chord that deserves silence. About a third of transitions at most. Overlapping talks must be short ' +
      '(one or two quick lines) and may react to the song that is fading out. Never sing or quote lyrics. ' +
      'Lines are SPOKEN aloud by a voice engine: no emojis, no markdown, no stage directions in brackets, natural speech, ' +
      'short sentences. You may put <laugh> or <short pause> inside a line. ' +
      LANGUAGE[station.lang] +
      '\n\n' +
      `Return {"title":"show name","lang":"tr or en","songs":[{"title":"…","artist":"…","label":null or "Commercial" or "News",` +
      `"overlap":0,"talk":[{"who":${names},"text":"…"}]}],"outro":[{"who":${names},"text":"…"}]} with ${SHOW_LENGTH} songs. ` +
      '"outro" is said after the last song: wrap up the show, a callback or two, a warm goodbye (2 to 4 lines).\n\n' +
      about,
    temperature: 1.1, // song picking wants surprise; the talks stay readable at this level
    lightThinking: true, // jokes don't need deep reasoning, and thinking tokens are the priciest part
    prompt:
      `Now: ${formatDate(Date.now())}, ${shiftFor(shifts, Date.now())} shift week${city ? `, in ${city}` : ''}.\n` +
      (twist ? `Tonight's twist for the playlist: ${twist}.\n` : '') +
      (welcome.length
        ? `Their favourites for tonight (play ALL of these, spread through the show, and greet them like old friends): ${welcome.map(songLine).join('; ')}\n`
        : '') +
      (played.length
        ? `Already played on the radio (do NOT pick these): ${played
            .filter((p) => !welcome.some((l) => l.id === p.id))
            .slice(0, 60) // the newest ones; the app itself still skips anything older that comes back
            .map(songLine)
            .join('; ')}\n`
        : '') +
      (banned.length ? `NEVER play these, the listener banned them: ${banned.slice(0, 60).map(songLine).join('; ')}\n` : '') +
      (wish.trim() ? `The listener asked for: ${wish.trim()}\n` : '') +
      (taste.length ? `Their top artists lately: ${taste.join(', ')}\n` : '') +
      `\nRecent journal:\n${renderNotes(recent) || '(nothing yet)'}`,
  });
  const plan = parseJsonReply<{
    title?: string;
    lang?: string;
    songs?: { title: string; artist: string; label?: string | null; overlap?: number; talk?: { who?: string; text?: string }[] }[];
    outro?: { who?: string; text?: string }[];
  }>(reply);

  const cast = [station.host.name, station.sidekick?.name].filter(Boolean) as string[];
  const lines = (raw?: { who?: string; text?: string }[]) =>
    (raw ?? [])
      .filter((l) => l.text?.trim())
      .map((l) => ({ speaker: cast.includes(l.who ?? '') ? l.who! : cast[0], text: l.text!.trim() }));
  const slots: Slot[] = [];
  for (const s of plan.songs ?? []) {
    const track = await findTrack(s.title, s.artist).catch(() => null);
    if (!track || !ok(track) || slots.some((x) => x.track.id === track.id)) continue;
    // Spotify found a different artist's song with that title: the talk would name the wrong singer
    if (!sameArtist(s.artist, track.artist)) continue;
    // the AI ignored the memory: skip a repeat, unless it's a favourite that has rested long enough
    if (resting.has(track.id)) continue;
    if (played.some((p) => p.id === track.id) && !liked.some((l) => l.id === track.id) && !welcome.some((w) => w.id === track.id)) {
      continue;
    }
    const talk = lines(s.talk);
    const overlap = slots.length && !s.label ? Math.max(0, Math.min(12, Math.round(Number(s.overlap) || 0))) : 0;
    slots.push({ track, talk, label: s.label === 'Commercial' || s.label === 'News' ? s.label : null, overlap });
  }
  if (!slots.length) throw new Error("Couldn't find those songs on Spotify. Try again?");
  return {
    title: plan.title?.trim() || station.name,
    lang:
      station.lang === 'tr' || (station.lang === 'auto' && plan.lang?.toLowerCase().startsWith('tr')) ? 'tr-TR' : 'en-US',
    station,
    slots,
    outro: lines(plan.outro),
  };
}

/** The voices a show needs, for the speech engine. */
export const castOf = (station: Station) =>
  [station.host, station.sidekick].filter((p): p is Persona => !!p).map((p) => ({ name: p.name, voice: p.voice, style: p.style }));
