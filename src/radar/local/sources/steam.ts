import { norm } from '../../../lib/deezer';
import { get } from '../feeds';
import { shortDate, toPlainText, truncate } from '../text';
import { item, type ContentSource, type FetchedItem } from './types';

/*
 * Steam's public store API (no key; it's what the store's own pages call, so keep it gentle).
 * - Deals: the store's specials, 50% off or more (100% = free to keep), priced for Turkey.
 * - Games a topic follows: price drops, release day, and the developers' announcements (patch notes,
 *   updates) as ARTICLE cards, so the TL;DR and the reader work on them.
 * GAME cards link to the store page with a #deal / #out suffix, so a new sale is a new card.
 */

const STORE = 'https://store.steampowered.com';
const EVERY = 6 * 3600_000;
const MIN_DEAL = 50;
const MAX_DEALS = 8;
const CC = 'cc=tr&l=english';

let last = 0;
/** One store call, at most one a second (the store allows ~200 per 5 minutes). */
export async function steam<T>(url: string): Promise<T> {
  const wait = Math.max(0, last + 1000 - Date.now());
  last = Date.now() + wait;
  if (wait) await new Promise((r) => setTimeout(r, wait));
  return JSON.parse(await get(url, 15_000, 'application/json')) as T;
}

export type Special = {
  id: number;
  type?: number; // 0 = a game, 1 = a bundle
  name: string;
  discounted?: boolean;
  discount_percent?: number;
  original_price?: number | null; // cents
  final_price?: number;
  currency?: string;
  large_capsule_image?: string;
  header_image?: string;
  discount_expiration?: number; // unix seconds
};

export type Details = {
  steam_appid: number;
  name: string;
  is_free?: boolean;
  short_description?: string;
  header_image?: string;
  developers?: string[];
  publishers?: string[];
  genres?: { description: string }[];
  screenshots?: { id: number; path_thumbnail: string; path_full: string }[];
  movies?: { id: number; name: string; thumbnail: string; hls_h264?: string }[];
  price_overview?: { currency: string; initial: number; final: number; discount_percent: number; final_formatted?: string; initial_formatted?: string };
  release_date?: { coming_soon: boolean; date: string };
  metacritic?: { score: number; url?: string };
  recommendations?: { total: number };
  platforms?: { windows?: boolean; mac?: boolean; linux?: boolean };
};

export type News = { gid: string; title: string; url: string; author?: string; contents?: string; date: number; feedname?: string };

/* ── pure (tested) ── */

const SYMBOL: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', TRY: '₺' };
/** 1299, "USD" → "$12.99" */
export const money = (cents: number, currency = 'USD') => `${SYMBOL[currency] ?? `${currency} `}${(cents / 100).toFixed(2)}`;

/** Steam's release dates: "21 Nov, 2026", "Nov 21, 2026", "Q1 2027", "Coming soon" → ms or NaN. */
export function releaseDay(s: string | undefined): number {
  if (!s) return NaN;
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const m = s.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})/) ?? s.match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (!m) return NaN;
  const [day, mon] = /\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]];
  const i = months.indexOf(mon.toLowerCase());
  return i < 0 ? NaN : Date.UTC(Number(m[3]), i, Number(day), 12);
}

export const appUrl = (id: number) => `${STORE}/app/${id}`;
/** A GAME card's link → the app id */
export const appIdOf = (url: string) => Number(url.match(/steampowered\.com\/app\/(\d+)/)?.[1]) || null;

/** A sale card: one per game and discount (a deeper cut later is a new card). */
export function dealItem(d: Special): FetchedItem | null {
  const pct = d.discount_percent ?? 0;
  if (d.type === 1 || !d.name || pct < MIN_DEAL) return null;
  const free = pct === 100;
  const until = d.discount_expiration ? shortDate(d.discount_expiration * 1000) : null;
  const price = d.final_price != null ? money(d.final_price, d.currency) : null;
  const was = d.original_price ? money(d.original_price, d.currency) : null;
  return item({
    type: 'GAME',
    sourceName: 'Steam',
    title: free ? `🎁 ${d.name} is free to keep` : `${d.name}: −${pct}%`,
    url: `${appUrl(d.id)}#deal-${pct}`,
    thumbnailUrl: d.header_image ?? d.large_capsule_image ?? null,
    author: [free ? 'Free to keep' : price && (was ? `${price} (was ${was})` : price), until && `until ${until}`].filter(Boolean).join(' · '),
    score: pct,
    publishedAt: Date.now(),
  });
}

/** A followed game's own cards: on sale now, out now (or soon). */
export function gameItems(g: Details, now = Date.now()): FetchedItem[] {
  const out: FetchedItem[] = [];
  const p = g.price_overview;
  if (p && p.discount_percent > 0)
    out.push(
      item({
        type: 'GAME',
        sourceName: 'Steam',
        title: `${g.name}: −${p.discount_percent}%`,
        url: `${appUrl(g.steam_appid)}#deal-${p.discount_percent}`,
        thumbnailUrl: g.header_image ?? null,
        author: `${money(p.final, p.currency)} (was ${money(p.initial, p.currency)})`,
        score: p.discount_percent,
        publishedAt: now,
      }),
    );
  const day = releaseDay(g.release_date?.date);
  if (!Number.isNaN(day)) {
    const out_ = !g.release_date?.coming_soon && now - day <= 14 * 86_400_000 && day <= now + 86_400_000;
    const soon = g.release_date?.coming_soon && day - now <= 14 * 86_400_000 && day > now;
    if (out_ || soon)
      out.push(
        item({
          type: 'GAME',
          sourceName: 'Steam',
          title: out_ ? `${g.name} is out` : `${g.name} comes out ${shortDate(day)}`,
          snippet: truncate(g.short_description ?? null, 300),
          url: `${appUrl(g.steam_appid)}#${out_ ? 'out' : 'soon'}`,
          thumbnailUrl: g.header_image ?? null,
          author: [out_ ? 'Out now' : 'Coming soon', p ? money(p.final, p.currency) : g.is_free ? 'Free to play' : null].filter(Boolean).join(' · '),
          publishedAt: now,
        }),
      );
  }
  return out;
}

/** The developers' own posts (not press coverage): ARTICLE cards with the game's picture. */
export function newsItems(game: { name: string; header?: string | null }, news: News[], since: number): FetchedItem[] {
  return news
    .filter((n) => n.feedname === 'steam_community_announcements' && n.date * 1000 >= since)
    .map((n) =>
      item({
        type: 'ARTICLE',
        sourceName: 'Steam',
        title: `${game.name}: ${n.title}`,
        snippet: truncate(toPlainText((n.contents ?? '').replace(/\[\/?[a-z0-9*]+(=[^\]]*)?\]/gi, ' ').replace(/\{STEAM_CLAN_IMAGE\}\S*/g, '')), 300),
        url: n.url,
        thumbnailUrl: game.header ?? null,
        author: n.author || null,
        publishedAt: n.date * 1000,
      }),
    );
}

/* ── the source ── */

/** "Hollow Knight" → app id, remembered across runs: an exact name first, else the store's best hit. */
async function appId(name: string, cache: Record<string, string>): Promise<number | null> {
  const k = `steam:app:${norm(name)}`;
  if (cache[k]) return Number(cache[k]);
  const { items } = await steam<{ items?: { id: number; name: string; type?: string }[] }>(`${STORE}/api/storesearch/?term=${encodeURIComponent(name)}&${CC}`);
  const apps = (items ?? []).filter((i) => !i.type || i.type === 'app');
  const hit = apps.find((i) => norm(i.name) === norm(name)) ?? apps[0];
  if (!hit) return null;
  cache[k] = String(hit.id);
  return hit.id;
}

export async function details(id: number): Promise<Details | null> {
  const r = await steam<Record<string, { success: boolean; data?: Details }>>(`${STORE}/api/appdetails?appids=${id}&${CC}`);
  return r[String(id)]?.success ? (r[String(id)].data ?? null) : null;
}

export async function news(id: number, count = 5): Promise<News[]> {
  const r = await steam<{ appnews?: { newsitems?: News[] } }>(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${id}&count=${count}&maxlength=600&format=json`);
  return r.appnews?.newsitems ?? [];
}

export const steamGames: ContentSource = {
  id: 'steam',
  async fetch(topic, ctx) {
    const out: FetchedItem[] = [];
    if (topic.sources.steamDeals && ctx.throttle.tryAcquire(`steam:${topic.id}:deals`, EVERY)) {
      try {
        const r = await steam<{ specials?: { items?: Special[] } }>(`${STORE}/api/featuredcategories?${CC}`);
        const deals = (r.specials?.items ?? []).map(dealItem).filter((x): x is FetchedItem => !!x);
        out.push(...deals.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, MAX_DEALS));
      } catch (e) {
        console.warn('Radar: Steam deals failed', e);
      }
    }
    for (const name of (topic.sources.steamGames ?? []).map((s) => s.trim()).filter(Boolean)) {
      if (!ctx.throttle.tryAcquire(`steam:${topic.id}:${norm(name)}`, EVERY)) continue;
      try {
        const id = await appId(name, ctx.cache);
        if (!id) {
          console.warn(`Radar: Steam doesn't know "${name}"`);
          continue;
        }
        const g = await details(id);
        if (!g) continue;
        out.push(...gameItems(g));
        out.push(...newsItems({ name: g.name, header: g.header_image }, await news(id).catch(() => []), ctx.since));
      } catch (e) {
        console.warn(`Radar: Steam ${name} failed`, e);
      }
    }
    return out;
  },
};

/** "Very Positive · 92% of 120K reviews" for the game page. */
export async function reviews(id: number): Promise<{ label: string; positive: number; total: number } | null> {
  const r = await steam<{ query_summary?: { review_score_desc?: string; total_positive?: number; total_reviews?: number } }>(
    `${STORE}/appreviews/${id}?json=1&language=all&purchase_type=all&num_per_page=0`,
  );
  const q = r.query_summary;
  return q?.total_reviews ? { label: q.review_score_desc ?? '', positive: q.total_positive ?? 0, total: q.total_reviews } : null;
}
