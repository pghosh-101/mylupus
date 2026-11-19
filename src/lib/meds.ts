import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getNotificationPermission, requestNotificationPermission } from '@/lib/notifications';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FoodRule = 'with_food' | 'empty_stomach' | 'any';

/** Minutes since midnight, 0–1439. */
export type Minutes = number;

export type Medication = {
  id: string;
  name: string;
  pillsPerDose: number;
  /** One entry per daily dose. */
  doseTimes: Minutes[];
  foodRule: FoodRule;
  /** Free text, e.g. "Don't take with antacids". */
  instructions: string;
  /** Free text, side effects to watch for. */
  sideEffects: string;
  /** Pills on hand as of a date. Null if not tracking refills. */
  supply: { quantity: number; asOf: string } | null;
};

/** Daily routine used to suggest dose times. */
export type Routine = {
  wake: Minutes;
  breakfast: Minutes;
  lunch: Minutes;
  dinner: Minutes;
  bed: Minutes;
};

export type DoseStatus = 'taken' | 'skipped';
export type DoseLogEntry = { key: string; status: DoseStatus; at: number };

export const FOOD_RULE_LABEL: Record<FoodRule, string> = {
  with_food: 'With food',
  empty_stomach: 'Empty stomach',
  any: 'Either',
};

export const FOOD_RULE_HINT: Record<FoodRule, string> = {
  with_food: 'Take with a meal',
  empty_stomach: '1 hour before or 2 hours after food',
  any: 'With or without food',
};

/** Common lupus medications with typical instructions. Always follow your own prescription label. */
export const QUICK_PICKS: { name: string; foodRule: FoodRule; instructions: string }[] = [
  {
    name: 'Plaquenil (hydroxychloroquine)',
    foodRule: 'with_food',
    instructions: 'Taking with food or milk helps prevent an upset stomach.',
  },
  {
    name: 'CellCept (mycophenolate mofetil)',
    foodRule: 'empty_stomach',
    instructions:
      'Take on an empty stomach. Keep antacids with magnesium or aluminum a few hours apart.',
  },
  {
    name: 'Myfortic (mycophenolic acid)',
    foodRule: 'empty_stomach',
    instructions: 'Take on an empty stomach. Swallow whole.',
  },
  { name: 'Prednisone', foodRule: 'with_food', instructions: 'Usually taken in the morning with food.' },
  {
    name: 'Imuran (azathioprine)',
    foodRule: 'with_food',
    instructions: 'Taking with food can help with nausea.',
  },
];

export const DEFAULT_ROUTINE: Routine = {
  wake: 7 * 60 + 30,
  breakfast: 8 * 60 + 30,
  lunch: 12 * 60 + 30,
  dinner: 21 * 60,
  bed: 30, // 12:30 AM
};

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

const DAY = 24 * 60;
export const wrap = (m: number): Minutes => ((Math.round(m) % DAY) + DAY) % DAY;

export function formatMinutes(m: Minutes): string {
  const h = Math.floor(m / 60);
  const min = String(m % 60).padStart(2, '0');
  return `${h % 12 === 0 ? 12 : h % 12}:${min} ${h < 12 ? 'AM' : 'PM'}`;
}

export const todayString = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Shortest distance in minutes between two clock times, wrapping past midnight. */
const clockGap = (a: Minutes, b: Minutes) => {
  const d = Math.abs(a - b) % DAY;
  return Math.min(d, DAY - d);
};

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const MEDS_KEY = 'mylupus.meds';
const ROUTINE_KEY = 'mylupus.routine';
const LOG_KEY = 'mylupus.doseLog';

async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJSON(key: string, value: unknown) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not fatal.
  }
}

export const loadMeds = () => readJSON<Medication[]>(MEDS_KEY, []);
export const loadRoutine = () => readJSON<Routine>(ROUTINE_KEY, DEFAULT_ROUTINE);
export const loadDoseLog = () => readJSON<DoseLogEntry[]>(LOG_KEY, []);

export async function saveMeds(meds: Medication[]) {
  await writeJSON(MEDS_KEY, meds);
  await rescheduleMedNotifications(meds);
}

export async function saveRoutine(routine: Routine) {
  await writeJSON(ROUTINE_KEY, routine);
}

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---------------------------------------------------------------------------
// Schedule suggestions and checks
// ---------------------------------------------------------------------------

/** Suggest dose times from the routine, following the food rule. */
export function suggestTimes(timesPerDay: number, foodRule: FoodRule, r: Routine): Minutes[] {
  const meals = [r.breakfast, r.lunch, r.dinner];

  if (foodRule === 'with_food') {
    if (timesPerDay === 1) return [r.breakfast];
    if (timesPerDay === 2) return [r.breakfast, r.dinner];
    if (timesPerDay === 3) return meals;
  }

  if (foodRule === 'empty_stomach') {
    if (timesPerDay === 1) return [wrap(r.breakfast - 60)];
    if (timesPerDay === 2) {
      // Aim for 12 hours apart, each clear of meals. Try "1h before lunch" first, then breakfast.
      for (const first of [r.lunch - 60, r.breakfast - 60]) {
        const pair = [wrap(first), wrap(first + 12 * 60)];
        if (pair.every((t) => !foodConflict(t, 'empty_stomach', r))) return pair;
      }
      return [wrap(r.lunch - 60), wrap(r.dinner + 120)];
    }
    if (timesPerDay === 3) return [wrap(r.breakfast - 60), wrap(r.lunch - 60), wrap(r.dinner + 120)];
  }

  // 'any', or more doses than meals: evenly spaced (e.g. every 12h for 2×, every 8h for 3×),
  // starting at breakfast and finishing at least 30 minutes before bed.
  if (timesPerDay === 1) return [r.breakfast];
  const lastOk = (r.bed > r.wake ? r.bed : r.bed + DAY) - 30;
  const span = Math.min(((timesPerDay - 1) * DAY) / timesPerDay, lastOk - r.breakfast);
  return Array.from({ length: timesPerDay }, (_, i) =>
    wrap(r.breakfast + Math.round((span * i) / (timesPerDay - 1) / 15) * 15),
  );
}

/** A problem with a dose time given its food rule, or null if it looks fine. */
export function foodConflict(t: Minutes, rule: FoodRule, r: Routine): string | null {
  const meals: [string, Minutes][] = [
    ['breakfast', r.breakfast],
    ['lunch', r.lunch],
    ['dinner', r.dinner],
  ];
  if (rule === 'empty_stomach') {
    for (const [name, meal] of meals) {
      const before = wrap(meal - t); // minutes from dose until the meal
      const after = wrap(t - meal); // minutes since the meal
      if (before < 60 || after < 120) {
        return `Close to ${name} (${formatMinutes(meal)}). Usually taken 1 hour before or 2 hours after food.`;
      }
    }
  }
  if (rule === 'with_food') {
    if (!meals.some(([, meal]) => clockGap(t, meal) <= 30)) {
      return 'Not near a meal in your routine. This one is usually taken with food.';
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Refills
// ---------------------------------------------------------------------------

export function supplyInfo(med: Medication, today = new Date()) {
  if (!med.supply || med.doseTimes.length === 0) return null;
  const perDay = med.pillsPerDose * med.doseTimes.length;
  const start = parseDate(med.supply.asOf);
  const daysSupply = Math.floor(med.supply.quantity / perDay);
  const runOut = new Date(start);
  runOut.setDate(runOut.getDate() + daysSupply);
  const elapsed = Math.max(0, Math.floor((parseDate(todayString(today)).getTime() - start.getTime()) / 86400000));
  const pillsLeft = Math.max(0, med.supply.quantity - perDay * elapsed);
  const daysLeft = Math.max(0, Math.round((runOut.getTime() - parseDate(todayString(today)).getTime()) / 86400000));
  return { perDay, runOut, pillsLeft, daysLeft };
}

// ---------------------------------------------------------------------------
// Dose log
// ---------------------------------------------------------------------------

export const doseKey = (date: string, medId: string, doseIndex: number) => `${date}|${medId}|${doseIndex}`;

export async function logDose(key: string, status: DoseStatus) {
  const log = await loadDoseLog();
  const next = log.filter((e) => e.key !== key);
  next.push({ key, status, at: Date.now() });
  await writeJSON(LOG_KEY, next.slice(-5000));
}

export async function undoDose(key: string) {
  const log = await loadDoseLog();
  await writeJSON(
    LOG_KEY,
    log.filter((e) => e.key !== key),
  );
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

const DOSE_PREFIX = 'med-';
const REFILL_PREFIX = 'refill-';
const SNOOZE_PREFIX = 'snooze-';
export const DOSE_CATEGORY = 'dose';

type DoseData = { kind: 'dose'; medId: string; doseIndex: number };

/** Adds Taken / Snooze / Skip buttons to dose reminders (long-press the notification). */
export async function setupDoseCategory() {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.setNotificationCategoryAsync(DOSE_CATEGORY, [
      { identifier: 'taken', buttonTitle: 'Taken', options: { opensAppToForeground: true } },
      { identifier: 'snooze', buttonTitle: 'Snooze 15 min', options: { opensAppToForeground: true } },
      { identifier: 'skip', buttonTitle: 'Skip', options: { opensAppToForeground: true } },
    ]);
  } catch {
    // Buttons are a bonus; reminders still work without them.
  }
}

function doseContent(med: Medication, doseIndex: number) {
  return {
    title: `Time for ${shortName(med.name)}`,
    body: `${med.pillsPerDose} pill${med.pillsPerDose === 1 ? '' : 's'} · ${FOOD_RULE_HINT[med.foodRule]}`,
    data: { kind: 'dose', medId: med.id, doseIndex } satisfies DoseData,
    categoryIdentifier: DOSE_CATEGORY,
  };
}

/** "CellCept (mycophenolate mofetil)" -> "CellCept" for short notification titles. */
export const shortName = (name: string) => name.replace(/\s*\(.*\)\s*$/, '').trim() || name;

/** Replace all dose and refill notifications to match the current medication list. */
export async function rescheduleMedNotifications(meds: Medication[]) {
  if (Platform.OS === 'web') return;
  let permission = await getNotificationPermission();
  if (permission === 'undetermined') permission = await requestNotificationPermission();
  if (permission !== 'granted') return;

  const existing = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    existing
      .filter((n) => n.identifier.startsWith(DOSE_PREFIX) || n.identifier.startsWith(REFILL_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );

  for (const med of meds) {
    for (const [i, t] of med.doseTimes.entries()) {
      await Notifications.scheduleNotificationAsync({
        identifier: `${DOSE_PREFIX}${med.id}-${i}`,
        content: doseContent(med, i),
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: Math.floor(t / 60),
          minute: t % 60,
        },
      });
    }

    const supply = supplyInfo(med);
    if (!supply) continue;
    for (const daysBefore of [7, 3]) {
      const when = new Date(supply.runOut);
      when.setDate(when.getDate() - daysBefore);
      when.setHours(10, 0, 0, 0);
      if (when.getTime() <= Date.now()) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: `${REFILL_PREFIX}${med.id}-${daysBefore}`,
        content: {
          title: `Order a ${shortName(med.name)} refill`,
          body: `About ${daysBefore} days left. Runs out around ${formatDate(supply.runOut)}.`,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
      });
    }
  }
}

export async function snoozeDose(med: Medication, doseIndex: number, minutes = 15) {
  if (Platform.OS === 'web') return;
  await Notifications.scheduleNotificationAsync({
    identifier: `${SNOOZE_PREFIX}${med.id}-${doseIndex}`,
    content: doseContent(med, doseIndex),
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: minutes * 60 },
  });
}

/**
 * Handle Taken / Snooze / Skip pressed on a dose notification.
 * Returns a cleanup function.
 */
export function listenForDoseActions(onChange?: () => void): () => void {
  if (Platform.OS === 'web') return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener(async (response) => {
    const data = response.notification.request.content.data as Partial<DoseData> | undefined;
    if (data?.kind !== 'dose' || !data.medId || data.doseIndex === undefined) return;
    const action = response.actionIdentifier;
    // A late-night dose answered after midnight still belongs to the day it was scheduled.
    const firedAt = new Date(response.notification.date);
    const key = doseKey(todayString(firedAt), data.medId, data.doseIndex);

    if (action === 'taken') await logDose(key, 'taken');
    else if (action === 'skip') await logDose(key, 'skipped');
    else if (action === 'snooze') {
      const med = (await loadMeds()).find((m) => m.id === data.medId);
      if (med) await snoozeDose(med, data.doseIndex);
    }
    onChange?.();
  });
  return () => sub.remove();
}
