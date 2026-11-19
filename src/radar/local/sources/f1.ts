import { get } from '../feeds';
import { item, type ContentSource, type FetchedItem } from './types';

/*
 * Formula 1 from Jolpica (the free successor of the Ergast API, no key): the podium of the last
 * race and the next Grand Prix with its start in Istanbul time. SPORT cards, one per race each.
 */

const EVERY = 6 * 3600_000;
const API = 'https://api.jolpi.ca/ergast/f1';

export type Result = {
  position?: string;
  points?: string;
  status?: string;
  Time?: { time?: string };
  FastestLap?: { rank?: string };
  Driver?: { givenName?: string; familyName?: string; code?: string };
  Constructor?: { name?: string };
};
export type Race = {
  season?: string;
  round?: string;
  url?: string;
  raceName?: string;
  date?: string; // "2026-11-22"
  time?: string; // "04:00:00Z"
  Circuit?: { circuitName?: string; Location?: { locality?: string; country?: string } };
  Results?: Result[];
};

export const races = async (path: string) =>
  ((JSON.parse(await get(`${API}${path}`, 15_000, 'application/json')) as { MRData?: { RaceTable?: { Races?: Race[] } } }).MRData?.RaceTable?.Races ?? []);

/** The race's start in ms (midday UTC when the time isn't known yet). */
export const startOf = (r: Race) => Date.parse(`${r.date}T${r.time ?? '12:00:00Z'}`);

/** "Sat 22 Nov, 07:00" in Istanbul time */
export const istanbul = (t: number) =>
  new Date(t + 3 * 3600_000).toLocaleString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const where = (r: Race) => [r.Circuit?.circuitName, r.Circuit?.Location?.country].filter(Boolean).join(', ');
const pageOf = (r: Race) => r.url ?? `https://en.wikipedia.org/wiki/${r.season}_Formula_One_World_Championship`;

export function resultItem(r: Race): FetchedItem | null {
  const podium = (r.Results ?? []).slice(0, 3);
  if (!r.raceName || !podium.length) return null;
  const name = (x: Result) => x.Driver?.familyName ?? '?';
  return item({
    type: 'SPORT',
    sourceName: 'F1',
    title: `🏁 ${r.raceName}: ${podium[0].Driver?.givenName ?? ''} ${name(podium[0])} wins`.replace(/\s+/g, ' '),
    snippet: podium.map((x, i) => `${i + 1}. ${name(x)} (${x.Constructor?.name ?? '?'})`).join(' · ') + (where(r) ? ` — ${where(r)}` : ''),
    url: `${pageOf(r)}#results-${r.season}-${r.round}`, // one card for the result… (season and round for the F1 page)
    publishedAt: Date.now(),
  });
}

export function nextItem(r: Race): FetchedItem | null {
  if (!r.raceName || !r.date) return null;
  const start = startOf(r);
  return item({
    type: 'SPORT',
    sourceName: 'F1',
    title: `Next: ${r.raceName}`,
    snippet: `${istanbul(start)} (Istanbul time)${r.time ? '' : ', time not set yet'}${where(r) ? ` · ${where(r)}` : ''}`,
    url: `${pageOf(r)}#next-${r.season}-${r.round}`, // …and one for the countdown, so both show up once
    publishedAt: Date.now(),
  });
}

export const f1: ContentSource = {
  id: 'f1',
  async fetch(topic, ctx) {
    if (!topic.sources.f1 || !ctx.throttle.tryAcquire(`f1:${topic.id}`, EVERY)) return [];
    const out: FetchedItem[] = [];
    try {
      const [last] = await races('/current/last/results.json');
      // only fresh results: a card about a race from two weeks ago is old news
      if (last && Date.now() - startOf(last) < 4 * 86_400_000) {
        const it = resultItem(last);
        if (it) out.push(it);
      }
      const [next] = await races('/current/next.json');
      // the countdown appears in race week
      if (next && startOf(next) - Date.now() < 7 * 86_400_000) {
        const it = nextItem(next);
        if (it) out.push(it);
      }
    } catch (e) {
      console.warn('Radar: F1 failed', e);
    }
    return out;
  },
};
