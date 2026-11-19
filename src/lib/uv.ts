/**
 * UV forecast from Open-Meteo (free, no API key).
 * https://open-meteo.com/en/docs
 */

export type UvHour = { hour: number; uv: number };

export type UvForecast = {
  hours: UvHour[];
  /** UV for the current hour at the forecast location. */
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
  const nowHour = new Date(Date.now() + data.utc_offset_seconds * 1000).getUTCHours();
  const current = hours.find((h) => h.hour === nowHour)?.uv ?? 0;

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
