import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { cancelNotify, notify } from './notify';
import * as Notifications from 'expo-notifications';
import { DB_NAME, getSetting, setSetting } from './db';

/*
 * What the AI costs, counted by the app itself: every call saves its token counts here
 * (Gemini and Claude say how many they used in every reply), and the Usage section in
 * Insights turns them into money with the price table below. An estimate, not the bill:
 * discounts, rounding and other apps on the same key (Radar) aren't in it.
 */

export type Feature =
  | 'chat'
  | 'radio'
  | 'voice'
  | 'reads'
  | 'research'
  | 'daysoff'
  | 'checkins'
  | 'background'
  | 'photos'
  | 'voicenotes'
  | 'index'
  | 'arena'
  | 'other';

export const FEATURES: Record<Feature, { label: string; icon: ComponentProps<typeof Ionicons>['name']; tint: string }> = {
  chat: { label: 'Chat', icon: 'chatbubble-ellipses-outline', tint: '#7FB2FF' },
  radio: { label: 'Radio scripts', icon: 'radio-outline', tint: '#FFC46B' },
  voice: { label: 'Radio voices', icon: 'mic-outline', tint: '#FF9F7A' },
  reads: { label: 'Reads', icon: 'newspaper-outline', tint: '#C79BFF' },
  research: { label: 'Looked into', icon: 'search-outline', tint: '#8FD3FF' },
  daysoff: { label: 'Days off', icon: 'partly-sunny-outline', tint: '#FFD86B' },
  checkins: { label: 'Check-ins & messages', icon: 'hand-left-outline', tint: '#6EDC9A' },
  background: { label: 'Background (facts, recaps…)', icon: 'cog-outline', tint: '#B0B0B0' },
  photos: { label: 'Photo captions', icon: 'image-outline', tint: '#FF8AC8' },
  voicenotes: { label: 'Voice notes', icon: 'recording-outline', tint: '#FF8A80' },
  index: { label: 'Search index', icon: 'compass-outline', tint: '#7FE0D0' },
  arena: { label: 'Bug Arena questions', icon: 'bug-outline', tint: '#B6F09C' },
  other: { label: 'Other', icon: 'ellipsis-horizontal-circle-outline', tint: '#B0B0B0' },
};

// ── prices (USD per 1M tokens, paid tier, standard) ──
// Checked Nov 2026 on ai.google.dev/gemini-api/docs/pricing, platform.claude.com/docs/en/about-claude/pricing and docs.x.ai.
// Gemini 3.8 prices double on Jan 1, 2027 (the `from2027` numbers).

type Price = { input: number; output: number; from2027?: { input: number; output: number } };

const PRICES: { match: RegExp; price: Price }[] = [
  { match: /3\.8-flash-lite-tts/, price: { input: 0.5, output: 6, from2027: { input: 1, output: 12 } } },
  { match: /3\.8-flash-tts/, price: { input: 0.5, output: 9, from2027: { input: 1, output: 18 } } },
  { match: /3\.1-flash-tts/, price: { input: 1, output: 20 } },
  { match: /tts/, price: { input: 0.5, output: 10 } }, // older previews: rough
  { match: /embedding/, price: { input: 0.15, output: 0 } },
  { match: /flash-lite/, price: { input: 0.3, output: 2.5 } },
  { match: /3\.8-flash/, price: { input: 0.75, output: 3.75, from2027: { input: 1.5, output: 7.5 } } },
  { match: /claude-opus/, price: { input: 4, output: 20 } },
  { match: /claude-sonnet/, price: { input: 2, output: 10 } },
  { match: /claude-haiku/, price: { input: 0.1, output: 0.5 } },
  { match: /grok-4\.3|grok-4\.20/, price: { input: 1.25, output: 2.5 } }, // docs.x.ai, Nov 2026
  { match: /grok-build|grok-code/, price: { input: 1, output: 2 } },
  { match: /grok/, price: { input: 2, output: 6 } }, // grok-4.7, 4.6, 4.5
  { match: /gemini/, price: { input: 0.75, output: 3.75 } }, // unknown Gemini: priced like Flash
];
const FALLBACK: Price = { input: 2, output: 10 };

/** Google Search grounding: 5,000 free a month (Gemini 3+), then $14 per 1,000. */
const FREE_SEARCHES = 5000;
const SEARCH_USD = 0.014;

export function priceOf(model: string, at = Date.now()): { input: number; output: number } {
  const p = PRICES.find((x) => x.match.test(model))?.price ?? FALLBACK;
  return p.from2027 && at >= Date.UTC(2027, 0, 1, 8) ? p.from2027 : p;
}

/** Price hint for the model pickers: "$0.75 in · $3.75 out per 1M". */
export const priceHint = (model: string) => {
  const p = priceOf(model);
  return `$${p.input} in · $${p.output} out per 1M tokens`;
};

// ── recording ──

let conn: Promise<SQLiteDatabase> | null = null;
const database = () => (conn ??= openDatabaseAsync(DB_NAME));

/** Saves one call's usage. Never throws: counting must never break the thing being counted. */
export function recordUsage(u: { provider: string; model: string; feature?: Feature; input?: number; output?: number; searches?: number }): void {
  (async () => {
    const db = await database();
    await db.runAsync(
      'INSERT INTO usage (at, provider, model, feature, input, output, searches) VALUES (?, ?, ?, ?, ?, ?, ?)',
      Date.now(),
      u.provider,
      u.model,
      u.feature ?? 'other',
      Math.round(u.input ?? 0),
      Math.round(u.output ?? 0),
      Math.round(u.searches ?? 0),
    );
    await checkBudget(db);
  })().catch(() => {});
}

/** Gemini's usageMetadata → tokens in / out (thinking is billed as output). */
export const geminiTokens = (m?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; toolUsePromptTokenCount?: number }) => ({
  input: (m?.promptTokenCount ?? 0) + (m?.toolUsePromptTokenCount ?? 0),
  output: (m?.candidatesTokenCount ?? 0) + (m?.thoughtsTokenCount ?? 0),
});

/** Rough tokens for text when an API doesn't say (about 4 characters each). */
export const textTokens = (s: string) => Math.ceil(s.length / 4);

// ── reading it back ──

type Row = { at: number; model: string; feature: Feature; input: number; output: number; searches: number };

export type UsageReport = {
  days: { day: number; usd: number }[]; // the last 28, oldest first
  today: number;
  month: number;
  forecast: number; // the month at this pace
  byFeature: { feature: Feature; usd: number }[];
  byModel: { model: string; usd: number; calls: number }[];
  searches: number; // this month
  dayDetail: Map<number, { feature: Feature; usd: number }[]>;
};

const midnight = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Costs per day (last 28), this month, and where the money goes. In USD. */
export async function usageReport(db: SQLiteDatabase): Promise<UsageReport> {
  const now = Date.now();
  const first = new Date(now);
  first.setDate(1);
  first.setHours(0, 0, 0, 0);
  const since = Math.min(first.getTime(), midnight(now) - 27 * 86_400_000);
  const rows = await db.getAllAsync<Row>(
    'SELECT at, model, feature, input, output, searches FROM usage WHERE at >= ? ORDER BY at',
    since,
  );

  const days = new Map<number, number>();
  for (let i = 27; i >= 0; i--) days.set(midnight(now) - i * 86_400_000, 0);
  const feat = new Map<Feature, number>();
  const models = new Map<string, { usd: number; calls: number }>();
  const dayDetail = new Map<number, Map<Feature, number>>();
  let month = 0;
  let searchesThisMonth = 0;
  let monthKey = '';

  for (const r of rows) {
    const p = priceOf(r.model, r.at);
    let usd = (r.input * p.input + r.output * p.output) / 1e6;
    // free searches are counted per calendar month
    const mk = `${new Date(r.at).getFullYear()}-${new Date(r.at).getMonth()}`;
    if (mk !== monthKey) {
      monthKey = mk;
      searchesThisMonth = 0;
    }
    for (let k = 0; k < r.searches; k++) if (++searchesThisMonth > FREE_SEARCHES) usd += SEARCH_USD;

    const d = midnight(r.at);
    if (days.has(d)) {
      days.set(d, days.get(d)! + usd);
      const detail = dayDetail.get(d) ?? new Map<Feature, number>();
      detail.set(r.feature, (detail.get(r.feature) ?? 0) + usd);
      dayDetail.set(d, detail);
    }
    if (r.at >= first.getTime()) {
      month += usd;
      feat.set(r.feature, (feat.get(r.feature) ?? 0) + usd);
      const m = models.get(r.model) ?? { usd: 0, calls: 0 };
      m.usd += usd;
      m.calls++;
      models.set(r.model, m);
    }
  }

  const dayOfMonth = new Date(now).getDate();
  const daysInMonth = new Date(new Date(now).getFullYear(), new Date(now).getMonth() + 1, 0).getDate();
  const sorted = <K,>(m: Map<K, number>) => [...m].sort((a, b) => b[1] - a[1]);
  return {
    days: [...days].map(([day, usd]) => ({ day, usd })),
    today: days.get(midnight(now)) ?? 0,
    month,
    forecast: (month / dayOfMonth) * daysInMonth,
    byFeature: sorted(feat).map(([feature, usd]) => ({ feature, usd })),
    byModel: [...models].map(([model, v]) => ({ model, ...v })).sort((a, b) => b.usd - a.usd),
    searches: rows.filter((r) => r.at >= first.getTime()).reduce((n, r) => n + r.searches, 0),
    dayDetail: new Map([...dayDetail].map(([d, m]) => [d, sorted(m).map(([feature, usd]) => ({ feature, usd }))])),
  };
}

// ── dollars → lira ──

/** Today's USD → TRY rate (European Central Bank data via Frankfurter, then a backup source), cached for a day. */
export async function usdToTry(db: SQLiteDatabase): Promise<{ rate: number; day: string } | null> {
  const today = new Date().toISOString().slice(0, 10);
  let cached: { rate?: number; day?: string } = {};
  try {
    cached = JSON.parse(await getSetting(db, 'fx.usdtry', '{}'));
  } catch {}
  if (cached.rate && cached.day === today) return { rate: cached.rate, day: cached.day };
  const sources: [string, (j: any) => number | undefined][] = [
    ['https://api.frankfurter.dev/v1/latest?base=USD&symbols=TRY', (j) => j?.rates?.TRY],
    ['https://open.er-api.com/v6/latest/USD', (j) => j?.rates?.TRY],
  ];
  for (const [url, pick] of sources) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const rate = Number(pick(await res.json()));
      if (rate > 0) {
        await setSetting(db, 'fx.usdtry', JSON.stringify({ rate, day: today }));
        return { rate, day: today };
      }
    } catch {}
  }
  return cached.rate && cached.day ? { rate: cached.rate, day: cached.day } : null; // offline: the last known rate
}

export const lira = (usd: number, rate: number) => {
  const v = usd * rate;
  return `₺${v < 10 ? v.toFixed(2) : v < 1000 ? v.toFixed(1) : Math.round(v).toLocaleString('tr-TR')}`;
};

// ── budget: warn only, never switch anything off ──

export async function getBudget(db: SQLiteDatabase): Promise<number> {
  return Number(await getSetting(db, 'usage.budget', '0')) || 0; // ₺ a month, 0 = no budget
}
export const setBudget = (db: SQLiteDatabase, tl: number) => setSetting(db, 'usage.budget', String(Math.max(0, Math.round(tl))));

let lastCheck = 0;

/** At 80% and 100% of the monthly budget: one notification each, once a month. Nothing is ever switched off. */
async function checkBudget(db: SQLiteDatabase): Promise<void> {
  if (Date.now() - lastCheck < 10 * 60_000) return; // every 10 minutes is plenty
  lastCheck = Date.now();
  const budget = await getBudget(db);
  if (!budget) return;
  const fx = await usdToTry(db);
  if (!fx) return;
  const spent = (await usageReport(db)).month * fx.rate;
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
  const warned = await getSetting(db, 'usage.warned', '');
  const level = spent >= budget ? 100 : spent >= budget * 0.8 ? 80 : 0;
  if (!level || warned === `${monthKey}:${level}` || (level === 80 && warned === `${monthKey}:100`)) return;
  await setSetting(db, 'usage.warned', `${monthKey}:${level}`);
  await notify({
    title: level === 100 ? 'AI budget reached' : 'AI budget at 80%',
    body: `About ${lira(spent / fx.rate, fx.rate)} of your ₺${budget} this month. Everything keeps working, this is just a heads-up.`,
    data: { kind: 'usage' },
  });
}
