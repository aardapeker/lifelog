import { get } from '../feeds';
import { item, type ContentSource, type FetchedItem } from './types';

/*
 * Earthquakes in Turkey from AFAD (the official agency, free, no key), with the USGS feed as a
 * fallback if AFAD's API is down or changes. Per topic: a minimum magnitude, and either near
 * Istanbul (300 km) or all of Turkey. QUAKE cards: magnitude, place, depth, distance from Istanbul.
 */

const EVERY = 10 * 60_000;
export const ISTANBUL = { lat: 41.01, lon: 28.98 };
const NEAR_KM = 300;
const TURKEY = { minLat: 35.5, maxLat: 42.5, minLon: 25.5, maxLon: 45 }; // and its seas

export type Quake = { id: string; mag: number; place: string; depth: number | null; lat: number; lon: number; time: number; url: string };

/** Great-circle distance in km. */
export function kmBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** AFAD's dates are Turkish time without a zone ("2026-11-19T10:12:33"). */
const afadTime = (s: string) => Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}+03:00`);

/** AFAD's event list; its field names are read loosely, since the API isn't documented. */
export function fromAfad(rows: Record<string, unknown>[]): Quake[] {
  return rows.flatMap((r) => {
    const mag = Number(r.magnitude);
    const lat = Number(r.latitude);
    const lon = Number(r.longitude);
    const time = afadTime(String(r.date ?? r.eventDate ?? ''));
    const id = String(r.eventID ?? r.eventId ?? '');
    if (!id || [mag, lat, lon, time].some(Number.isNaN)) return [];
    const where = [r.district, r.province].filter((x) => typeof x === 'string' && x.trim()).join(', ');
    return [
      {
        id: `afad:${id}`,
        mag,
        place: where || String(r.location ?? 'Turkey'),
        depth: r.depth != null ? Number(r.depth) : null,
        lat,
        lon,
        time,
        url: `https://deprem.afad.gov.tr/event-detail/${id}`,
      },
    ];
  });
}

type UsgsFeature = { id: string; properties: { mag: number; place: string; time: number; url: string }; geometry: { coordinates: [number, number, number] } };

export function fromUsgs(features: UsgsFeature[]): Quake[] {
  return features.map((f) => ({
    id: `usgs:${f.id}`,
    mag: f.properties.mag,
    place: f.properties.place,
    depth: f.geometry.coordinates[2] ?? null,
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0],
    time: f.properties.time,
    url: f.properties.url,
  }));
}

const one = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

export function toItem(q: Quake): FetchedItem {
  const km = Math.round(kmBetween(q, ISTANBUL));
  return item({
    type: 'QUAKE',
    sourceName: q.id.startsWith('afad:') ? 'AFAD' : 'USGS',
    title: `M ${one(q.mag)} earthquake · ${q.place}`,
    snippet: [q.depth != null ? `${Math.round(q.depth)} km deep` : null, `${km} km from Istanbul`].filter(Boolean).join(' · '),
    url: q.url,
    // where it was, as a standard geo link (the quake page's map reads it; a maps app could open it)
    mediaUrl: `geo:${q.lat},${q.lon}${q.depth != null ? `?depth=${q.depth}` : ''}`,
    score: Math.round(q.mag * 10) / 10,
    publishedAt: q.time,
  });
}

/** The last day's quakes of magnitude `min` or more in and around Turkey: AFAD first, USGS if that fails. */
export async function recentQuakes(min: number, since: number): Promise<Quake[]> {
  const fmt = (t: number) => new Date(t + 3 * 3600_000).toISOString().slice(0, 19); // AFAD wants Turkish time
  try {
    const url = `https://deprem.afad.gov.tr/apiv2/event/filter?start=${fmt(since)}&end=${fmt(Date.now())}&minmag=${min}&format=json`;
    const rows = JSON.parse(await get(url, 15_000, 'application/json'));
    if (Array.isArray(rows)) return fromAfad(rows);
    throw new Error('AFAD answered something that is not a list');
  } catch (e) {
    console.warn('Radar: AFAD failed, trying USGS', e);
    const b = TURKEY;
    const url =
      `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${new Date(since).toISOString()}&minmagnitude=${min}` +
      `&minlatitude=${b.minLat}&maxlatitude=${b.maxLat}&minlongitude=${b.minLon}&maxlongitude=${b.maxLon}`;
    return fromUsgs((JSON.parse(await get(url, 15_000, 'application/json')) as { features: UsgsFeature[] }).features ?? []);
  }
}

export const quakes: ContentSource = {
  id: 'quakes',
  async fetch(topic, ctx) {
    const min = topic.sources.quakeMinMag;
    if (!min || !ctx.throttle.tryAcquire(`quakes:${topic.id}`, EVERY)) return [];
    const near = topic.sources.quakeArea !== 'turkey';
    return (await recentQuakes(min, ctx.since))
      .filter((q) => q.mag >= min && (!near || kmBetween(q, ISTANBUL) <= NEAR_KM))
      .map(toItem);
  },
};
