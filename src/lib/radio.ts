import type { SQLiteDatabase } from 'expo-sqlite';
import { getRadioConfig, parseJsonReply } from './chat';
import { getCheckinSettings, shiftFor } from './checkins';
import { aboutUser, renderNotes } from './context';
import { getSetting } from './db';
import { formatDate, noteSong, olderNotes, recentNotes } from './notes';
import { bannedSongs, FAVOURITES_PER_SHOW, getRadioPrefs, likedSongs, playedSongs, playsThisMonth, songLine } from './songMemory';
import { findTrack, musicTaste, spotifyLikedSongs, type Track } from './spotify';
import { STATIONS, type Persona, type Station } from './stations';
import type { SpokenLine } from './tts';

/*
 * Lifelog Radio: a station's host (and sidekick) run a show just for you. Songs are real
 * (Spotify plays them); before each one the hosts talk, and every few songs there's a
 * fake commercial or a news bulletin made from your own life. Voices: Gemini TTS.
 */

/** overlap: seconds the talk before this song may run over the END of the previous one (0 = wait for it). */
export type Slot = { track: Track; talk: SpokenLine[]; label: string | null; overlap: number };
/** outro: the goodbye after the last song. */
/** `guest`: a host from another station who wandered into this show (a crossover), with their voice. */
export type Show = { title: string; lang: string; station: Station; slots: Slot[]; outro: SpokenLine[]; guest?: Persona & { from: string } };

const CROSSOVER_CHANCE = 1 / 8;
/** Sometimes a host from another station barges in: Kederli Kemal lost on Neon FM, Max Volt on Şemistan Chill… */
function pickGuest(station: Station): (Persona & { from: string }) | undefined {
  if (Math.random() >= CROSSOVER_CHANCE) return undefined;
  const others = STATIONS.filter((s) => s.key !== station.key && s.key !== 'friend');
  const from = others[Math.floor(Math.random() * others.length)];
  const pool = [from.host, from.sidekick].filter((p): p is Persona => !!p);
  const who = pool[Math.floor(Math.random() * pool.length)];
  return { ...who, from: `${from.name} ${from.freq}` };
}

/** Quick ideas for the "anything else?" box. */
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
  en: 'Speak English only (simple, natural, fun; the listener is learning English).',
  tr: 'Sadece Türkçe konuş (doğal, samimi İstanbul Türkçesi). Speak Turkish only.',
};

/** The song languages a station offers ('Station picks' always); a choice it doesn't offer counts as 'station'. */
export const songLangsFor = (st: Station) => SONG_LANGS.filter((l) => l.key === 'station' || !st.songLangs || st.songLangs.includes(l.key));
export const songLangOf = (st: Station, chosen: string): SongLang =>
  (songLangsFor(st).find((l) => l.key === chosen)?.key ?? 'station');

/** The songs' language, picked on the Radio screen; 'station' follows the talk language and the station's style. */
export type SongLang = 'station' | 'tr' | 'en' | 'mix';
export const SONG_LANGS: { key: SongLang; label: string }[] = [
  { key: 'station', label: 'Station picks' },
  { key: 'tr', label: 'Turkish' },
  { key: 'en', label: 'English' },
  { key: 'mix', label: 'Mix' },
];
function songLangRule(song: SongLang, talk: Station['lang']): string {
  if (song === 'tr') return ' SONGS: Turkish-language songs only (Turkish artists, sung in Turkish), still true to the station\'s style.';
  if (song === 'en') return ' SONGS: English-language songs only.';
  if (song === 'mix') return ' SONGS: a real mix, about half Turkish-language and half English-language songs, alternating so neither runs for long.';
  return talk === 'tr' ? ' Lean towards Turkish songs.' : talk === 'en' ? ' Lean towards English-language songs.' : '';
}

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

/** What making a show is busy with, for the progress list on the Radio screen. */
export type BuildStep = 'journal' | 'favourites' | 'picking' | 'songs' | 'writing';

export async function buildShow(
  db: SQLiteDatabase,
  station: Station,
  wish: string,
  length = 8,
  onStep: (step: BuildStep, detail?: string) => void = () => {},
  /** Optional: shows the checked playlist to you (reorder, remove) before the talks are written. */
  review?: (tracks: Track[]) => Promise<Track[]>,
): Promise<Show> {
  const SHOW_LENGTH = length;
  // spare songs: when Spotify can't find a song (or finds another artist's), a spare takes its place,
  // so a 16-song show is 16 songs and not 13. The show is made in three steps: the AI picks the songs,
  // the app checks them on Spotify, then the AI writes the talks for the songs that will really play.
  const SPARES = Math.max(3, Math.ceil(length / 3));
  onStep('journal');
  const writer = await getRadioConfig(db); // Settings → AI: its own provider and model, or the chat's
  if (!writer.apiKey) throw new Error('Add an AI key in Settings first.');
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
  const [prefs, banned, throwbacks] = await Promise.all([getRadioPrefs(db), bannedSongs(db), olderNotes(db, 14, 3).catch(() => [])]);
  // favourites take turns: one that played in the last few shows sits this one out
  const resting = new Set(played.slice(0, REST).map((p) => p.id));
  const ok = (t: { id: string }) => !banned.some((b) => b.id === t.id);
  const fresh = (t: { id: string }) => ok(t) && !resting.has(t.id);
  const favs = FAVOURITES_PER_SHOW[prefs.favourites];
  onStep('favourites');
  const spotifyFavs = favs && prefs.spotifyLiked ? (await spotifyLikedSongs(db).catch(() => [])).filter(ok) : [];
  const twist = prefs.twists ? TWISTS[Math.floor(Math.random() * TWISTS.length)] : null;
  // ONE pool of favourites: songs from this week's entries, hearted songs and Spotify Liked Songs.
  // The app draws a random few (Settings → Radio: 2 sometimes, 4 often) and the show plays exactly those.
  const journalSongs = recent
    .map((n) => noteSong(n))
    .filter((x): x is NonNullable<typeof x> => !!x)
    .map((x) => ({ id: x.id, uri: `spotify:track:${x.id}`, name: x.name, artist: x.artist }));
  // a genre station only plays the favourites that belong to its genre (Arabesk FM doesn't play your rock
  // songs): it gets a few more to choose from, and the writer keeps those that fit, up to `favs`
  const strict = station.key !== 'friend';
  const welcome = favs
    ? drawFavourites([journalSongs, liked, spotifyFavs], await playsThisMonth(db), strict ? favs * 3 : favs, fresh)
    : [];
  const duo = !!station.sidekick;
  const guest = pickGuest(station);
  const names = [station.host.name, station.sidekick?.name, guest?.name]
    .filter(Boolean)
    .map((n) => `"${n}"`)
    .join(' or ');

  const songLang = songLangRule(songLangOf(station, await getSetting(db, 'radio.songLang', 'station')), station.lang);
  const notesText = `Recent journal:\n${renderNotes(recent) || '(nothing yet)'}`;

  // ── 1. the playlist: the AI picks the songs (and spares), nothing else ──
  onStep('picking');
  const pickReply = await writer.adapter.complete({
    feature: 'radio',
    apiKey: writer.apiKey,
    model: writer.model,
    json: true,
    maxTokens: 1500 + (SHOW_LENGTH + SPARES) * 60,
    temperature: 1.1, // song picking wants surprise
    lightThinking: true,
    system:
      `You are the music director of "${station.name} ${station.freq}" (${station.tagline}), picking the playlist ` +
      `for a private show for ONE listener.\n\n` +
      `Music: ${station.music}. Pick ${SHOW_LENGTH} REAL songs that exist on Spotify (exact title and main artist ` +
      `as Spotify lists them), in an order that flows. ` +
      (station.key === 'friend' ? 'Use their taste and their day. ' : "Stay true to the station's style. ") +
      (prefs.hits ? `DEEP CUTS: at most ${prefs.hits} song${prefs.hits > 1 ? 's' : ''} per show may be big, obvious hits` : 'DEEP CUTS: no big, obvious hits at all') +
      (welcome.length ? "; the listener's favourites listed below come on top of that" : '') +
      (strict
        ? ". GENRE IS STRICT: every single song must clearly belong to this station's music (no rock on an arabesk " +
          'station, no pop on a rock station, and so on). If the song-language choice, a wish, a twist or a favourite ' +
          'would break the genre, the genre wins'
        : '') +
      '. Every other song must be a lesser-known track, album cut, B-side or forgotten gem that still fits perfectly. ' +
      'Never repeat a song from the "already played" list. Surprise them. ' +
      songLang +
      `\n\nReturn {"title":"a fun show name","lang":"tr or en (the language the hosts will speak)",` +
      `"songs":[{"title":"…","artist":"…"}],"spares":[{"title":"…","artist":"…"}]} with exactly ${SHOW_LENGTH} songs ` +
      `and ${SPARES} spares (more songs that fit, used if one can't be found on Spotify).\n\n` +
      about,
    prompt:
      `Now: ${formatDate(Date.now())}, ${shiftFor(shifts, Date.now())} shift week${city ? `, in ${city}` : ''}.\n` +
      (twist ? `Tonight's twist for the playlist: ${twist}.\n` : '') +
      (welcome.length
        ? strict
          ? `Their favourites (pick up to ${favs} of these, ONLY ones that truly belong to this station's genre): ${welcome.map(songLine).join('; ')}\n`
          : `Their favourites for tonight (include ALL of these, spread through the show): ${welcome.map(songLine).join('; ')}\n`
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
      `\n${notesText}`,
  });
  const pick = parseJsonReply<{ title?: string; lang?: string; songs?: { title: string; artist: string }[]; spares?: { title: string; artist: string }[] }>(pickReply);

  // ── 2. check them on Spotify: a song that can't be used is replaced by the next spare ──
  /** The song on Spotify, or null when it can't be used (not found, another artist, banned, a repeat). */
  let tracks: Track[] = [];
  const usable = async (x: { title: string; artist: string }) => {
    const track = await findTrack(x.title, x.artist).catch(() => null);
    if (!track || !ok(track) || tracks.some((t) => t.id === track.id)) return null;
    // Spotify found a different artist's song with that title: the talk would name the wrong singer
    if (!sameArtist(x.artist, track.artist)) return null;
    // the AI ignored the memory: skip a repeat, unless it's a favourite that has rested long enough
    if (resting.has(track.id)) return null;
    if (played.some((q) => q.id === track.id) && !liked.some((l) => l.id === track.id) && !welcome.some((w) => w.id === track.id)) {
      return null;
    }
    return track;
  };
  const wanted = pick.songs ?? [];
  const spares = [...(pick.spares ?? [])];
  // the counter shows songs really FOUND (not just looked up), and how many a spare had to replace
  let replaced = 0;
  const found = () => `${tracks.length}/${wanted.length} found${replaced ? ` · ${replaced} swapped for a spare` : ''}`;
  for (const planned of wanted) {
    onStep('songs', found());
    let track = await usable(planned);
    if (!track) replaced++;
    while (!track && spares.length) track = await usable(spares.shift()!);
    if (!track) replaced--; // not even a spare worked: this one is simply missing
    if (track) tracks.push(track);
  }
  onStep('songs', found());
  if (!tracks.length) throw new Error("Couldn't find those songs on Spotify. Try again?");
  // your turn: the talks are written for the order you leave it in
  if (review) tracks = (await review(tracks)).filter(Boolean);
  if (!tracks.length) throw new Error('The playlist is empty.');

  // ── 3. the script, for the playlist that will really play ──
  onStep('writing');
  const reply = await writer.adapter.complete({
    feature: 'radio',
    apiKey: writer.apiKey,
    model: writer.model,
    json: true,
    // a ceiling, not a cost (only what's written is billed). Roomy: Turkish takes Claude about twice the
    // tokens of English, and a 16-song Turkish show ran out of room with the old, tighter number
    maxTokens: 4000 + tracks.length * TALK[prefs.talk].tokens * 2,
    system:
      `You write a private radio show on "${station.name} ${station.freq}" (${station.tagline}) for ONE listener, ` +
      `in the spirit of the radio stations in classic open-world crime games: larger-than-life hosts, absurd humour, ` +
      `fake commercials. All characters are original.\n\n` +
      `Hosts:\n${persona(station.host, 'host')}\n${duo ? persona(station.sidekick!, 'sidekick, the comedian') : ''}\n\n` +
      `The playlist is already set (below): write the talk before each song, in that order. ` +
      `\n\nBefore every song the hosts talk${duo ? ` as a back-and-forth (${TALK[prefs.talk].duo}; the sidekick gets the punchlines)` : ` (${TALK[prefs.talk].solo})`}. ` +
      'TALK LENGTH IS THE SAME FOR EVERY SONG, from the first to the last: a long show has more talks, not shorter ' +
      'ones. Do not rush or shrink the talks towards the end. ' +
      'FACTS: when the hosts name a song or artist, it must be exactly the one in the playlist (the song just ' +
      'played is the previous one). Never invent facts about artists (who sang what, years, gossip); if unsure, ' +
      "joke about the listener's life instead. " +
      'The first talk opens the show with a station ID. Make it about THIS listener: callbacks to what they wrote, ' +
      'their shift, their cat, their plans. Teasing is welcome, cruelty is not. ' +
      'The first talk ends with "this show is brought to you by…" and a FAKE SPONSOR made from one small, real thing in ' +
      "their journal (the servis that is always late, their alarm clock, the cat's food bowl), with an absurd slogan. " +
      (station.ads.startsWith('none')
        ? 'Once, around the middle of the show, the host interrupts with BREAKING NEWS from their life (see below). '
        : `Before every third song (3, 6, 9…), instead of a normal intro, do a break: one fake commercial (${station.ads}) or ` +
          'BREAKING NEWS from their life, then lead into the song. ') +
      'BREAKING NEWS is a tiny, real event from their journal reported with full TV-news drama ("BREAKING: local man opens ' +
      '1,051 boxes, beating his target by ONE. Experts are shocked."): a dramatic opening, a fake expert or eyewitness ' +
      'quote, and a deadpan ending. Label that talk "News" (a commercial: "Commercial"). ' +
      (guest
        ? `CROSSOVER: somewhere in the middle of the show, ${guest.name} from another station (${guest.from}) wanders into ` +
          `the studio by mistake: ${guest.bio} They stay for one or two talks, completely in their own character and ` +
          `style, clash comically with the hosts, then leave (or get escorted out). Their lines use "who":"${guest.name}". `
        : '') +
      'Like a real DJ, sometimes talk over the END of a song: for each talk after the first, set "overlap" to the ' +
      'seconds (4 to 12) the talk may run over the outro of the PREVIOUS song, but only when that previous ' +
      'song fades out or ends on a long instrumental tail; use 0 when it ends abruptly, on a big final line or a ' +
      'final chord that deserves silence. About a third of transitions at most. Overlapping talks must be short ' +
      '(one or two quick lines) and may react to the song that is fading out. Never sing or quote lyrics. ' +
      'Lines are SPOKEN aloud by a voice engine: no emojis, no markdown, no stage directions in brackets, natural speech, ' +
      'short sentences. You may put <laugh> or <short pause> inside a line. ' +
      LANGUAGE[station.lang] +
      '\n\n' +
      `Return {"title":"show name","talks":[{"song":1,"label":null or "Commercial" or "News","overlap":0,` +
      `"talk":[{"who":${names},"text":"…"}]}],"outro":[{"who":${names},"text":"…"}]} with exactly ${tracks.length} talks, ` +
      'one per song, in playlist order ("song" is its number). ' +
      '"outro" is said after the last song: wrap up the show, a callback or two, a warm goodbye (2 to 4 lines).\n\n' +
      about,
    temperature: 1.1, // the talks stay readable at this level
    lightThinking: true, // jokes don't need deep reasoning, and thinking tokens are the priciest part
    prompt:
      `Now: ${formatDate(Date.now())}, ${shiftFor(shifts, Date.now())} shift week${city ? `, in ${city}` : ''}.\n` +
      `Show name idea: ${pick.title ?? station.name}\n` +
      `The playlist:\n${tracks.map((t, k) => `${k + 1}. "${t.name}" by ${t.artist}`).join('\n')}\n` +
      (welcome.length ? `Their favourites (greet these like old friends when they come): ${welcome.map(songLine).join('; ')}\n` : '') +
      (wish.trim() ? `The listener asked for: ${wish.trim()}\n` : '') +
      `\n${notesText}` +
      (throwbacks.length
        ? `\n\nThrowbacks: a few random OLDER entries. Use one or two for a callback ("remember that day in September when…"), ` +
          `always saying roughly when it was:\n${renderNotes(throwbacks)}`
        : ''),
  });
  const plan = parseJsonReply<{
    title?: string;
    talks?: { song?: number; label?: string | null; overlap?: number; talk?: { who?: string; text?: string }[] }[];
    outro?: { who?: string; text?: string }[];
  }>(reply);

  const cast = [station.host.name, station.sidekick?.name, guest?.name].filter(Boolean) as string[];
  const lines = (raw?: { who?: string; text?: string }[]) =>
    (raw ?? [])
      .filter((l) => l.text?.trim())
      .map((l) => ({ speaker: cast.includes(l.who ?? '') ? l.who! : cast[0], text: l.text!.trim() }));
  // each talk goes with its song: by the number it gives, else by position
  const talks = plan.talks ?? [];
  const slots: Slot[] = tracks.map((track, k) => {
    const t = talks.find((x) => Number(x.song) === k + 1) ?? talks[k] ?? {};
    const label = t.label === 'Commercial' || t.label === 'News' ? t.label : null;
    const overlap = k && !label ? Math.max(0, Math.min(12, Math.round(Number(t.overlap) || 0))) : 0;
    return { track, talk: lines(t.talk), label, overlap };
  });
  return {
    title: plan.title?.trim() || pick.title?.trim() || station.name,
    lang:
      station.lang === 'tr' || (station.lang === 'auto' && pick.lang?.toLowerCase().startsWith('tr')) ? 'tr-TR' : 'en-US',
    station,
    slots,
    outro: lines(plan.outro),
    guest,
  };
}

/** The voices a show needs, for the speech engine. */
export const castOf = (station: Station, guest?: Persona) =>
  [station.host, station.sidekick, guest].filter((p): p is Persona => !!p).map((p) => ({ name: p.name, voice: p.voice, style: p.style }));
