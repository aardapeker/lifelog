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

/** Plain-text extracts keep section titles and blank lines: keep the prose, one paragraph break at most. */
export const tidy = (text: string) =>
  text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l && !/^=+.*=+$/.test(l))
    .join('\n\n')
    .trim();

