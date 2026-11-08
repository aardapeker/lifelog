import { fetch } from 'expo/fetch';
import { cancelNotify, notify } from './notify';
import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getChatConfig, parseJsonReply, PROVIDERS } from './chat';
import { ensureNotificationPermission, getCheckinSettings, shiftFor } from './checkins';
import { aboutUser, renderNotes } from './context';
import { getSetting, setSetting } from './db';
import { groundedSearch, trustworthyLink, type GroundedResult } from './gemini';
import { getKey } from './keys';
import { recentNotes } from './notes';
import { weekStart } from './recap';

/*
 * Day planner: on a day off, the friend plans the day. It looks at the weather
 * (Open-Meteo, no key needed), real events found with Gemini's Google Search,
 * your goals, your mood and the people you haven't seen, then writes a checklist.
 */

const DAY = 86_400_000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export type Push = 'gentle' | 'medium' | 'bold';
export const PUSH_LEVELS: { key: Push; label: string }[] = [
  { key: 'gentle', label: 'Gentle' },
  { key: 'medium', label: 'Medium' },
  { key: 'bold', label: 'Bold' },
];

export type PlannerSettings = {
  city: string; // what the user typed
  place: string | null; // what the geocoder matched, e.g. "Maltepe, Istanbul, Türkiye"
  lat: number | null;
  lon: number | null;
  push: Push;
  reminders: boolean; // "tomorrow's free, want a plan?" the evening before
};

export type PlanItem = {
  time: string;
  title: string;
  detail: string;
  kind: 'social' | 'solo' | 'goal' | 'rest' | 'chore';
  url?: string;
  done: boolean;
};

export type Weather = { text: string; max: number; min: number; rain: number };
export type Source = { title: string; uri: string };

export type Plan = {
  day: number;
  weather: Weather | null;
  intro: string;
  items: PlanItem[];
  sources: Source[];
  queries: string[]; // what was searched on Google (shown, as Google asks)
  note: string | null; // e.g. "No events found" or "Events need a Gemini key"
};

// ───────────── dates ─────────────

export const midnight = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** "2026-11-08" in local time: used in links and notifications. */
export function dayParam(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseDayParam(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function dayTitle(ms: number): string {
  const d = new Date(ms);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// ───────────── settings ─────────────

/** Where the user is, for weather and events. Null until they set a city. */
export async function getPlace(db: SQLiteDatabase): Promise<string | null> {
  const s = await getPlannerSettings(db);
  return s.place ?? (s.city || null);
}

export async function getPlannerSettings(db: SQLiteDatabase): Promise<PlannerSettings> {
  const defaults: PlannerSettings = { city: '', place: null, lat: null, lon: null, push: 'medium', reminders: true };
  try {
    return { ...defaults, ...JSON.parse(await getSetting(db, 'planner', '{}')) };
  } catch {
    return defaults;
  }
}

/** Saves settings; looks the city up first when it changed, so the weather has coordinates. */
export async function savePlannerSettings(db: SQLiteDatabase, next: PlannerSettings): Promise<PlannerSettings> {
  const prev = await getPlannerSettings(db);
  let s = { ...next, city: next.city.trim() };
  if (s.city && (s.city !== prev.city || s.lat === null)) {
    const found = await geocode(s.city);
    s = { ...s, ...found };
  }
  if (!s.city) s = { ...s, place: null, lat: null, lon: null };
  await setSetting(db, 'planner', JSON.stringify(s));
  await scheduleDayOffReminders(db);
  return s;
}

async function geocode(city: string): Promise<Pick<PlannerSettings, 'place' | 'lat' | 'lon'>> {
  // the geocoder wants a place name, not "Maltepe, Istanbul": try the full text, then its first part
  for (const name of [city, city.split(',')[0]]) {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name.trim())}&count=1&language=en&format=json`,
    );
    if (!res.ok) throw new Error(`Couldn't look up "${city}" (${res.status}).`);
    const json = (await res.json()) as {
      results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }[];
    };
    const r = json.results?.[0];
    if (r) {
      return {
        place: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
        lat: r.latitude,
        lon: r.longitude,
      };
    }
  }
  throw new Error(`Couldn't find "${city}". Try just the district or city name.`);
}

// ───────────── days off ─────────────

/**
 * Sundays are always off. Saturday is off too after a Night week (free from 08:00),
 * using the rotation set up in Check-ins.
 */
export async function isDayOff(db: SQLiteDatabase, ms: number): Promise<boolean> {
  const d = new Date(ms);
  if (d.getDay() === 0) return true;
  if (d.getDay() === 6) {
    return shiftFor(await getCheckinSettings(db), ms) === 'night';
  }
  return false;
}

/** Today or tomorrow, whichever is the next day off (null if neither). */
export async function upcomingDayOff(db: SQLiteDatabase): Promise<number | null> {
  const today = midnight(Date.now());
  for (const day of [today, today + DAY]) if (await isDayOff(db, day + 12 * 3600e3)) return day;
  return null;
}

// ───────────── sources ─────────────

const WMO: Record<number, string> = {
  0: 'clear sky', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'fog',
  51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 56: 'freezing drizzle', 57: 'freezing drizzle',
  61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 67: 'freezing rain',
  71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains',
  80: 'rain showers', 81: 'rain showers', 82: 'violent rain showers', 85: 'snow showers', 86: 'heavy snow showers',
  95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'thunderstorm with hail',
};
export const weatherText = (code: number) => WMO[code] ?? 'mixed weather';

export async function fetchWeather(lat: number, lon: number, day: number): Promise<Weather | null> {
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=7',
  );
  if (!res.ok) return null;
  const json = (await res.json()) as {
    daily?: {
      time: string[];
      weather_code: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_probability_max: (number | null)[];
    };
  };
  const i = json.daily?.time.indexOf(dayParam(day)) ?? -1;
  if (!json.daily || i < 0) return null;
  return {
    text: weatherText(json.daily.weather_code[i]),
    max: Math.round(json.daily.temperature_2m_max[i]),
    min: Math.round(json.daily.temperature_2m_min[i]),
    rain: json.daily.precipitation_probability_max[i] ?? 0,
  };
}

export type FoundEvent = { title: string; when: string; where: string; kind: 'social' | 'solo'; url: string };

/** Swaps each event's typed-from-memory link for one Google actually returned (see trustworthyLink). */
export function linkEvents(found: GroundedResult, events: FoundEvent[], place: string): FoundEvent[] {
  return events.map((e) => ({ ...e, url: trustworthyLink(found, e.title, e.url, `${e.title} ${e.when} ${place}`) }));
}

/** Parses "TITLE | WHEN | WHERE | social/solo | URL" lines. Anything else is ignored. */
export function parseEventLines(text: string): FoundEvent[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^[-*•\d.)\s]+/, '').split('|').map((p) => p.trim()))
    .filter((p) => p.length >= 5 && p[0] && /^https?:\/\//.test(p[4]))
    .map(([title, when, where, kind, url]) => ({
      title,
      when,
      where,
      kind: /social/i.test(kind) ? ('social' as const) : ('solo' as const),
      url,
    }))
    .slice(0, 8);
}

/** Real events that day, found by Gemini with Google Search. Needs a Gemini key. */
async function searchEvents(
  apiKey: string,
  place: string,
  day: number,
): Promise<{ events: FoundEvent[]; sources: Source[]; queries: string[] }> {
  const found = await groundedSearch(
    apiKey,
    PROVIDERS.gemini.defaultModel,
    `Search the web for things happening in or near ${place} on ${dayTitle(day)} ${new Date(day).getFullYear()}: ` +
      'concerts, meetups, workshops, exhibitions, markets, sports or hobby groups, language exchanges, free activities. ' +
      'Include both social ones (meeting people) and solo ones. Only list events you actually found for that date. ' +
      'Output one per line, exactly: TITLE | TIME | PLACE | social or solo | URL. Up to 6 lines. ' +
      'If you find nothing for that date, output NONE.',
    'daysoff',
  );
  return { events: linkEvents(found, parseEventLines(found.text), place), sources: found.sources, queries: found.queries };
}

// ───────────── the plan ─────────────

const PUSH_RULE: Record<Push, string> = {
  gentle: 'Include at most one social item, low pressure, easy to skip.',
  medium: 'Include one real social item (meeting people in person) and encourage it warmly.',
  bold: 'Include two social items and push them a little out of their comfort zone, playfully but firmly.',
};

/** What the friend knows that matters for planning a free day. */
async function planningContext(db: SQLiteDatabase, day: number): Promise<string> {
  const [about, recent, goals, people] = await Promise.all([
    aboutUser(db),
    recentNotes(db, 7, 8),
    db.getAllAsync<{ title: string }>('SELECT title FROM goals WHERE done = 0'),
    // people who haven't come up in three weeks: a good excuse to reach out
    db.getAllAsync<{ name: string }>(
      `SELECT subject AS name FROM facts WHERE subject IS NOT NULL AND kind = 'person'
       GROUP BY lower(subject) HAVING max(created_at) < ? LIMIT 5`,
      Date.now() - 21 * DAY,
    ),
  ]);

  let lastWeek = '';
  {
    const shift = shiftFor(await getCheckinSettings(db), weekStart(day) - DAY); // the week before this day off
    lastWeek = `They just finished a ${shift} shift week.${shift === 'night' ? ' They are probably tired: start the day late (not before 12:00) and keep it light.' : ''}`;
  }
  const mood = await db.getFirstAsync<{ avg: number | null }>(
    'SELECT avg(mood) AS avg FROM notes WHERE mood IS NOT NULL AND created_at >= ?',
    Date.now() - 7 * DAY,
  );

  return [
    about,
    lastWeek,
    mood?.avg ? `Their mood this week averaged ${mood.avg.toFixed(1)} out of 5.` : '',
    goals.length ? `Open goals: ${goals.map((g) => g.title).join('; ')}` : '',
    people.length ? `People they haven't mentioned in a while: ${people.map((p) => p.name).join(', ')}` : '',
    recent.length ? `Their last entries:\n${renderNotes(recent)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export async function getPlan(db: SQLiteDatabase, day: number): Promise<Plan | null> {
  const row = await db.getFirstAsync<{ body: string }>('SELECT body FROM plans WHERE day = ?', midnight(day));
  return row ? (JSON.parse(row.body) as Plan) : null;
}

export async function savePlan(db: SQLiteDatabase, plan: Plan): Promise<void> {
  await db.runAsync(
    'INSERT INTO plans(day, body, created_at) VALUES (?, ?, ?) ON CONFLICT(day) DO UPDATE SET body = excluded.body',
    plan.day,
    JSON.stringify(plan),
    Date.now(),
  );
}

/** Builds (or rebuilds) the plan for a day: weather, events, then the friend writes the checklist. */
export async function makePlan(db: SQLiteDatabase, dayMs: number): Promise<Plan> {
  const day = midnight(dayMs);
  const chat = await getChatConfig(db);
  if (!chat.apiKey) throw new Error('Add an API key in Settings first.');
  const s = await getPlannerSettings(db);
  const place = s.place ?? s.city;
  if (!place || s.lat === null || s.lon === null) throw new Error('Set your city in Settings → Days Off first.');

  const geminiKey = await getKey('gemini');
  const [weather, found, context] = await Promise.all([
    fetchWeather(s.lat, s.lon, day).catch(() => null),
    geminiKey
      ? searchEvents(geminiKey, place, day).catch(() => null)
      : Promise.resolve(null),
    planningContext(db, day),
  ]);

  let note: string | null = null;
  if (!geminiKey) note = 'Event search needs a Gemini key, so this plan has no live events.';
  else if (!found) note = "Couldn't search for events this time. The rest of the plan still works.";
  else if (!found.events.length) note = 'No events found for this day, so the plan uses ideas instead.';

  const reply = await PROVIDERS[chat.provider].complete({
    feature: 'daysoff',
    apiKey: chat.apiKey,
    model: chat.model,
    json: true,
    maxTokens: 1800,
    system:
      "You are the user's close friend who has read their journal, and today you plan their day off. " +
      'Return JSON: {"intro": "two casual sentences in your friend voice", "items": [{"time": "HH:MM", "title": "short", ' +
      '"detail": "one sentence: why, or a tip", "kind": "social|solo|goal|rest|chore", "url": "only if it is one of the events below"}]}. ' +
      '5 to 8 items in time order, realistic for travelling around their city. Mix: social, solo, one small step on a goal, ' +
      'and real rest. Follow the weather (rain or cold → indoor plans). Use events from the list only as given, with their URLs; ' +
      'never invent events, places with fake details, or links. Ideas without a URL are fine (a walk, a café, calling someone). ' +
      `${PUSH_RULE[s.push]} Write in the language of their journal entries.`,
    prompt: [
      `Day: ${dayTitle(day)}. Place: ${place}.`,
      weather
        ? `Weather: ${weather.text}, ${weather.min}–${weather.max}°C, ${weather.rain}% chance of rain.`
        : 'Weather: unknown.',
      found?.events.length
        ? `Events found for that day:\n${found.events.map((e) => `- ${e.title} | ${e.when} | ${e.where} | ${e.kind} | ${e.url}`).join('\n')}`
        : 'No events found for that day.',
      context,
    ].join('\n\n'),
  });

  const parsed = parseJsonReply<{ intro?: string; items?: Partial<PlanItem>[] }>(reply);
  const allowedUrls = new Set(found?.events.map((e) => e.url) ?? []);
  const kinds: PlanItem['kind'][] = ['social', 'solo', 'goal', 'rest', 'chore'];
  const plan: Plan = {
    day,
    weather,
    intro: parsed.intro?.trim() ?? '',
    items: (parsed.items ?? [])
      .filter((i) => i.title?.trim())
      .map((i) => ({
        time: String(i.time ?? '').slice(0, 5),
        title: i.title!.trim(),
        detail: i.detail?.trim() ?? '',
        kind: kinds.includes(i.kind as PlanItem['kind']) ? (i.kind as PlanItem['kind']) : 'solo',
        // a link the model made up is worse than no link
        url: i.url && allowedUrls.has(i.url) ? i.url : undefined,
        done: false,
      })),
    sources: found?.sources ?? [],
    queries: found?.queries ?? [],
    note,
  };
  if (!plan.items.length) throw new Error('The AI returned an empty plan. Try again.');
  await savePlan(db, plan);
  return plan;
}

/** Turns what you ticked off into a first draft of tonight's journal entry. */
export async function draftEntryFromPlan(db: SQLiteDatabase, plan: Plan): Promise<string> {
  const done = plan.items.filter((i) => i.done);
  if (!done.length) throw new Error('Tick off what you did first.');
  const chat = await getChatConfig(db);
  if (!chat.apiKey) throw new Error('Add an API key in Settings first.');
  const recent = await recentNotes(db, 14, 3);
  const text = await PROVIDERS[chat.provider].complete({
    feature: 'daysoff',
    apiKey: chat.apiKey,
    model: chat.model,
    maxTokens: 500,
    system:
      'Write a short first-person journal entry draft (3 to 6 sentences) about a day off, from the list of things the writer did. ' +
      'Casual and plain, like they would write it themselves. Do not invent feelings or details; leave room for them to add their own. ' +
      'Same language as their recent entries. Output only the entry.',
    prompt: `Things done on ${dayTitle(plan.day)}:\n${done.map((i) => `- ${i.time} ${i.title}`).join('\n')}\n\nRecent entries for language and style:\n${renderNotes(recent) || '(none)'}`,
  });
  return text.trim();
}

// ───────────── reminders ─────────────

/** "Tomorrow's free. Want a plan?" at 20:00 the evening before each day off in the next week. */
export async function scheduleDayOffReminders(db: SQLiteDatabase): Promise<void> {
  const s = await getPlannerSettings(db);
  let scheduled: Record<string, string> = {};
  try {
    scheduled = JSON.parse(await getSetting(db, 'plannerReminders', '{}'));
  } catch {
    scheduled = {};
  }

  // drop old ones; cancel everything if reminders are off or no city is set
  for (const [key, id] of Object.entries(scheduled)) {
    if (!s.reminders || !s.city || parseDayParam(key) < midnight(Date.now())) {
      await cancelNotify(id);
      delete scheduled[key];
    }
  }

  if (s.reminders && s.city) {
    const today = midnight(Date.now());
    for (let i = 1; i <= 7; i++) {
      const day = today + i * DAY;
      const key = dayParam(day);
      const at = day - 4 * 3600e3; // 20:00 the evening before
      if (scheduled[key] || at < Date.now() + 60_000 || !(await isDayOff(db, day + 12 * 3600e3))) continue;
      if (!(await ensureNotificationPermission())) break;
      scheduled[key] = await notify({
        title: 'Tomorrow is free',
        body: 'Want me to plan your day? Weather, events and a little push included.',
        data: { kind: 'planner', day: key },
        at,
        channelId: 'checkins',
      });
    }
  }
  await setSetting(db, 'plannerReminders', JSON.stringify(scheduled));
}
