import { get } from './feeds';
import { races, startOf, type Race, type Result } from './sources/f1';

/*
 * The F1 page: one race's full result, the drivers' championship, and the next race.
 * Jolpica (Ergast's successor), no key; cached in memory for a few minutes.
 */

export type Row = { pos: string; driver: string; code: string | null; team: string; gap: string; points: string; fastest: boolean };
export type Standing = { pos: string; driver: string; team: string; points: string; wins: string };
export type F1Page = { race: Race | null; rows: Row[]; standings: Standing[]; next: Race | null };

/** A SPORT card's link → which race it's about ("…#results-2026-22" → 2026, 22). Old cards: the latest. */
export function raceOf(url: string): { kind: 'results' | 'next'; season: string | null; round: string | null } {
  const m = url.match(/#(results|next)(?:-(\d{4})-(\d+))?$/);
  return { kind: m?.[1] === 'next' ? 'next' : 'results', season: m?.[2] ?? null, round: m?.[3] ?? null };
}

export function toRows(results: Result[]): Row[] {
  return results.map((r) => ({
    pos: r.position ?? '',
    driver: [r.Driver?.givenName, r.Driver?.familyName].filter(Boolean).join(' '),
    code: r.Driver?.code ?? null,
    team: r.Constructor?.name ?? '',
    // the winner's race time, everyone else's gap, or why they stopped ("+1 Lap", "Engine")
    gap: r.Time?.time ?? (r.status && r.status !== 'Finished' ? r.status : ''),
    points: r.points ?? '0',
    fastest: r.FastestLap?.rank === '1',
  }));
}

type StandingsRaw = { MRData?: { StandingsTable?: { StandingsLists?: { DriverStandings?: Raw[] }[] } } };
type Raw = Record<string, any>;

export function toStandings(raw: StandingsRaw): Standing[] {
  return (raw.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings ?? []).map((d) => ({
    pos: d.position ?? d.positionText ?? '',
    driver: [d.Driver?.givenName, d.Driver?.familyName].filter(Boolean).join(' '),
    team: d.Constructors?.[0]?.name ?? '',
    points: d.points ?? '0',
    wins: d.wins ?? '0',
  }));
}

/** "in 2d 5h", "in 3h 20m", "now" */
export function countdown(to: number, now = Date.now()): string {
  const min = Math.round((to - now) / 60_000);
  if (min <= 0) return 'now';
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  return d ? `in ${d}d ${h}h` : h ? `in ${h}h ${min % 60}m` : `in ${min}m`;
}

let cache: { key: string; at: number; page: F1Page } | null = null;

export async function f1Page(season: string | null, round: string | null): Promise<F1Page> {
  const key = `${season}-${round}`;
  if (cache?.key === key && Date.now() - cache.at < 10 * 60_000) return cache.page;
  const path = season && round ? `/${season}/${round}/results.json` : '/current/last/results.json';
  const [[race], standings, [next]] = await Promise.all([
    races(path).catch(() => [] as Race[]),
    get(`https://api.jolpi.ca/ergast/f1/${season ?? 'current'}/driverStandings.json`, 15_000, 'application/json')
      .then((t) => toStandings(JSON.parse(t)))
      .catch(() => [] as Standing[]),
    races('/current/next.json').catch(() => [] as Race[]),
  ]);
  const page = { race: race ?? null, rows: toRows(race?.Results ?? []), standings, next: next && startOf(next) > Date.now() ? next : null };
  cache = { key, at: Date.now(), page };
  return page;
}
