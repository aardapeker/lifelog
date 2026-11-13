import { NOT_WORD } from './text';

/*
 * Port of the backend's StoryMatcher: are two headlines about the same story, by the words they
 * share? No AI calls, so it's free and instant.
 * "Tesla debuts flying car" and "Tesla unveils what it says is a flying car" share {flying, car}
 * once the topic's own words ("tesla") and filler words are removed.
 */

const MIN_SHARED = 2;
const MIN_OVERLAP = 0.6;
const MANY_SHARED = 3;
const MANY_OVERLAP = 0.4;

const STOPWORDS = new Set(
  (
    'the and for with that this from into after over about what says said say new its his her their are was were has have ' +
    'had will would can could may just now how why who here you your our not but all out more than then also first report ' +
    'reports update news today video watch live via amid'
  ).split(' '),
);

/** Tiny stemmer: "debuts" → "debut" (good enough for headlines). */
const stem = (w: string) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
const split = (s: string) => s.toLowerCase().split(NOT_WORD).filter(Boolean);

/** Lowercase words of 3+ letters (or any number), minus filler words and the topic's own words. */
export function words(title: string | null, ignore: string[]): Set<string> {
  if (!title) return new Set();
  const ignored = new Set(ignore.flatMap(split).map(stem));
  const out = new Set<string>();
  for (const w of split(title)) {
    if (STOPWORDS.has(w)) continue;
    if (!/^\d+$/.test(w) && w.length < 3) continue;
    const s = stem(w);
    if (!ignored.has(s)) out.add(s);
  }
  return out;
}

/** Same story if they share 2+ words covering 60% of the shorter one, or 3+ covering 40%. */
export function sameStory(a: Set<string>, b: Set<string>): boolean {
  if (!a.size || !b.size) return false;
  let shared = 0;
  a.forEach((w) => {
    if (b.has(w)) shared++;
  });
  const overlap = shared / Math.min(a.size, b.size);
  return (shared >= MIN_SHARED && overlap >= MIN_OVERLAP) || (shared >= MANY_SHARED && overlap >= MANY_OVERLAP);
}
