/*
 * Lifelog Radio stations, Vice City style: each one has its own music, a host, a sidekick who
 * ruins everything, and fake commercials about your life. All characters are our own.
 * Voices are Gemini TTS prebuilt voices (two per show is the limit), styles are plain English.
 */

export type Persona = { name: string; voice: string; style: string; bio: string };

export type Station = {
  key: string;
  name: string;
  freq: string; // shown like a dial: "98.3"
  tagline: string;
  emoji: string;
  music: string; // what the station plays (the AI picks real songs from this brief)
  host: Persona;
  sidekick: Persona | null;
  ads: string; // the flavour of its commercials
  lang: Lang; // what the hosts speak (you can change it per station)
};

export type Lang = 'auto' | 'en' | 'tr';
export const LANGS: { key: Lang; label: string }[] = [
  { key: 'auto', label: 'Auto' },
  { key: 'en', label: 'English' },
  { key: 'tr', label: 'Türkçe' },
];

export const STATIONS: Station[] = [
  {
    key: 'friend',
    name: 'Your Friend',
    freq: '88.0',
    tagline: 'Just your friend and songs for today',
    emoji: '🎙️',
    music: 'whatever fits their day and taste right now; mix favourites with a few new finds',
    host: {
      name: 'Your friend',
      voice: 'Puck',
      style: 'a warm, charismatic late-night radio DJ, playful and relaxed, smiling while talking',
      bio: "their close friend who has read their journal; warm, funny, a little teasing",
    },
    sidekick: null,
    ads: 'none, this is a cosy show',
    lang: 'auto',
  },
  {
    key: 'neon',
    name: 'Neon FM',
    freq: '98.3',
    tagline: 'Big hair. Bigger hits. The 80s never ended.',
    emoji: '🌴',
    music: '80s pop hits only: synth-pop, new wave, big radio singles from 1980–1989, the kind you sing in a convertible',
    host: {
      name: 'Candy Starr',
      voice: 'Laomedeia',
      style: 'a hyper-cheerful 1980s pop radio DJ, bubbly, fast, over the top, like she drank six espressos',
      bio: "an 80s pop DJ who thinks everything is AMAZING, calls the listener 'sugar', lives for gossip",
    },
    sidekick: {
      name: 'Rico',
      voice: 'Fenrir',
      style: 'a sarcastic, deadpan comedian sidekick, dry and unimpressed, mumbling the punchlines',
      bio: "Candy's co-host, a broke comedian who mocks everything, especially the listener's life choices",
    },
    ads: "cheesy 1980s TV commercials with fake phone numbers like 1-800-..., absurd products made for the listener's exact problems",
    lang: 'en',
  },
  {
    key: 'nightshift',
    name: 'Night Shift FM',
    freq: '23.3',
    tagline: 'For the ones awake while the city sleeps.',
    emoji: '🌃',
    music: 'dark synthwave, retro synth soundtracks, 80s night-drive rock and moody electronic, cinematic and driving',
    host: {
      name: 'Max Volt',
      voice: 'Algenib',
      style: 'a deep, gravelly, overly dramatic movie-trailer narrator, slow and intense, every sentence epic',
      bio: 'treats the listener\'s warehouse job like a Miami action movie; boxes are "the enemy", breaks are "extraction"',
    },
    sidekick: {
      name: 'Deniz',
      voice: 'Zubenelgenubi',
      style: 'a casual, tired, sarcastic night-shift coworker, unimpressed, yawning',
      bio: 'a fellow night-shift worker who keeps bringing Max back to boring reality',
    },
    ads: 'fake ads for energy drinks, coffee, sleep and miracle products for night-shift workers, read like action trailers',
    lang: 'en',
  },
  {
    key: 'rock',
    name: 'Gebze Rock 104',
    freq: '104.0',
    tagline: 'Loud guitars for loud boxes.',
    emoji: '🎸',
    music: 'classic rock, hard rock and alternative anthems from the 70s to the 2000s, guitar-driven',
    host: {
      name: 'Kaan "Riff" Demir',
      voice: 'Orus',
      style: 'a burned-out, grumpy old rock DJ, raspy, lazy, hates mornings, comes alive only for guitar solos',
      bio: 'a washed-up rocker who claims he almost toured with famous bands, hates pop music and alarm clocks',
    },
    sidekick: {
      name: 'Selin',
      voice: 'Kore',
      style: 'a sharp, energetic producer, firm and witty, fact-checking him',
      bio: "the station's producer who exposes Riff's fake stories",
    },
    ads: 'fake ads for guitar shops, earplugs, hair products and bad bands, read with rock attitude',
    lang: 'auto',
  },
  {
    key: 'chill',
    name: 'Şemistan Chill',
    freq: '91.1',
    tagline: 'Lo-fi, rain and one very opinionated cat.',
    emoji: '🐈',
    music: 'lo-fi, chill indie, soft acoustic, downtempo and calm songs for winding down',
    host: {
      name: 'Ece',
      voice: 'Aoede',
      style: 'a calm, breezy, soft-spoken late-night host, gentle and cosy, almost whispering',
      bio: 'a calm host who wants the listener to rest',
    },
    sidekick: {
      name: 'Şemistan',
      voice: 'Puck',
      style: 'a dramatic, entitled house cat who can talk, demanding and theatrical, sometimes meowing',
      bio: "the listener's actual cat, demanding food and attention, judging the music and the owner",
    },
    ads: 'fake ads from the cat\'s point of view: premium tuna, sunny windowsills, boxes to sit in',
    lang: 'tr',
  },
  {
    key: 'arabesk',
    name: 'Tuzla Arabesk FM',
    freq: '90.5',
    tagline: 'Derdin varsa, şarkımız var.',
    emoji: '🥀',
    music:
      'Turkish arabesk and arabesk-fantezi classics from the 70s to the 2000s: heartbreak, longing, fate, ' +
      'the great voices of the genre, plus a few modern arabesk-influenced songs',
    host: {
      name: 'Kederli Kemal',
      voice: 'Algenib',
      style: 'a dramatic, heartbroken Turkish arabesk radio host, slow, sighing, every sentence a tragedy, deep and gravelly',
      bio: 'an arabesk DJ who has suffered more than anyone alive, turns every small thing into a sad destiny, says "of" and "ah" a lot',
    },
    sidekick: {
      name: 'Çaycı Cengiz',
      voice: 'Achird',
      style: 'a cheerful, chatty Istanbul tea seller, fast, friendly, totally unbothered, a bit of street humour',
      bio: 'brings Kemal tea, never understands why everyone is so sad, has a practical (and funny) answer for every tragedy',
    },
    ads: 'fake ads for çay ocakları, kaset dükkanları, dolmuş lines, lahmacun places and tespih shops, read with arabesk drama',
    lang: 'tr',
  },
];

export const stationByKey = (key: string) => STATIONS.find((s) => s.key === key) ?? STATIONS[0];

/** Gemini's prebuilt voices, with Google's own one-word description of each. */
export const VOICES: { name: string; vibe: string }[] = [
  { name: 'Puck', vibe: 'Upbeat' },
  { name: 'Fenrir', vibe: 'Excitable' },
  { name: 'Laomedeia', vibe: 'Upbeat' },
  { name: 'Sadachbia', vibe: 'Lively' },
  { name: 'Zephyr', vibe: 'Bright' },
  { name: 'Autonoe', vibe: 'Bright' },
  { name: 'Leda', vibe: 'Youthful' },
  { name: 'Achird', vibe: 'Friendly' },
  { name: 'Sulafat', vibe: 'Warm' },
  { name: 'Aoede', vibe: 'Breezy' },
  { name: 'Callirrhoe', vibe: 'Easy-going' },
  { name: 'Umbriel', vibe: 'Easy-going' },
  { name: 'Zubenelgenubi', vibe: 'Casual' },
  { name: 'Algieba', vibe: 'Smooth' },
  { name: 'Despina', vibe: 'Smooth' },
  { name: 'Achernar', vibe: 'Soft' },
  { name: 'Vindemiatrix', vibe: 'Gentle' },
  { name: 'Enceladus', vibe: 'Breathy' },
  { name: 'Algenib', vibe: 'Gravelly' },
  { name: 'Gacrux', vibe: 'Mature' },
  { name: 'Kore', vibe: 'Firm' },
  { name: 'Orus', vibe: 'Firm' },
  { name: 'Alnilam', vibe: 'Firm' },
  { name: 'Charon', vibe: 'Informative' },
  { name: 'Rasalgethi', vibe: 'Informative' },
  { name: 'Sadaltager', vibe: 'Knowledgeable' },
  { name: 'Iapetus', vibe: 'Clear' },
  { name: 'Erinome', vibe: 'Clear' },
  { name: 'Schedar', vibe: 'Even' },
  { name: 'Pulcherrima', vibe: 'Forward' },
];

/** Your own choices per station: { neon: { host: 'Kore', sidekick: 'Charon', lang: 'en' } }. */
export type VoiceChoices = Record<string, { host?: string; sidekick?: string; lang?: Lang }>;

/** The station with your chosen voices swapped in. */
export function withVoices(station: Station, choices: VoiceChoices): Station {
  const c = choices[station.key] ?? {};
  return {
    ...station,
    lang: c.lang ?? station.lang,
    host: { ...station.host, voice: c.host ?? station.host.voice },
    sidekick: station.sidekick && { ...station.sidekick, voice: c.sidekick ?? station.sidekick.voice },
  };
}
