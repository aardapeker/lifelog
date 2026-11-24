import { toMoments, type Moment } from '../radar/local/sources/onThisDay';

/*
 * Neon FM's Time Machine: real events from this day in the 80s (Wikipedia's "On this day", all events, not only
 * the editors' picks, since few of those are from the 80s). Free, no key. Pure picking is tested.
 */

/** Up to `n` events from 1980–1989, spread over the decade, newest first. */
export function eighties(all: Moment[], n = 3): Moment[] {
  const pool = all.filter((m) => m.year >= 1980 && m.year <= 1989);
  if (pool.length <= n) return pool;
  return Array.from({ length: n }, (_, i) => pool[Math.round((i * (pool.length - 1)) / (n - 1))]);
}

/** "On this day in 1985: …" lines for the writer, or [] (offline, a quiet day in the 80s). */
export async function eightiesToday(now = Date.now()): Promise<string[]> {
  const d = new Date(now);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const res = await fetch(`https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${mm}/${dd}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) return [];
  const json = (await res.json()) as { events?: Parameters<typeof toMoments>[0] };
  return eighties(toMoments(json.events ?? [])).map((m) => `${m.year}: ${m.text}`);
}
