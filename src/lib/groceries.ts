import * as Location from 'expo-location';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getSetting, setSetting } from './db';

/*
 * The grocery list, with prices from marketfiyati.org.tr: the government's price comparison site
 * (TÜBİTAK + the Central Bank) for A101, BİM, ŞOK, Migros, CarrefourSA, Hakmar and Tarım Kredi,
 * per branch. No AI at all: the site answers, and plain math finds the cheapest. Costs nothing.
 *
 * The API isn't documented; it's what the site itself calls. Format from open-source projects that
 * checked it live (hilsst/marketkiyas, market-fiyati-mcp-server):
 *  - POST /api/v2/nearest {latitude, longitude, distance (km)} → branches [{id, sellerName, marketName, location:{lat,lon}}]
 *  - POST /api/v2/search {keywords, pages, size, latitude, longitude, distance, depots:[branch ids]}
 *  - POST /api/v2/searchByIdentity {identity, identityType:"id", depots, …} → one product
 * Without branch ids the search ignores the location and answers with Kadıköy prices, so we always
 * ask for the nearest branches first.
 */

const API = 'https://api.marketfiyati.org.tr/api/v2';
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36';

// ── the chains ──

export const CHAINS: { key: string; name: string; color: string }[] = [
  { key: 'bim', name: 'BİM', color: '#E30613' },
  { key: 'a101', name: 'A101', color: '#00A0E3' },
  { key: 'sok', name: 'ŞOK', color: '#FFC20E' },
  { key: 'migros', name: 'Migros', color: '#F28C00' },
  { key: 'carrefour', name: 'CarrefourSA', color: '#3B82F6' },
  { key: 'hakmar', name: 'Hakmar', color: '#E2231A' },
  { key: 'tarim', name: 'Tarım Kredi', color: '#2E9E4F' },
];
/** "bim", "BIM", "şok", "carrefoursa", "tarim_kredi"… → one of CHAINS' keys */
export function chainKey(raw: string): string {
  const s = raw
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/[^a-z0-9]/g, '');
  return CHAINS.find((c) => s.startsWith(c.key) || s.includes(c.key))?.key ?? s;
}
export const chainOf = (raw: string) => CHAINS.find((c) => c.key === chainKey(raw)) ?? { key: chainKey(raw), name: raw.toUpperCase(), color: '#999898' };

// ── data ──

export type Branch = { id: string; name: string; chain: string; lat: number | null; lon: number | null };
export type BranchPrice = { branchId: string; branchName: string; chain: string; price: number; unitPrice: string | null; regular: number | null; updated: string | null };
export type Product = { id: string; title: string; brand: string | null; image: string | null; size: string | null; prices: BranchPrice[] };
export type Pick = { id: string; title: string; brand: string | null; image: string | null; size: string | null };

export type Item = {
  id: string;
  text: string; // what you typed: "süt", "yumurta 30'lu"
  done: boolean;
  pick: Pick | null; // the exact product you chose (remembered for next time)
  addedAt: number;
};

export type Place = { lat: number; lon: number; label: string; at: number };
export type GrocerySettings = { distanceKm: number; place: Place | null };

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d,.-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown) => (v === null || v === undefined ? null : String(v).trim() || null);

async function post<T>(path: string, body: object): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(`${API}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA, 'Cache-Control': 'no-cache' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`The price site answered ${res.status}. Try again in a bit.`);
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw new Error("The price site didn't answer. Check your connection.");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export function parseBranch(raw: Record<string, unknown>): Branch | null {
  const id = str(raw.id ?? raw.depotId);
  const chain = str(raw.marketName ?? raw.marketAdi);
  if (!id || !chain) return null;
  const loc = (raw.location ?? {}) as Record<string, unknown>;
  return { id, name: str(raw.sellerName ?? raw.depotName ?? raw.name) ?? id, chain: chainKey(chain), lat: num(loc.lat ?? raw.latitude), lon: num(loc.lon ?? raw.longitude) };
}

export function parseProduct(raw: Record<string, unknown>): Product | null {
  const id = str(raw.id);
  const title = str(raw.title);
  if (!id || !title) return null;
  const prices: BranchPrice[] = [];
  for (const e of (raw.productDepotInfoList as Record<string, unknown>[] | undefined) ?? []) {
    const price = num(e.price);
    const branchId = str(e.depotId);
    const chain = str(e.marketAdi);
    if (!price || price <= 0 || !branchId || !chain) continue;
    const regular = e.discount ? num(e.discountlessPrice) : null;
    prices.push({
      branchId,
      branchName: str(e.depotName) ?? branchId,
      chain: chainKey(chain),
      price,
      unitPrice: str(e.unitPrice),
      regular: regular && regular > price ? regular : null,
      updated: str(e.indexTime), // "29.10.2026 09:15"
    });
  }
  prices.sort((a, b) => a.price - b.price);
  return { id, title, brand: str(raw.brand), image: str(raw.imageUrl), size: str(raw.refinedVolumeOrWeight), prices };
}

const products = (data: { content?: Record<string, unknown>[] } | null) => (data?.content ?? []).map(parseProduct).filter((p): p is Product => !!p && p.prices.length > 0);

// ── settings and the list (kept on the phone) ──

const DEFAULTS: GrocerySettings = { distanceKm: 2, place: null };
const json = <T,>(s: string, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
};
export const getGrocerySettings = async (db: SQLiteDatabase): Promise<GrocerySettings> => ({ ...DEFAULTS, ...json(await getSetting(db, 'groceries.settings', ''), {}) });
export const saveGrocerySettings = (db: SQLiteDatabase, s: GrocerySettings) => setSetting(db, 'groceries.settings', JSON.stringify(s));
export const getList = async (db: SQLiteDatabase): Promise<Item[]> => json(await getSetting(db, 'groceries.list', ''), []);
export const saveList = (db: SQLiteDatabase, list: Item[]) => setSetting(db, 'groceries.list', JSON.stringify(list));

/** Remembered picks: next time you add "süt", your usual milk is already chosen. */
export const getPicks = async (db: SQLiteDatabase): Promise<Record<string, Pick>> => json(await getSetting(db, 'groceries.picks', ''), {});
export const rememberPick = async (db: SQLiteDatabase, text: string, pick: Pick | null) => {
  const all = await getPicks(db);
  const key = text.trim().toLowerCase();
  if (pick) all[key] = pick;
  else delete all[key];
  await setSetting(db, 'groceries.picks', JSON.stringify(all));
};

/** Where you are: the phone's location (asked once), else the last place it knew. */
export async function locate(db: SQLiteDatabase): Promise<Place> {
  const s = await getGrocerySettings(db);
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    if (s.place) return s.place;
    throw new Error('Lifelog needs your location once to find the markets near you (Settings → Apps → Lifelog → Location).');
  }
  const pos = (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 })) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  let label = 'Near you';
  try {
    const [a] = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    label = [a?.district ?? a?.subregion, a?.city].filter(Boolean).join(', ') || label;
  } catch {
    /* the name is only for show */
  }
  const place = { lat: pos.coords.latitude, lon: pos.coords.longitude, label, at: Date.now() };
  await saveGrocerySettings(db, { ...s, place });
  return place;
}

// ── the price site ──

const branchCache = new Map<string, { at: number; branches: Branch[] }>();

/** The chain markets within your distance (remembered for an hour). */
export async function nearestBranches(place: Place, km: number): Promise<Branch[]> {
  const key = `${place.lat.toFixed(3)},${place.lon.toFixed(3)},${km}`;
  const hit = branchCache.get(key);
  if (hit && Date.now() - hit.at < 3600_000) return hit.branches;
  const data = await post<unknown>('nearest', { latitude: place.lat, longitude: place.lon, distance: km });
  const rows = (Array.isArray(data) ? data : ((data as { content?: unknown[] })?.content ?? [])) as Record<string, unknown>[];
  const branches = rows.map(parseBranch).filter((b): b is Branch => !!b);
  branchCache.set(key, { at: Date.now(), branches });
  return branches;
}

const where = (place: Place, km: number, branches: Branch[]) => ({ latitude: place.lat, longitude: place.lon, distance: km, depots: branches.map((b) => b.id) });

/** Products matching what you typed, cheapest first (prices only at the branches near you). */
export async function searchProducts(text: string, place: Place, km: number, branches: Branch[]): Promise<Product[]> {
  const data = await post<{ content?: Record<string, unknown>[] }>('search', { keywords: text, pages: 0, size: 24, ...where(place, km, branches) });
  const near = new Set(branches.map((b) => b.id));
  return products(data)
    .map((p) => ({ ...p, prices: near.size ? p.prices.filter((x) => near.has(x.branchId)) : p.prices }))
    .filter((p) => p.prices.length)
    .sort((a, b) => a.prices[0].price - b.prices[0].price);
}

/** Today's prices for a product you picked. */
export async function productPrices(pick: Pick, place: Place, km: number, branches: Branch[]): Promise<Product | null> {
  const data = await post<{ content?: Record<string, unknown>[] }>('searchByIdentity', { identity: pick.id, identityType: 'id', keywords: pick.title, ...where(place, km, branches) });
  const near = new Set(branches.map((b) => b.id));
  const p = products(data).find((x) => x.id === pick.id) ?? null;
  return p && near.size ? { ...p, prices: p.prices.filter((x) => near.has(x.branchId)) } : p;
}

// ── the basket ──

export type Priced = { item: Item; product: Product | null; options: Product[]; error?: string };

export type Basket = {
  /** one shop for everything: per chain, the total of what it has (cheapest branch per item) */
  chains: { chain: string; total: number; has: number; missing: string[] }[];
  /** every item where it's cheapest */
  split: { total: number; stops: { chain: string; items: { text: string; price: number }[] }[] };
  priced: number; // items with a price
};

/** Cheapest price of a product at one chain's branches near you. */
const at = (p: Product, chain: string) => p.prices.filter((x) => x.chain === chain).reduce<number | null>((m, x) => (m === null || x.price < m ? x.price : m), null);

export function basket(rows: Priced[]): Basket {
  const open = rows.filter((r) => !r.item.done && r.product);
  const chains = CHAINS.map((c) => {
    let total = 0;
    let has = 0;
    const missing: string[] = [];
    for (const r of open) {
      // your pick if this chain has it, else the cheapest similar thing it has
      const own = at(r.product!, c.key);
      const alt = own ?? r.options.map((o) => at(o, c.key)).reduce<number | null>((m, x) => (x !== null && (m === null || x < m) ? x : m), null);
      if (alt === null) missing.push(r.item.text);
      else {
        total += alt;
        has++;
      }
    }
    return { chain: c.key, total, has, missing };
  })
    .filter((c) => c.has > 0)
    .sort((a, b) => b.has - a.has || a.total - b.total); // the most complete first, then the cheapest
  const stops = new Map<string, { text: string; price: number }[]>();
  let total = 0;
  for (const r of open) {
    const best = r.product!.prices[0];
    total += best.price;
    stops.set(best.chain, [...(stops.get(best.chain) ?? []), { text: r.item.text, price: best.price }]);
  }
  return {
    chains,
    split: { total, stops: [...stops.entries()].map(([chain, items]) => ({ chain, items })).sort((a, b) => b.items.length - a.items.length) },
    priced: open.length,
  };
}

/** Prices for the whole list, one item after another (gently: it's someone else's server). */
export async function priceList(db: SQLiteDatabase, list: Item[], onItem: (p: Priced) => void): Promise<{ place: Place; branches: Branch[] }> {
  const s = await getGrocerySettings(db);
  const place = await locate(db);
  const branches = await nearestBranches(place, s.distanceKm);
  if (!branches.length) throw new Error(`No chain markets within ${s.distanceKm} km. Try a bigger distance.`);
  for (const item of list.filter((i) => !i.done)) {
    try {
      const options = await searchProducts(item.text, place, s.distanceKm, branches);
      let product = item.pick ? (options.find((o) => o.id === item.pick!.id) ?? (await productPrices(item.pick, place, s.distanceKm, branches))) : null;
      product ??= options[0] ?? null;
      onItem({ item, product, options });
    } catch (e) {
      onItem({ item, product: null, options: [], error: e instanceof Error ? e.message : String(e) });
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  return { place, branches };
}

/** 1234.5 → "1.234,50 ₺" (by hand: the phone's JS engine is unreliable with locale formats) */
export const tl = (n: number) => {
  const [int, dec] = n.toFixed(2).split('.');
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec} ₺`;
};
