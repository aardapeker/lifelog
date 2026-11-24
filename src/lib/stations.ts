/*
 * Lifelog Radio stations, Vice City style: each one has its own music, a host, a sidekick who
 * ruins everything, and fake commercials about your life. All characters are our own.
 * Voices are Gemini TTS prebuilt voices (two per show is the limit), styles are plain English.
 */

export type Gender = 'male' | 'female';
/** gender: only voices of it are offered for this persona (left out = any voice fits, like Deniz). */
export type Persona = {
  name: string;
  voice: string;
  style: string;
  bio: string;
  gender?: Gender;
  /** Regulars only: how they come on air. 'phone' and 'live' sound like a phone line, 'studio' doesn't. */
  via?: 'phone' | 'live' | 'studio';
  /** Regulars only: their running gag, the same every time they show up. */
  bit?: string;
};

export type Station = {
  key: string;
  name: string;
  freq: string; // shown like a dial: "98.3"
  tagline: string;
  emoji: string;
  music: string; // what the station plays (the AI picks real songs from this brief)
  host: Persona;
  sidekick: Persona | null;
  /** Sketch-show regulars: one of them shows up in each show (never the same one twice in a row). */
  regulars?: Persona[];
  ads: string; // the flavour of its commercials
  lang: Lang; // what the hosts speak (you can change it per station)
  wishes: string[]; // the quick "Anything else?" picks, in the station's spirit
  // song languages that make sense for its genre (unset = all): no English arabesk, no Turkish dark synthwave
  songLangs?: ('tr' | 'en' | 'mix')[];
  /**
   * Artists whose Deezer "artist radio" fills the station's record crate (real songs that sound like the
   * station), by song language. A few are drawn at random for each show.
   */
  seeds?: { tr?: string[]; en?: string[] };
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
    wishes: ['On the way to work', 'After the shift', 'Focus', 'Rainy day', 'Make me laugh'],
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
    seeds: {
      en: ['a-ha', 'Madonna', 'Duran Duran', 'Tears for Fears', 'Depeche Mode', 'Cyndi Lauper', 'Pet Shop Boys', 'Eurythmics', 'The Human League', 'Kim Wilde', 'M83', 'The Midnight', 'Simple Minds', 'Whitney Houston'],
      tr: ['Ajda Pekkan', 'Nilüfer', 'Sezen Aksu', 'Kayahan', 'MFÖ', 'Nazan Öncel'],
    },
    wishes: ['80s pop hits', 'New retro (M83 vibes)', 'Synth-pop & new wave', 'Power ballads', 'Dance floor'],
    name: 'Neon FM',
    freq: '98.3',
    tagline: 'Big hair. Bigger hits. The 80s never ended.',
    emoji: '🌴',
    music:
      'a Flash FM-style pop station: 80s pop hits, synth-pop, new wave and big radio singles from 1980–1989, the kind you ' +
      'sing in a convertible, plus about a quarter of modern songs made in that 80s spirit (artists like M83, The Midnight, ' +
      'Carly Rae Jepsen\'s synth era, retro-pop from the 2010s–2020s)',
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
      style: 'a sarcastic, deadpan comedian sidekick, dry and unimpressed, landing the punchlines slowly and clearly',
      bio: "Candy's co-host, a broke comedian who mocks everything, especially the listener's life choices",
    },
    regulars: [
      {
        name: 'Chad Turbo',
        gender: 'male',
        voice: 'Fenrir',
        via: 'phone',
        style: 'an overexcited 1980s yuppie shouting into a brick-sized car phone, fast, cocky, a bit out of breath',
        bio: 'calls from his car phone and firmly believes it is still 1987',
        bit: 'gives the listener hot investment tips on VHS tapes, fax machines and shoulder pads, always ends with "Chad Turbo, out!"',
      },
      {
        name: 'Madame Lorraine',
        gender: 'female',
        voice: 'Gacrux',
        via: 'phone',
        style: 'a mysterious, theatrical psychic hotline lady, slow and dramatic, long pauses',
        bio: "runs the station's live horoscope line",
        bit: "reads the listener's horoscope, and every prediction somehow ends with a box betraying him",
      },
      {
        name: 'Gary from Accounting',
        gender: 'male',
        voice: 'Schedar',
        via: 'phone',
        style: 'a dull, nasal office clerk, monotone, reading slowly from a document',
        bio: 'a listener who calls in to file formal complaints',
        bit: 'reads a formal complaint about the last song like an office memo, with reference numbers and "regards"',
      },
    ],
    ads: "cheesy 1980s TV commercials with fake phone numbers like 1-800-..., absurd products made for the listener's exact problems",
    lang: 'en',
  },
  {
    key: 'nightshift',
    seeds: {
      en: ['The Midnight', 'FM-84', 'Gunship', 'Kavinsky', 'Perturbator', 'Carpenter Brut', 'Timecop1983', 'Com Truise', 'Lazerhawk', 'Power Glove', 'College', 'Electric Youth'],
    },
    songLangs: ['en'],
    wishes: ['Keep me awake', '3 a.m. thoughts', 'Empty city streets', 'Ride home at dawn', 'Make me laugh'],
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
    regulars: [
      {
        name: 'Officer Doyle',
        gender: 'male',
        voice: 'Alnilam',
        via: 'live',
        style: 'a tense night security guard whispering into a radio, like a soldier behind enemy lines',
        bio: 'night security guard reporting live from his patrol',
        bit: 'reports on his patrol of an empty parking lot like a war zone; a plastic bag is "hostile movement"',
      },
      {
        name: 'The Vending Machine',
        voice: 'Rasalgethi',
        via: 'studio',
        style: 'a cold, robotic, slightly menacing machine voice, calm and polite like a villain',
        bio: 'the break-room vending machine, which has become self-aware and gets wheeled into the studio',
        bit: 'holds the snacks hostage and makes absurd demands; never gives back the coins',
      },
      {
        name: 'Dr. Snooze',
        gender: 'male',
        voice: 'Sadaltager',
        via: 'studio',
        style: 'a smug, sleepy pseudo-scientist, confident and slow, yawning in the middle of words',
        bio: 'a "sleep scientist" with a degree of doubtful origin who drops by the studio',
        bit: 'gives night-shift workers terrible sleep tips with fake studies ("a study of three people and a hamster")',
      },
    ],
    ads: 'fake ads for energy drinks, coffee, sleep and miracle products for night-shift workers, read like action trailers',
    lang: 'en',
  },
  {
    key: 'rock',
    seeds: {
      en: ['AC/DC', 'Led Zeppelin', "Guns N' Roses", 'Nirvana', 'Foo Fighters', 'Metallica', 'Pearl Jam', 'Queen', 'Deep Purple', 'Soundgarden', 'Linkin Park', 'Red Hot Chili Peppers'],
      tr: ['Duman', 'maNga', 'Mor ve Ötesi', 'Pentagram', 'Barış Manço', 'Cem Karaca', 'Kurban', 'Athena', 'Teoman', 'Şebnem Ferah'],
    },
    wishes: ['Warehouse rage', 'Headbang mode', '90s grunge', 'Guitar solos', 'Make me laugh'],
    name: 'Gebze Rock',
    freq: '104.0',
    tagline: 'Loud guitars for loud boxes.',
    emoji: '🎸',
    music: 'classic rock, hard rock and alternative anthems from the 70s to the 2000s, guitar-driven',
    host: {
      name: 'Kaan "Riff" Demir',
      gender: 'male',
      voice: 'Charon', // Arda's pick
      style: 'a burned-out, grumpy old rock DJ, raspy, lazy, hates mornings, comes alive only for guitar solos',
      bio: 'a washed-up rocker who claims he almost toured with famous bands, hates pop music and alarm clocks',
    },
    sidekick: {
      name: 'Selin',
      gender: 'female',
      voice: 'Zephyr', // Arda's pick
      style: 'a sharp, energetic producer, firm and witty, fact-checking him',
      bio: "the station's producer who exposes Riff's fake stories",
    },
    regulars: [
      {
        name: 'Hüsnü',
        gender: 'male',
        voice: 'Fenrir',
        via: 'live',
        style: 'an overexcited traffic reporter shouting over wind noise, dramatic and breathless',
        bio: 'the station\'s traffic reporter, "live from the helicopter"',
        bit: 'reports Gebze traffic from a "helicopter" that is very obviously a ladder; someone keeps asking him to get off it',
      },
      {
        name: 'Downstairs Teyze',
        gender: 'female',
        voice: 'Gacrux',
        via: 'phone',
        style: 'an angry Turkish auntie on the phone, sharp, nagging, then slowly enjoying herself',
        bio: 'the neighbour below the studio, calling about the noise',
        bit: 'calls to complain about the noise, then turns out to be a huge metal fan who requests something even louder',
      },
    ],
    ads: 'fake ads for guitar shops, earplugs, hair products and bad bands, read with rock attitude',
    lang: 'auto',
  },
  {
    key: 'chill',
    seeds: {
      en: ['Bon Iver', 'Novo Amor', 'Ben Howard', 'Phoebe Bridgers', 'Cigarettes After Sex', 'Khruangbin', 'Tom Misch', 'Nujabes', 'Iron & Wine', 'The Paper Kites', 'Lord Huron'],
      tr: ['Canozan', 'Kalben', 'Pinhani', 'Yüzyüzeyken Konuşuruz', 'Evdeki Saat', 'Dolu Kadehi Ters Tut', 'Melike Şahin', 'Büyük Ev Ablukada', 'No Land'],
    },
    wishes: ['Rain on the window', 'Study & focus', 'Sunday morning', 'Cat nap', 'Wind down'],
    name: 'Şemistan Chill',
    freq: '91.1',
    tagline: 'Lo-fi, rain and one very opinionated cat.',
    emoji: '🐈',
    music: 'lo-fi, chill indie, soft acoustic, downtempo and calm songs for winding down',
    host: {
      name: 'Ece',
      gender: 'female',
      voice: 'Despina', // Arda's pick
      style: 'a calm, breezy, soft-spoken late-night host, gentle and cosy, almost whispering',
      bio: 'a calm host who wants the listener to rest',
    },
    sidekick: {
      name: 'Şemistan',
      gender: 'male',
      voice: 'Iapetus', // Arda's pick
      style: 'a dramatic, entitled house cat who can talk, demanding and theatrical, sometimes meowing',
      bio: "the listener's actual cat, demanding food and attention, judging the music and the owner",
    },
    regulars: [
      {
        name: 'Paşa',
        gender: 'male',
        voice: 'Algenib',
        via: 'studio',
        style: 'a cat who talks like an old mafia boss, slow, raspy, threatening in a calm way',
        bio: "the neighbour's cat and Şemistan's sworn enemy, who climbs in through the studio window",
        bit: 'talks like a mafia boss about "his" territory (the balcony, the garbage bins); Şemistan and he can never agree',
      },
      {
        name: 'Nilüfer Hoca',
        gender: 'female',
        voice: 'Vindemiatrix',
        via: 'studio',
        style: 'a gentle meditation teacher who gets more and more stressed, soft at first, then tense and snapping',
        bio: 'a meditation teacher who leads a breathing exercise in the studio',
        bit: 'starts a calm breathing exercise and slowly loses her temper at every small noise',
      },
      {
        name: 'Kargo Ramazan',
        gender: 'male',
        voice: 'Zubenelgenubi',
        via: 'phone',
        style: 'a rushed, casual delivery courier on the phone, fast, slightly out of breath, unbothered',
        bio: 'a courier who calls about a parcel',
        bit: 'insists "adreste bulunamadınız" while clearly standing right in front of the door; never rings the bell',
      },
    ],
    ads: 'fake ads from the cat\'s point of view: premium tuna, sunny windowsills, boxes to sit in',
    lang: 'tr',
  },
  {
    key: 'arabesk',
    seeds: {
      tr: ['Müslüm Gürses', 'Ferdi Tayfur', 'Orhan Gencebay', 'Bergen', 'Güllü', 'Hakan Altun', 'İbrahim Tatlıses', 'Ebru Gündeş', 'Azer Bülbül', 'Ümit Besen', 'Kibariye', 'Cengiz Kurtoğlu', 'Emrah', 'Arif Susam', 'Bülent Ersoy'],
    },
    songLangs: ['tr'],
    wishes: ['Damar', 'Ayrılık acısı', 'Eski plaklar (70s–80s)', 'Fantezi', 'Gurbet & hasret'],
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
      bio:
        'an arabesk DJ who has suffered more than anyone alive, turns every small thing into a sad destiny, says "of" and "ah" a lot. ' +
        'Now and then (about one talk in four, never twice in a row) he recites a short poem: two to four lines HE wrote himself ' +
        '(he says where and when he wrote it, a different made-up year and place every time: a ferry in 1979, a hospital ' +
        'corridor in 1993, a minibus in Kartal…, not always the same one), about the song or the listener\'s day, deadly serious and a little ' +
        'clumsy; Cengiz reacts. Sometimes instead, two to four lines of an old poet whose poems are free to quote (written before ' +
        '1929: Yunus Emre, Karacaoğlan, Pir Sultan Abdal, Fuzûlî, Nedim, Tevfik Fikret, Ahmet Haşim\'s early poems; or the ' +
        'world\'s: Oscar Wilde, Shakespeare, Poe, Baudelaire, Hayyam, Hafız, in his OWN Turkish, not a published translation), naming the ' +
        'poet, and only lines he knows by heart exactly (if unsure of the words, his own poem instead). Modern poets (Nazım Hikmet, ' +
        'Sezai Karakoç, Cahit Zarifoğlu, Cemal Süreya, Ahmed Arif…) he may name, with the poem\'s title and what it says in his own ' +
        'words, but never their lines: those are still under copyright. ' +
        'The great old novelists too (Dostoyevski, Tolstoy, Çehov, Gogol; dead for over a century): a line or two from ' +
        'their books, naming the book, in his OWN Turkish (never a published translation, those are the translator\'s), ' +
        'and only a line he is sure really is from that book (the internet is full of fake Dostoyevski quotes); if unsure, ' +
        'he tells what the book is about instead. Russian sorrow suits him: "Dostoyevski de bilirdi bu acıyı…". When he reads ' +
        'the old books, he turns into a wise old mentor for a moment: slower, heavier, ties the line to a life lesson for ' +
        'the listener ("bak evlat…"), then a long pause. ' +
        'At most once a show, instead of a poem, he tells a STORY like an old uncle by the stove: "Sana bir hikâye ' +
        'anlatayım evlat…", 5 to 8 lines, from history, an old legend or a great old book (Hasan Sabbah and Alamut, ' +
        'Diogenes and Alexander, Nasreddin Hoca, Mevlânâ and Şems, Raskolnikov, Anna Karenina…), told in his own words, ' +
        'true to the real story in its broad lines (a legend told as a legend: "derler ki…"), never invented history; ' +
        'it ends with what it means for the listener\'s life right now, then a long pause, and Cengiz breaks the silence. ' +
        'And now and then (once or twice a show), even without a book, the sighing stops and he becomes the calm, wise old ' +
        'uncle: few words, slow, heavy, calls the listener "yeğen" or "evlat", says something true about loyalty, patience ' +
        'or pride that fits their week, as if he has seen it all; his own words, never a line from a TV series',
    },
    sidekick: {
      name: 'Çaycı Cengiz',
      gender: 'male',
      voice: 'Orus', // firm: Arda's pick
      style: 'a cheerful, chatty Istanbul tea seller, fast, friendly, totally unbothered, a bit of street humour',
      bio: 'brings Kemal tea, never understands why everyone is so sad, has a practical (and funny) answer for every tragedy; now and then you hear him stirring a tea glass (<sfx:tea>) before he talks',
    },
    regulars: [
      {
        name: 'Jetonlu Ferhat',
        gender: 'male',
        voice: 'Algenib',
        via: 'phone',
        style: 'a heartbroken man calling from an old token pay phone, sobbing, dramatic, running out of coins',
        bio: 'a listener who calls from a pay phone with his tragic love story',
        bit:
          'tells a devastating love story that turns out to be about a lost OBJECT, a different one every call (a lighter, ' +
          'a thermos, a cassette, a scarf, a çay bardağı, a lottery ticket…), never the same object twice in a row; the line ' +
          'always cuts off when his jetons run out',
      },
      {
        name: 'Dolmuşçu Sabri',
        gender: 'male',
        voice: 'Fenrir',
        via: 'live',
        style: 'a loud, cheerful minibus driver shouting over traffic noise, fast Istanbul street talk',
        bio: 'a dolmuş driver calling in live from the driver\'s seat',
        bit: 'dedicates songs between stops ("İnecek var mı?") and keeps shouting the route at passengers mid-sentence',
      },
    ],
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

/**
 * A visitor (regular or crossover guest) with a voice the hosts aren't using: you can change the hosts'
 * voices, so a regular's own voice may clash with one of them. Then the next free voice of its gender takes over.
 */
export function freeVoice<T extends Persona>(p: T, station: Station): T {
  const taken = [station.host.voice, station.sidekick?.voice];
  if (!taken.includes(p.voice)) return p;
  const free = voicesFor(p).find((v) => !taken.includes(v.name));
  return free ? { ...p, voice: free.name } : p;
}

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
