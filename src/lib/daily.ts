import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { success } from '@/lib/haptics';
import type { Place } from '@/lib/location';
import { loadDoseLog, loadMeds, todayString } from '@/lib/meds';
import { getNotificationPermission, remindersOn } from '@/lib/notifications';
import { Settings } from '@/lib/settings';
import { loadSunscreenLog } from '@/lib/sunscreen';
import { fetchTodayWeather, type DayWeather } from '@/lib/uv';

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export const SYMPTOMS = [
  'Fatigue',
  'Joint pain',
  'Joint swelling',
  'Rash',
  'Mouth sores',
  'Hair loss',
  'Fever',
  'Headache',
  'Brain fog',
  'Chest pain when breathing',
  'Stomach issues',
] as const;
export type Symptom = (typeof SYMPTOMS)[number];

/** 0 none, 1 mild, 2 moderate, 3 severe. */
export type Level = 0 | 1 | 2 | 3;
export const LEVEL_LABEL = ['None', 'Mild', 'Moderate', 'Severe'] as const;

export const DIET_TAGS = [
  'Fried / greasy',
  'Salty',
  'Sugary',
  'Lots of veggies',
  'Alcohol',
  'Caffeine',
  'Dairy',
  'Skipped a meal',
] as const;

export const FLARE_TRIGGERS = [
  'Sun / UV',
  'Stress',
  'Poor sleep',
  'Illness / infection',
  'Missed meds',
  'Cold weather',
  'Overexertion',
  'Med change',
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SleepEntry = { date: string; hours: number; quality: 'poor' | 'ok' | 'good' };

export type EveningEntry = {
  date: string;
  symptoms: Partial<Record<Symptom, Level>>;
  stress: Level;
  diet: 'well' | 'so-so' | 'poorly' | null;
  dietTags: string[];
  homeMeals: number;
  outMeals: number;
  notes: string;
};

export type RaynaudEvent = { at: number; tempF: number | null };

export type Flare = {
  id: string;
  /** "YYYY-MM-DD", or "YYYY-MM" when only the month is known. */
  start: string;
  /** Days it lasted, or null if ongoing / unknown. */
  durationDays: number | null;
  ongoing: boolean;
  severity: 1 | 2 | 3;
  symptoms: string[];
  triggers: string[];
  treatment: string;
  notes: string;
};

export type MedicalHistory = {
  /** "YYYY-MM" or "". */
  diagnosed: string;
  pastMeds: string;
  otherConditions: string;
  allergies: string;
  notes: string;
};

export const EMPTY_HISTORY: MedicalHistory = {
  diagnosed: '',
  pastMeds: '',
  otherConditions: '',
  allergies: '',
  notes: '',
};

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const KEYS = {
  sleep: 'mylupus.sleep',
  evening: 'mylupus.evening',
  raynaud: 'mylupus.raynaud',
  flares: 'mylupus.flares',
  history: 'mylupus.history',
  weather: 'mylupus.weatherLog',
};

async function read<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function write(key: string, value: unknown) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not fatal.
  }
}

export const loadSleep = () => read<Record<string, SleepEntry>>(KEYS.sleep, {});
export const loadEvening = () => read<Record<string, EveningEntry>>(KEYS.evening, {});
export const loadRaynaud = () => read<RaynaudEvent[]>(KEYS.raynaud, []);
export const loadFlares = () => read<Flare[]>(KEYS.flares, []);
export const loadHistory = () => read<MedicalHistory>(KEYS.history, EMPTY_HISTORY);
export const loadWeatherLog = () => read<Record<string, DayWeather>>(KEYS.weather, {});

export async function saveSleep(entry: SleepEntry) {
  success();
  const all = await loadSleep();
  all[entry.date] = entry;
  await write(KEYS.sleep, all);
}

export async function saveEvening(entry: EveningEntry) {
  success();
  const all = await loadEvening();
  all[entry.date] = entry;
  await write(KEYS.evening, all);
}

export async function logRaynaud(event: RaynaudEvent) {
  const all = await loadRaynaud();
  all.push(event);
  await write(KEYS.raynaud, all.slice(-2000));
}

export async function saveFlares(flares: Flare[]) {
  await write(KEYS.flares, flares);
}

export async function saveHistory(history: MedicalHistory) {
  await write(KEYS.history, history);
}

let lastWeatherSave = 0;

/** Save today's weather for this place (at most once an hour). */
export async function recordTodayWeather(place: Place) {
  if (Date.now() - lastWeatherSave < 60 * 60 * 1000) return;
  lastWeatherSave = Date.now();
  try {
    const day = await fetchTodayWeather(place.latitude, place.longitude);
    const all = await loadWeatherLog();
    all[day.date] = day;
    await write(KEYS.weather, all);
  } catch {
    lastWeatherSave = 0;
  }
}

// ---------------------------------------------------------------------------
// Evening reminder
// ---------------------------------------------------------------------------

const EVENING_ID = 'evening-checkin';
export const EVENING_TIME = { hour: 21, minute: 0 };

/** Daily 9 PM "How was today?" reminder. */
export async function scheduleEveningReminder() {
  if (Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(EVENING_ID).catch(() => {});
  if (!remindersOn('evening')) return;
  if ((await getNotificationPermission()) !== 'granted') return;
  await Notifications.scheduleNotificationAsync({
    identifier: EVENING_ID,
    content: {
      title: Settings.name ? `How was today, ${Settings.name}?` : 'How was today?',
      body: 'Log symptoms, stress, and meals. Takes about 30 seconds.',
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, ...EVENING_TIME },
  });
}

// ---------------------------------------------------------------------------
// Pattern report ("This week")
// ---------------------------------------------------------------------------

export type Insight = {
  /** 'focus' needs attention, 'good' is encouragement, 'info' is neutral. */
  tone: 'focus' | 'good' | 'info';
  title: string;
  detail: string;
};

/** The last `n` dates, oldest first, ending today. */
export function lastDates(n: number, end = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(end);
    d.setDate(d.getDate() - (n - 1 - i));
    return todayString(d);
  });
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const round1 = (x: number) => Math.round(x * 10) / 10;

/** Rule-based weekly patterns from the last 7 days. Runs on the phone; no AI involved. */
export async function weeklyInsights(): Promise<Insight[]> {
  const [sleep, evening, raynaud, weather, doseLog, meds, sunscreen] = await Promise.all([
    loadSleep(),
    loadEvening(),
    loadRaynaud(),
    loadWeatherLog(),
    loadDoseLog(),
    loadMeds(),
    loadSunscreenLog(),
  ]);
  const week = lastDates(7);
  const out: Insight[] = [];

  // Sleep
  const nights = week.map((d) => sleep[d]).filter(Boolean) as SleepEntry[];
  if (nights.length >= 3) {
    const short = nights.filter((n) => n.hours < 7).length;
    const mean = round1(avg(nights.map((n) => n.hours)));
    if (short >= Math.ceil(nights.length / 2)) {
      out.push({
        tone: 'focus',
        title: 'Focus on sleep',
        detail: `${short} of ${nights.length} logged nights were under 7 hours (average ${mean}h). Poor sleep is a common flare trigger.`,
      });
    } else {
      out.push({ tone: 'good', title: 'Sleep is on track', detail: `Averaging ${mean} hours a night this week.` });
    }
  }

  // Sleep vs. fatigue, across all history
  const pairs = Object.values(sleep)
    .map((s) => ({ hours: s.hours, fatigue: evening[s.date]?.symptoms.Fatigue }))
    .filter((p): p is { hours: number; fatigue: Level } => p.fatigue !== undefined);
  const shortF = pairs.filter((p) => p.hours < 7).map((p) => p.fatigue);
  const longF = pairs.filter((p) => p.hours >= 7).map((p) => p.fatigue);
  if (shortF.length >= 3 && longF.length >= 3 && avg(shortF) - avg(longF) >= 0.5) {
    out.push({
      tone: 'info',
      title: 'Less sleep, more fatigue',
      detail: `Your fatigue averages ${round1(avg(shortF))} out of 3 after short nights vs ${round1(avg(longF))} after 7+ hours.`,
    });
  }

  // Meals
  const days = week.map((d) => evening[d]).filter(Boolean) as EveningEntry[];
  const home = days.reduce((n, d) => n + d.homeMeals, 0);
  const eatenOut = days.reduce((n, d) => n + d.outMeals, 0);
  if (home + eatenOut >= 4) {
    const share = home / (home + eatenOut);
    if (share >= 0.7) {
      out.push({
        tone: 'good',
        title: 'Good balance, keep it up',
        detail: `${home} of ${home + eatenOut} meals this week were home-cooked.`,
      });
    } else if (share < 0.5) {
      out.push({
        tone: 'focus',
        title: 'Try cooking more at home',
        detail: `Only ${home} of ${home + eatenOut} meals this week were home-cooked.`,
      });
    } else {
      out.push({
        tone: 'info',
        title: 'Mixed week for meals',
        detail: `${home} home-cooked and ${eatenOut} eaten out.`,
      });
    }
  }
  const greasy = days.filter((d) => d.dietTags.includes('Fried / greasy')).length;
  if (greasy >= 3) {
    out.push({
      tone: 'focus',
      title: 'A lot of fried or greasy food',
      detail: `Tagged on ${greasy} of the last 7 days.`,
    });
  }

  // Stress
  const stressed = days.filter((d) => d.stress >= 2).length;
  if (stressed >= 3) {
    out.push({
      tone: 'focus',
      title: 'Stress has been high',
      detail: `Moderate or severe stress on ${stressed} days this week. Stress is a common flare trigger.`,
    });
  }

  // Symptoms trending up: last 3 days vs the 4 before
  for (const s of SYMPTOMS) {
    const levels = week.map((d) => evening[d]?.symptoms[s]);
    const recent = levels.slice(4).filter((x): x is Level => x !== undefined);
    const before = levels.slice(0, 4).filter((x): x is Level => x !== undefined);
    if (recent.length >= 2 && before.length >= 2 && avg(recent) - avg(before) >= 1) {
      out.push({
        tone: 'focus',
        title: `${s} is rising`,
        detail: `Higher over the last few days than earlier in the week. Keep an eye on it and mention it to your doctor if it continues.`,
      });
    }
  }

  // Medications
  if (meds.length) {
    const weekSet = new Set(week);
    const scheduled = meds.reduce((n, m) => n + m.doseTimes.length, 0) * 7;
    const taken = doseLog.filter((e) => e.status === 'taken' && weekSet.has(e.key.split('|')[0])).length;
    if (taken > 0) {
      const share = taken / scheduled;
      out.push({
        tone: share >= 0.9 ? 'good' : 'focus',
        title: share >= 0.9 ? 'Great medication consistency' : 'Some doses missed',
        detail: `Logged ${taken} of ${scheduled} doses this week.`,
      });
    }
  }

  // Sunscreen on high-UV days
  const highUv = week.filter((d) => (weather[d]?.uvMax ?? 0) > Settings.uvThreshold);
  if (highUv.length) {
    const covered = highUv.filter((d) =>
      sunscreen.some((e) => e.type === 'applied' && todayString(new Date(e.at)) === d),
    ).length;
    out.push({
      tone: covered === highUv.length ? 'good' : 'focus',
      title: 'Sunscreen on high-UV days',
      detail: `Logged sunscreen on ${covered} of ${highUv.length} days when UV went above ${Settings.uvThreshold}.`,
    });
  }

  // Raynaud's
  const weekStart = new Date(`${week[0]}T00:00:00`).getTime();
  const episodes = raynaud.filter((e) => e.at >= weekStart);
  if (episodes.length) {
    const temps = episodes.map((e) => e.tempF).filter((t): t is number => t !== null);
    out.push({
      tone: 'info',
      title: `${episodes.length} Raynaud's episode${episodes.length === 1 ? '' : 's'}`,
      detail: temps.length
        ? `Average outdoor temperature at the time: ${Math.round(avg(temps))}°F.`
        : 'Logged this week.',
    });
  }

  return out;
}

/** Warning signs that should prompt a call to the doctor, from an evening check-in. */
export function warningSigns(entry: EveningEntry): string | null {
  const s = entry.symptoms;
  if ((s['Chest pain when breathing'] ?? 0) >= 2) {
    return 'Chest pain when breathing can be serious with lupus. Contact your doctor today, or get urgent care if it is severe.';
  }
  if ((s.Fever ?? 0) >= 2) {
    return 'A fever while on CellCept or other immune-suppressing medication should be checked. Contact your doctor.';
  }
  return null;
}
