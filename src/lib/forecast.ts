/*
 * The real weather for the radio's weather report (and the planner's weather words): Open-Meteo, free, no key.
 * The place is Plan my day's (Settings → Days Off). No React Native in here, so the text is tested.
 */

const WMO: Record<number, string> = {
  0: 'clear sky', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'fog',
  51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 56: 'freezing drizzle', 57: 'freezing drizzle',
  61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 67: 'freezing rain',
  71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains',
  80: 'rain showers', 81: 'rain showers', 82: 'violent rain showers', 85: 'snow showers', 86: 'heavy snow showers',
  95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'thunderstorm with hail',
};
export const weatherText = (code: number) => WMO[code] ?? 'mixed weather';

export type Hourly = { time: string[]; temperature_2m: number[]; precipitation_probability: (number | null)[]; weather_code: number[]; wind_speed_10m: number[] };
export type Daily = { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: (number | null)[]; weather_code: number[] };

/** One hour's line: "06:00 3°C, light rain (60% rain), wind 25 km/h". Wind only when it's worth saying. */
const hourLine = (h: Hourly, i: number) => {
  const rain = h.precipitation_probability[i] ?? 0;
  const wind = Math.round(h.wind_speed_10m[i]);
  return (
    `${h.time[i].slice(11, 16)} ${Math.round(h.temperature_2m[i])}°C, ${weatherText(h.weather_code[i])}` +
    (rain >= 20 ? ` (${rain}% rain)` : '') +
    (wind >= 25 ? `, wind ${wind} km/h` : '')
  );
};

/**
 * The next 24 hours every 3 hours from now (local time: Open-Meteo's `timezone=auto`), then tomorrow's range:
 * enough for the hosts to say what it's like now and on the way to and from the shift.
 */
export function forecastLines(hourly: Hourly, daily: Daily | undefined, nowLocal: string): string {
  const from = hourly.time.findIndex((t) => t >= nowLocal.slice(0, 13)); // this hour
  if (from < 0) return '';
  const lines: string[] = [];
  for (let i = from; i < Math.min(hourly.time.length, from + 25); i += 3) lines.push(hourLine(hourly, i));
  const tomorrow = daily?.time.findIndex((d) => d > nowLocal.slice(0, 10)) ?? -1;
  if (daily && tomorrow >= 0) {
    const rain = daily.precipitation_probability_max[tomorrow] ?? 0;
    lines.push(
      `tomorrow: ${Math.round(daily.temperature_2m_min[tomorrow])}–${Math.round(daily.temperature_2m_max[tomorrow])}°C, ` +
        `${weatherText(daily.weather_code[tomorrow])}${rain >= 20 ? ` (${rain}% rain)` : ''}`,
    );
  }
  return lines.join('; ');
}

/** "YYYY-MM-DDTHH:MM" on the phone's clock, to compare with Open-Meteo's local times. */
export function localStamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** The forecast as one line for the hosts, or null (no place set, offline). */
export async function forecastFor(lat: number, lon: number): Promise<string | null> {
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=3` +
      '&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { hourly?: Hourly; daily?: Daily };
  if (!json.hourly) return null;
  return forecastLines(json.hourly, json.daily, localStamp(Date.now())) || null;
}
