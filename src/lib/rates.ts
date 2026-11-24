/*
 * Today's dollar, euro and gram gold in lira, for the radio (Tuzla Arabesk FM's "piyasalar"): Truncgil's free
 * finance feed (no key), with Frankfurter (central banks, no key) as the backup for the dollar and the euro.
 * The parsing is pure, so it's tested.
 */

export type Rate = { name: string; lira: number; change: number | null };

const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const t = v.replace('%', '').replace(/\s/g, '');
  // "3.512,45" (Turkish: dots group, comma is the decimal), "42,31", or "35.5694"
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : null;
};

/** Truncgil's today.json → dollar, euro, gram gold (selling price, % change since yesterday). */
export function parseTruncgil(json: Record<string, unknown>): Rate[] {
  const pick = (keys: string[]) => keys.map((k) => json[k]).find((v) => v && typeof v === 'object') as Record<string, unknown> | undefined;
  const rate = (name: string, keys: string[]): Rate | null => {
    const r = pick(keys);
    const lira = r ? num(r.Selling ?? r.selling ?? r.Satış ?? r.Buying) : null;
    return lira ? { name, lira, change: r ? num(r.Change ?? r.change ?? r.Değişim) : null } : null;
  };
  return [rate('dollar', ['USD']), rate('euro', ['EUR']), rate('gram gold', ['GRA', 'gram-altin', 'Gram Altın', 'gram'])].filter((r): r is Rate => !!r);
}

/** "dollar 42.31 lira (+0.4% since yesterday)", one per line. */
export const ratesLine = (rates: Rate[]) =>
  rates
    .map((r) => `${r.name} ${r.lira.toFixed(2)} lira${r.change != null ? ` (${r.change > 0 ? '+' : ''}${r.change}% since yesterday)` : ''}`)
    .join('; ');

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
}

/** Today's rates, or [] when both feeds are out of reach. */
export async function todaysRates(): Promise<Rate[]> {
  const truncgil = await getJson('https://finans.truncgil.com/v4/today.json').catch(() => null);
  const rates = truncgil ? parseTruncgil(truncgil) : [];
  if (rates.some((r) => r.name === 'dollar')) return rates;
  // the backup: the central banks' rates (no gold, no change)
  const [usd, eur] = await Promise.all(
    ['usd', 'eur'].map((b) => getJson(`https://api.frankfurter.dev/v2/rates?base=${b}&quotes=try`).catch(() => null)),
  );
  const tryOf = (j: Record<string, unknown> | null) => {
    const list = Array.isArray(j) ? j : j && Array.isArray((j as { rates?: unknown }).rates) ? (j as { rates: unknown[] }).rates : null;
    const row = list?.find((x) => (x as { quote?: string }).quote?.toUpperCase() === 'TRY') as { rate?: number } | undefined;
    const obj = j && typeof j.rates === 'object' && !Array.isArray(j.rates) ? num((j.rates as Record<string, unknown>).TRY) : null;
    return row?.rate ?? obj ?? null;
  };
  return [
    ...(tryOf(usd) ? [{ name: 'dollar', lira: tryOf(usd)!, change: null }] : []),
    ...(tryOf(eur) ? [{ name: 'euro', lira: tryOf(eur)!, change: null }] : []),
    ...rates.filter((r) => r.name === 'gram gold'),
  ];
}
