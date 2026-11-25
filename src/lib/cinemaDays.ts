/*
 * Cinema day's rules, without the phone (so they run in tests): which deals are real and current, which fall on a
 * day, and when the weekly lookup is due again. The lookup itself is in cinemaDeals.ts.
 */

export type Deal = {
  cinema: string;
  what: string;
  /** 0 = Sunday … 6 = Saturday, for a weekly deal */
  weekday: number | null;
  /** YYYY-MM-DD, for a one-day deal */
  date: string | null;
  price: string | null;
  /** YYYY-MM-DD, the last day */
  until: string | null;
};

export type Found = { at: number; cinemas: string; deals: Deal[]; films: string[]; source: string | null };

const DAYS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  pazar: 0, pazartesi: 1, sali: 2, carsamba: 3, persembe: 4, cuma: 5, cumartesi: 6,
};
export const EN_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Wednesday", "çarşamba", "3" → 3; anything else → null. */
export function weekdayOf(v: unknown): number | null {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 && v <= 6 ? v : null;
  if (typeof v !== 'string') return null;
  const k = v
    .toLocaleLowerCase('tr')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z]/g, '');
  return k in DAYS ? DAYS[k] : null;
}

const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The model's JSON → clean deals: one with a day, not over yet (an unknown end date is kept). */
export function cleanDeals(raw: unknown, now: Date): Deal[] {
  const list = Array.isArray(raw) ? raw : [];
  const today = ymd(now);
  return list
    .map((d): Deal | null => {
      if (!d || typeof d !== 'object') return null;
      const o = d as Record<string, unknown>;
      const str = (v: unknown) => (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null' ? v.trim() : null);
      const date = str(o.date) && ymdRe.test(str(o.date)!) ? str(o.date) : null;
      const until = str(o.until) && ymdRe.test(str(o.until)!) ? str(o.until) : null;
      const deal: Deal = { cinema: str(o.cinema) ?? '', what: str(o.what) ?? '', weekday: weekdayOf(o.weekday), date, price: str(o.price), until };
      if (!deal.what || (deal.weekday === null && !deal.date)) return null;
      if ((deal.until && deal.until < today) || (deal.date && deal.date < today)) return null;
      return deal;
    })
    .filter((d): d is Deal => !!d)
    .slice(0, 6);
}

/** The deals on that day. */
export function dealsOn(deals: Deal[], day: Date): Deal[] {
  const key = ymd(day);
  return deals.filter((d) => (d.date ? d.date === key : d.weekday === day.getDay()) && (!d.until || d.until >= key));
}

/** Last Friday 00:00 (today if it's Friday): the films change then. */
function lastFriday(now: Date): number {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 2) % 7));
  return d.getTime();
}

/** Looked up again when the cinemas changed, a new film week started, or it's a week old. */
export function stale(found: Found | null, cinemas: string, now: Date): boolean {
  return !found || found.cinemas !== cinemas || found.at < lastFriday(now) || now.getTime() - found.at > 7 * 86_400_000;
}

