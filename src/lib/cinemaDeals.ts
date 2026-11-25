import type { SQLiteDatabase } from 'expo-sqlite';
import { parseJsonReply, PROVIDERS } from './chat';
import { getSetting, setSetting } from './db';
import { groundedSearch } from './gemini';
import { getKey } from './keys';
import { cleanDeals, dealsOn, EN_DAYS, stale, ymd, type Deal, type Found } from './cinemaDays';

/*
 * Cinema day on the radio: the listener's own cinemas (Settings → Music → Radio, by name: nothing about where
 * they live is in the code) and their discount days ("every Wednesday, 160 TL"), found with Gemini + Google
 * Search, the way a person would look them up. Cinema chains have no public API, and their apps' private ones are
 * off limits, so this reads public pages only.
 *
 * Once a week (and again on Fridays, when the new films open), kept in settings. A deal needs a source page and
 * an end date that hasn't passed; the hosts mention one only on its day (or the day before).
 */

const CINEMAS = 'radio.cinemas';
const CACHE = 'radio.cinemaDeals';

export const getCinemas = (db: SQLiteDatabase) => getSetting(db, CINEMAS, '');
export const setCinemas = (db: SQLiteDatabase, names: string) => setSetting(db, CINEMAS, names.trim());

async function lookUp(cinemas: string, city: string, now: Date): Promise<Found> {
  const apiKey = await getKey('gemini');
  if (!apiKey) throw new Error('no Gemini key');
  const found = await groundedSearch(
    apiKey,
    PROVIDERS.gemini.defaultModel,
    `Today is ${ymd(now)} (${EN_DAYS[now.getDay()]}). Search the web for the current ticket discounts and campaigns at these ` +
      `cinemas${city ? ` in ${city}, Turkey` : ' in Turkey'}: ${cinemas}. I want discount days (a weekday with cheaper ` +
      'tickets, a one-day offer) that are valid today or later, with the price if given, and which films are showing in ' +
      'Turkish cinemas this week. Only what current pages say; nothing from memory. Answer ONLY with JSON: ' +
      '{"deals":[{"cinema":"chain or cinema","what":"short description","weekday":"Monday…Sunday or null",' +
      '"date":"YYYY-MM-DD or null","price":"e.g. 160 TL, or null","until":"YYYY-MM-DD or null"}],"films":["title", …]}. ' +
      'If nothing reliable turns up, return empty lists.',
    'research',
  );
  // nothing backed by a page goes on air
  if (!found.sources.length) return { at: now.getTime(), cinemas, deals: [], films: [], source: null };
  const j = parseJsonReply<{ deals?: unknown; films?: unknown }>(found.text);
  const films = (Array.isArray(j.films) ? j.films : []).map((f) => String(f).trim()).filter(Boolean).slice(0, 6);
  let source: string | null = null;
  try {
    source = new URL(found.sources[0].uri).hostname.replace(/^www\./, '');
  } catch {}
  // Google's grounding links are redirects (vertexaisearch…); the page's own title is the better name then
  if (source?.includes('vertexaisearch')) source = found.sources[0].title || null;
  return { at: now.getTime(), cinemas, deals: cleanDeals(j.deals, now), films, source };
}

/**
 * The radio's notes on cinema day, or null: today's deal at the listener's cinemas (or tomorrow's), with the
 * films showing. Looks the deals up again when they're stale; a failed lookup keeps the old ones.
 */
export async function cinemaNotes(db: SQLiteDatabase, city: string, now = new Date()): Promise<string | null> {
  const cinemas = (await getCinemas(db)).trim();
  if (!cinemas) return null;
  let found: Found | null = null;
  try {
    found = JSON.parse(await getSetting(db, CACHE, '')) as Found;
  } catch {}
  if (stale(found, cinemas, now)) {
    try {
      found = await lookUp(cinemas, city, now);
      await setSetting(db, CACHE, JSON.stringify(found));
    } catch {
      if (found?.cinemas !== cinemas) return null; // another list of cinemas: the old deals aren't theirs
    }
  }
  if (!found) return null;
  const deals = cleanDeals(found.deals, now); // the cache may hold one that ended since
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const today = dealsOn(deals, now);
  const next = today.length ? [] : dealsOn(deals, tomorrow);
  if (!today.length && !next.length) return null;
  const line = (d: Deal) => `${d.what}${d.price ? `, ${d.price}` : ''}${d.cinema ? ` (${d.cinema})` : ''}${d.until ? `, until ${d.until}` : ''}`;
  return (
    `The listener's cinemas: ${cinemas}. ` +
    (today.length ? `TODAY: ${today.map(line).join('; ')}. ` : `TOMORROW (${EN_DAYS[tomorrow.getDay()]}): ${next.map(line).join('; ')}. `) +
    (found.films.length ? `Showing this week: ${found.films.join(', ')}. ` : '') +
    (found.source ? `Source: ${found.source}.` : '')
  );
}
