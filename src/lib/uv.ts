/**
 * UV forecast from Open-Meteo (free, no API key).
 * https://open-meteo.com/en/docs
 */

export type UvHour = { hour: number; uv: number };

export type UvForecast = {
  hours: UvHour[];
  /** Estimated UV right now at the forecast location (blended between hourly values). */
  current: number;
  /** Highest UV today. */
  max: number;
  /** Hour (0-23) when UV peaks. */
  peakHour: number;
  /** First and last hour where UV is above the threshold, or null if it never is. */
  window: { start: number; end: number } | null;
  /** Current hour (0-23) in the forecast location's local time. */
  nowHour: number;
};

type OpenMeteoResponse = {
  utc_offset_seconds: number;
  hourly: { time: string[]; uv_index: (number | null)[] };
};

export async function fetchUvForecast(
  latitude: number,
  longitude: number,
  threshold: number,
): Promise<UvForecast> {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${latitude.toFixed(3)}&longitude=${longitude.toFixed(3)}` +
    '&hourly=uv_index&timezone=auto&forecast_days=1';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let data: OpenMeteoResponse;
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`The weather service returned an error (${res.status}).`);
    data = await res.json();
  } catch (e) {
    if (controller.signal.aborted) {
      throw new Error('The weather service took too long to respond. Check your connection and try again.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  const hours: UvHour[] = data.hourly.time.map((t, i) => ({
    hour: Number(t.slice(11, 13)),
    uv: Math.max(0, data.hourly.uv_index[i] ?? 0),
  }));

  // Local time at the forecast location (not necessarily the phone's time zone).
  const localNow = new Date(Date.now() + data.utc_offset_seconds * 1000);
  const nowHour = localNow.getUTCHours();
  // Blend this hour's and next hour's values by the minute, so 10:30 sits halfway between.
  const thisHour = hours.find((h) => h.hour === nowHour)?.uv ?? 0;
  const nextHour = hours.find((h) => h.hour === nowHour + 1)?.uv ?? thisHour;
  const current = thisHour + (nextHour - thisHour) * (localNow.getUTCMinutes() / 60);

  let peak = hours[0];
  for (const h of hours) if (h.uv > peak.uv) peak = h;

  const above = hours.filter((h) => h.uv > threshold);
  const window = above.length
    ? { start: above[0].hour, end: above[above.length - 1].hour }
    : null;

  return { hours, current, max: peak.uv, peakHour: peak.hour, window, nowHour };
}

/** Standard WHO UV index categories. */
export function uvCategory(uv: number): string {
  if (uv < 3) return 'Low';
  if (uv < 6) return 'Moderate';
  if (uv < 8) return 'High';
  if (uv < 11) return 'Very high';
  return 'Extreme';
}

export function formatHour(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** A "right now" UV reading. */
export type CurrentUv = {
  uv: number;
  /** Where the number came from, shown on screen. */
  source: string;
  /** When the source last updated the reading. */
  updatedAt: Date;
  /** e.g. "Partly cloudy", when the source provides it. */
  condition: string | null;
};

/**
 * WeatherAPI.com key, read from the local .env.local file (never committed to GitHub).
 * Without it, the app falls back to Open-Meteo's forecast.
 */
const WEATHERAPI_KEY = process.env.EXPO_PUBLIC_WEATHERAPI_KEY;
export const hasWeatherApiKey = Boolean(WEATHERAPI_KEY);

/** Current conditions from WeatherAPI.com (refreshed by them roughly every 15 minutes). */
export async function fetchCurrentUv(latitude: number, longitude: number): Promise<CurrentUv> {
  if (!WEATHERAPI_KEY) throw new Error('No WeatherAPI.com key set.');
  const url =
    'https://api.weatherapi.com/v1/current.json' +
    `?key=${encodeURIComponent(WEATHERAPI_KEY)}&q=${latitude.toFixed(3)},${longitude.toFixed(3)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(
        res.status === 401 || res.status === 403
          ? 'WeatherAPI.com rejected the key. Check the key in .env.local.'
          : `WeatherAPI.com returned an error (${res.status}).`,
      );
    }
    const data: {
      current: { uv: number; last_updated_epoch: number; condition?: { text?: string } };
    } = await res.json();
    return {
      uv: Math.max(0, data.current.uv),
      source: 'WeatherAPI.com',
      updatedAt: new Date(data.current.last_updated_epoch * 1000),
      condition: data.current.condition?.text ?? null,
    };
  } catch (e) {
    if (controller.signal.aborted) throw new Error('WeatherAPI.com took too long to respond.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export function formatTime(date: Date): string {
  const h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}
