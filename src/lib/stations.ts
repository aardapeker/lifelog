/*
 * Lifelog Radio stations, Vice City style: each one has its own music, a host, a sidekick who
 * ruins everything, and fake commercials about your life. All characters are our own.
 * Voices are Gemini TTS prebuilt voices (two per show is the limit), styles are plain English.
 */

export type Gender = 'male' | 'female';
/** gender: only voices of it are offered for this persona (left out = any voice fits, like Deniz). */
export type Persona = { name: string; voice: string; style: string; bio: string; gender?: Gender };

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
      voice: 'Sadachbia', // lively; or Laomedeia (female), see FRIEND_VOICES
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
      gender: 'female',
      voice: 'Sulafat', // Arda's pick
      style: 'a hyper-cheerful 1980s pop radio DJ, bubbly, fast, over the top, like she drank six espressos',
      bio: "an 80s pop DJ who thinks everything is AMAZING, calls the listener 'sugar', lives for gossip",
    },
    sidekick: {
      name: 'Rico',
      gender: 'male',
      voice: 'Algieba', // Arda's pick
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
      gender: 'male',
      voice: 'Puck', // Arda's pick
      style: 'a deep, gravelly, overly dramatic movie-trailer narrator, slow and intense, every sentence epic',
      bio: 'treats the listener\'s warehouse job like a Miami action movie; boxes are "the enemy", breaks are "extraction"',
    },
    sidekick: {
      name: 'Deniz',
      gender: 'female', // Arda cast her with a woman's voice
      voice: 'Laomedeia', // Arda's pick
      style: 'a casual, tired, sarcastic night-shift coworker, unimpressed, yawning',
      bio: 'a fellow night-shift worker (a woman) who keeps bringing Max back to boring reality',
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
      gender: 'male',
      voice: 'Orus',
      style: 'a burned-out, grumpy old rock DJ, raspy, lazy, hates mornings, comes alive only for guitar solos',
      bio: 'a washed-up rocker who claims he almost toured with famous bands, hates pop music and alarm clocks',
    },
    sidekick: {
      name: 'Selin',
      gender: 'female',
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
      gender: 'female',
      voice: 'Aoede',
      style: 'a calm, breezy, soft-spoken late-night host, gentle and cosy, almost whispering',
      bio: 'a calm host who wants the listener to rest',
    },
    sidekick: {
      name: 'Şemistan',
      gender: 'male',
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
      gender: 'male',
      voice: 'Enceladus', // breathy: Arda's pick
      style: 'a dramatic, heartbroken Turkish arabesk radio host, slow, sighing, every sentence a tragedy, deep and gravelly',
      bio: 'an arabesk DJ who has suffered more than anyone alive, turns every small thing into a sad destiny, says "of" and "ah" a lot',
    },
    sidekick: {
      name: 'Çaycı Cengiz',
      gender: 'male',
      voice: 'Orus', // firm: Arda's pick
      style: 'a cheerful, chatty Istanbul tea seller, fast, friendly, totally unbothered, a bit of street humour',
      bio: 'brings Kemal tea, never understands why everyone is so sad, has a practical (and funny) answer for every tragedy',
    },
    ads: 'fake ads for çay ocakları, kaset dükkanları, dolmuş lines, lahmacun places and tespih shops, read with arabesk drama',
    lang: 'tr',
  },
];

export const stationByKey = (key: string) => STATIONS.find((s) => s.key === key) ?? STATIONS[0];

/** Gemini's prebuilt voices, with Google's own one-word description of each. */
// gender as Google lists it for these voices (Cloud Text-to-Speech, Chirp 3 HD: the same 30)
export const VOICES: { name: string; vibe: string; gender: Gender }[] = [
  { name: 'Puck', vibe: 'Upbeat', gender: 'male' },
  { name: 'Fenrir', vibe: 'Excitable', gender: 'male' },
  { name: 'Laomedeia', vibe: 'Upbeat', gender: 'female' },
  { name: 'Sadachbia', vibe: 'Lively', gender: 'male' },
  { name: 'Zephyr', vibe: 'Bright', gender: 'female' },
  { name: 'Autonoe', vibe: 'Bright', gender: 'female' },
  { name: 'Leda', vibe: 'Youthful', gender: 'female' },
  { name: 'Achird', vibe: 'Friendly', gender: 'male' },
  { name: 'Sulafat', vibe: 'Warm', gender: 'female' },
  { name: 'Aoede', vibe: 'Breezy', gender: 'female' },
  { name: 'Callirrhoe', vibe: 'Easy-going', gender: 'female' },
  { name: 'Umbriel', vibe: 'Easy-going', gender: 'male' },
  { name: 'Zubenelgenubi', vibe: 'Casual', gender: 'male' },
  { name: 'Algieba', vibe: 'Smooth', gender: 'male' },
  { name: 'Despina', vibe: 'Smooth', gender: 'female' },
  { name: 'Achernar', vibe: 'Soft', gender: 'female' },
  { name: 'Vindemiatrix', vibe: 'Gentle', gender: 'female' },
  { name: 'Enceladus', vibe: 'Breathy', gender: 'male' },
  { name: 'Algenib', vibe: 'Gravelly', gender: 'male' },
  { name: 'Gacrux', vibe: 'Mature', gender: 'female' },
  { name: 'Kore', vibe: 'Firm', gender: 'female' },
  { name: 'Orus', vibe: 'Firm', gender: 'male' },
  { name: 'Alnilam', vibe: 'Firm', gender: 'male' },
  { name: 'Charon', vibe: 'Informative', gender: 'male' },
  { name: 'Rasalgethi', vibe: 'Informative', gender: 'male' },
  { name: 'Sadaltager', vibe: 'Knowledgeable', gender: 'male' },
  { name: 'Iapetus', vibe: 'Clear', gender: 'male' },
  { name: 'Erinome', vibe: 'Clear', gender: 'female' },
  { name: 'Schedar', vibe: 'Even', gender: 'male' },
  { name: 'Pulcherrima', vibe: 'Forward', gender: 'female' },
];

/** Your Friend 88.0 offers a choice of gender, not of voice: these two (Arda's picks). */
export const FRIEND_VOICES: { gender: Gender; label: string; voice: string }[] = [
  { gender: 'male', label: 'Male', voice: 'Sadachbia' },
  { gender: 'female', label: 'Female', voice: 'Laomedeia' },
];

/** The voices to offer a persona: its gender's (plus whatever it uses now, so a past choice never vanishes). */
export const voicesFor = (p: Persona) => VOICES.filter((v) => !p.gender || v.gender === p.gender || v.name === p.voice);

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
