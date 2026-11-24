/*
 * The pure parts of "About the song" (no network, no native code), so they can be tested on their own.
 */

type Raw = Record<string, any>;

/** "Paranoid Android - Remastered 2017" → "Paranoid Android"; "(feat. X)" goes too. */
export function cleanTitle(name: string): string {
  return name
    .replace(/\s+-\s+.*(remaster|version|live|edit|mix|mono|stereo|acoustic|bonus|demo).*$/i, '')
    .replace(/\s*[([](feat\.?|ft\.?|with|from)\b[^)\]]*[)\]]/gi, '')
    .trim();
}

/** Wikidata descriptions that mean "a musician", in English or Turkish. */
const MUSICAL = /(^|[^\p{L}])(singer|band|musician|rapper|group|duo|trio|composer|songwriter|dj|producer|vocalist|guitarist|pianist|orchestra|şarkıcı|grubu?|müzisyen|besteci)($|[^\p{L}])/iu;

/** The search hit that is the musician: the first whose description says so. */
export const pickMusician = (hits: Raw[]): Raw | null => hits.find((h) => MUSICAL.test(h.description ?? '')) ?? null;

/** Turkish citizen or a band from Turkey (Q43): read their Turkish Wikipedia page first. */
export const isTurkish = (entity: Raw) => ['P27', 'P495'].some((p) => (entity?.claims?.[p] ?? []).some((c: Raw) => c.mainsnak?.datavalue?.value?.id === 'Q43'));

/**
 * Plain-text extracts keep section titles and blank lines: keep the prose, one paragraph break at most.
 * Titles come as "== Hayatı ve kariyeri ==" or, in the plain format, a bare short line without a full stop
 * ("Hayatı ve kariyeri", which the justified bio stretched across the card): both go.
 */
const isHeading = (l: string) => /^=+.*=+$/.test(l) || (l.length < 70 && !/[.!?…:;"”)\]]$/.test(l));
export const tidy = (text: string) =>
  text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l && !isHeading(l))
    .join('\n\n')
    .trim();


/* ── song timing and loudness, for the radio's hosts (from Deezer + LRCLIB) ── */

/** What the radio knows about a song before writing the show. Null = unknown. */
export type SongFacts = {
  bpm: number | null; // Deezer; 0 there means unknown
  gain: number | null; // Deezer's replay gain in dB: loud modern masters ≈ −10, quiet old recordings ≈ −4
  introSec: number | null; // seconds before the first sung line (synced lyrics)
  tailSec: number | null; // seconds of music after the last line has been sung
  instrumental: boolean;
  fame?: 'big hit' | 'well known' | 'deep cut' | null; // from Deezer's popularity rank
  album?: string | null; // Deezer: the album it's on
  year?: number | null; // Deezer: when that came out
  artistAbout?: string | null; // Wikipedia: the artist's page, its first sentences (real trivia for the hosts)
};
export const noFacts: SongFacts = { bpm: null, gain: null, introSec: null, tailSec: null, instrumental: false, fame: null };

const LINE_SEC = 4; // the last line takes about this long to sing: the instrumental ending starts after it

/** "[00:17.12] text" lines → when the first and the last sung lines start, in seconds. */
export function lyricTimes(synced: string | null | undefined): { first: number; last: number } | null {
  const times: number[] = [];
  for (const line of (synced ?? '').split('\n')) {
    const m = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
    if (m && m[3].trim() && !/^[♪♫\s]+$/.test(m[3])) times.push(Number(m[1]) * 60 + Number(m[2]));
  }
  return times.length ? { first: Math.min(...times), last: Math.max(...times) } : null;
}

/** Intro and ending lengths from the lyric times and the song's length. */
export function timing(times: { first: number; last: number } | null, durationSec: number): Pick<SongFacts, 'introSec' | 'tailSec'> {
  if (!times || durationSec <= 0 || times.last > durationSec + 5) return { introSec: null, tailSec: null };
  return { introSec: Math.round(times.first), tailSec: Math.max(0, Math.round(durationSec - times.last - LINE_SEC)) };
}

/**
 * How loud the hosts should talk next to this song (0.4–1). Quiet old recordings (gain near −4 dB) get
 * a softer voice, so the music doesn't sound small after the talk; loud modern masters get full voice.
 */
export function voiceVolume(gain: number | null | undefined): number {
  if (gain == null || !Number.isFinite(gain) || gain === 0) return 1;
  const loudness = -gain; // dB the song is above the reference: ≈10 for today's loud masters
  return Math.round(Math.min(1, Math.max(0.4, Math.pow(10, (loudness - 10) / 20))) * 100) / 100;
}

/** A tempo as words a DJ would say: slow and heavy, easy-going, upbeat, fast and lively. */
export const tempoFeel = (bpm: number) =>
  bpm < 80 ? 'slow and heavy' : bpm < 100 ? 'easy-going, mid-tempo' : bpm < 125 ? 'upbeat, you can move to it' : 'fast and lively, a dancer';

/** One playlist line's facts for the writer: "easy-going, mid-tempo · 18 s intro before the singing · ends on the vocal". */
export function factsLine(f: SongFacts): string {
  const parts: string[] = [];
  if (f.fame) parts.push(f.fame === 'big hit' ? 'a big hit' : f.fame === 'deep cut' ? 'a deep cut' : 'well known');
  // the tempo as a feel, never a number: the hosts said "yüz altmış tempo" on air (Arda: say hareketli, oynak…)
  if (f.bpm) parts.push(tempoFeel(f.bpm));
  if (f.instrumental) parts.push('instrumental');
  if (f.introSec != null) parts.push(f.introSec >= 10 ? `${f.introSec} s instrumental intro before the singing` : 'the singing starts right away');
  if (f.tailSec != null) parts.push(f.tailSec >= 6 ? `${f.tailSec} s of music after the last sung line` : 'ends right on the vocal');
  if (f.album || f.year) parts.push(`from ${f.album ? `the album "${f.album}"` : 'a release'}${f.year ? ` (${f.year})` : ''}`);
  if (f.artistAbout) parts.push(`about the artist: ${f.artistAbout}`);
  return parts.join(' · ');
}

/** The writer's overlap (seconds of talk over the previous song's end), checked against the real ending. */
export function fitOverlap(asked: number, prev: SongFacts | undefined): number {
  if (!asked || !prev) return asked;
  if (prev.tailSec == null) return Math.min(asked, 8); // unknown ending: keep it short
  if (prev.tailSec < 6) return 0; // ends on the singing: never talk over it
  return Math.min(asked, prev.tailSec - 2);
}

/** An intro talk only over a song that really has a long instrumental intro (when we know). */
export const introFits = (f: SongFacts | undefined) => !f || f.introSec == null || f.introSec >= 10;

/* ── live lyrics (LRCLIB synced lyrics, shown in the player) ── */

export type LyricLine = { ms: number; text: string };

/** "[01:02.50] text" lines → timed lines in order (blank lines kept as pauses: "♪"). */
export function parseLrc(synced: string | null | undefined): LyricLine[] {
  const out: LyricLine[] = [];
  for (const line of (synced ?? '').split('\n')) {
    // a line can carry several times: "[00:12.00][01:30.00] chorus"
    const stamps = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!stamps.length) continue;
    const text = line.replace(/\[\d+:\d+(?:\.\d+)?\]/g, '').trim();
    for (const m of stamps) out.push({ ms: Math.round((Number(m[1]) * 60 + Number(m[2])) * 1000), text: text || '♪' });
  }
  return out.sort((a, b) => a.ms - b.ms);
}

/** The line being sung at this moment (-1 before the first). */
export function lineAt(lines: LyricLine[], ms: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].ms <= ms) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/**
 * The interesting part of a Wikipedia lead for the hosts: its first sentence is the obvious one ("Sezen Aksu is a
 * Turkish singer"), so it's left out when there's more; then up to `n` sentences (and 500 characters).
 */
export function wikiTrivia(text: string | null | undefined, n = 4): string | null {
  const t = (text ?? '').replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim(); // "(born 1954)", pronunciations: out
  if (!t) return null;
  const sentences = (t.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [t]).map((x) => x.trim());
  const rest = sentences.length > 1 ? sentences.slice(1) : sentences;
  let out = rest.slice(0, n).join(' ').trim();
  if (out.length > 500) out = out.slice(0, 497).replace(/\s+\S*$/, '') + '…';
  return out || null;
}
