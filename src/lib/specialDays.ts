/*
 * What today is in Turkey and the world, for the radio's hosts: fixed-date days (Öğretmenler Günü, 29 Ekim, World
 * Cat Day…), the ones on a weekday (Mother's Day: May's 2nd Sunday) and the bayrams, whose dates move (Nager.Date's
 * free list of Turkey's public holidays). `solemn` days are remembered with respect, never joked about.
 */

export type SpecialDay = { name: string; solemn?: boolean };

/** "MM-DD" → the day. */
const FIXED: Record<string, SpecialDay> = {
  '01-01': { name: 'Yılbaşı (New Year\'s Day)' },
  '02-14': { name: 'Sevgililer Günü (Valentine\'s Day)' },
  '03-08': { name: 'Dünya Kadınlar Günü (International Women\'s Day)' },
  '03-14': { name: 'Tıp Bayramı (Turkey\'s Medicine Day)' },
  '03-18': { name: 'Çanakkale Zaferi ve Şehitleri Anma Günü', solemn: true },
  '03-21': { name: 'Nevruz' },
  '04-01': { name: 'April Fools\' Day' },
  '04-23': { name: 'Ulusal Egemenlik ve Çocuk Bayramı (23 Nisan)' },
  '05-01': { name: 'Emek ve Dayanışma Günü (1 Mayıs)' },
  '05-19': { name: 'Atatürk\'ü Anma, Gençlik ve Spor Bayramı (19 Mayıs)' },
  '06-21': { name: 'the longest day of the year (summer solstice)' },
  '07-15': { name: 'Demokrasi ve Millî Birlik Günü (15 Temmuz)', solemn: true },
  '08-08': { name: 'World Cat Day (Şemistan\'s day)' },
  '08-30': { name: 'Zafer Bayramı (30 Ağustos)' },
  '10-04': { name: 'World Animal Day' },
  '10-29': { name: 'Cumhuriyet Bayramı (29 Ekim)' },
  '11-10': { name: 'Atatürk\'ü Anma Günü (10 Kasım)', solemn: true },
  '11-24': { name: 'Öğretmenler Günü (Teachers\' Day)' },
  '12-21': { name: 'the longest night of the year (winter solstice)' },
  '12-31': { name: 'Yılbaşı Gecesi (New Year\'s Eve)' },
};

const pad = (n: number) => String(n).padStart(2, '0');
const md = (d: Date) => `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The n-th Sunday of a month (1-based), as "MM-DD". */
function nthSunday(year: number, month: number, n: number): string {
  const first = new Date(year, month - 1, 1).getDay(); // 0 = Sunday
  return `${pad(month)}-${pad(1 + ((7 - first) % 7) + (n - 1) * 7)}`;
}

/** Today's special days from the calendar (fixed and weekday-based); the bayrams come from `holidaysOn`. */
export function specialDaysOn(d: Date): SpecialDay[] {
  const today = md(d);
  const out: SpecialDay[] = [];
  if (FIXED[today]) out.push(FIXED[today]);
  if (today === nthSunday(d.getFullYear(), 5, 2)) out.push({ name: 'Anneler Günü (Mother\'s Day)' });
  if (today === nthSunday(d.getFullYear(), 6, 3)) out.push({ name: 'Babalar Günü (Father\'s Day)' });
  // the 256th day of the year: Programmers' Day (13 September, 12th in leap years)
  const start = new Date(d.getFullYear(), 0, 1);
  if (Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - start.getTime()) / 86_400_000) + 1 === 256)
    out.push({ name: 'Programmers\' Day (the 256th day of the year)' });
  return out;
}

/** Nager.Date's public holidays (the bayrams move every year) → the ones on this day, without the fixed ones above. */
export function holidaysOn(list: { date?: string; localName?: string; name?: string }[], d: Date): SpecialDay[] {
  const ymd = `${d.getFullYear()}-${md(d)}`;
  return list
    .filter((h) => h.date === ymd && !FIXED[md(d)])
    .map((h) => ({ name: [h.localName, h.name].filter(Boolean).join(' / ') }));
}

/** Everything today is, or []. */
export async function todaysDays(now = Date.now()): Promise<SpecialDay[]> {
  const d = new Date(now);
  const days = specialDaysOn(d);
  try {
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${d.getFullYear()}/TR`);
    if (res.ok) days.push(...holidaysOn((await res.json()) as { date?: string; localName?: string; name?: string }[], d));
  } catch {}
  return days;
}
