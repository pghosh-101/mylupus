import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { success } from '@/lib/haptics';
import {
  cancelByPrefix,
  getNotificationPermission,
  remindersOn,
  requestNotificationPermission,
} from '@/lib/notifications';

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
  /** Keep doses at least this many hours away from other medications. */
  spacingHours?: number;
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

/** Record a dose. `at` is when it was actually taken (defaults to now). */
export async function logDose(key: string, status: DoseStatus, at = Date.now()) {
  if (status === 'taken') success();
  const log = await loadDoseLog();
  const next = log.filter((e) => e.key !== key);
  next.push({ key, status, at });
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
// Day plan: adjust later doses around what was actually taken
// ---------------------------------------------------------------------------

export type PlannedDose = {
  med: Medication;
  doseIndex: number;
  key: string;
  /** The time from the medication's schedule. */
  scheduled: Minutes;
  /**
   * When to take it, after spacing and food rules. Minutes from midnight of the plan's day;
   * can exceed 1440 for doses pushed past midnight.
   */
  planned: Minutes;
  /** Why it moved, if it did. */
  reason: string | null;
  entry: DoseLogEntry | null;
  /** For taken doses: minutes from midnight of the plan's day. */
  takenAt: Minutes | null;
  /**
   * For pending doses: the earliest time the food and spacing rules allow, based on what you've
   * actually logged (e.g. 2 hours after the meal you ate). Null when nothing logged limits it.
   */
  earliest?: Minutes | null;
};

/** Format plan minutes, which may run past midnight. */
export function formatPlanMinutes(m: Minutes): string {
  return formatMinutes(wrap(m)) + (m >= DAY ? ' (after midnight)' : '');
}

// ---------------------------------------------------------------------------
// Routine events (wake up, meals) that you can log, so the day adjusts around them
// ---------------------------------------------------------------------------

export type RoutineEvent = 'wake' | 'breakfast' | 'lunch' | 'dinner';
export const ROUTINE_EVENTS: RoutineEvent[] = ['wake', 'breakfast', 'lunch', 'dinner'];
export const ROUTINE_LABEL: Record<RoutineEvent, string> = {
  wake: 'Wake up',
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
};
const MEALS: RoutineEvent[] = ['breakfast', 'lunch', 'dinner'];

export type RoutineLogEntry = { key: string; status: 'done' | 'skipped'; at: number };
const ROUTINE_LOG_KEY = 'mylupus.routineLog';
export const routineKey = (date: string, event: RoutineEvent) => `${date}|${event}`;
export const loadRoutineLog = () => readJSON<RoutineLogEntry[]>(ROUTINE_LOG_KEY, []);

export async function logRoutine(key: string, status: 'done' | 'skipped', at = Date.now()) {
  if (status === 'done') success();
  const log = await loadRoutineLog();
  const next = log.filter((e) => e.key !== key);
  next.push({ key, status, at });
  await writeJSON(ROUTINE_LOG_KEY, next.slice(-3000));
}

export async function undoRoutine(key: string) {
  const log = await loadRoutineLog();
  await writeJSON(
    ROUTINE_LOG_KEY,
    log.filter((e) => e.key !== key),
  );
}

export type PlannedRoutine = {
  kind: 'routine';
  event: RoutineEvent;
  key: string;
  scheduled: Minutes;
  planned: Minutes;
  reason: string | null;
  entry: RoutineLogEntry | null;
};

export type TimelineItem = (PlannedDose & { kind: 'dose' }) | PlannedRoutine;

const round5 = (m: number) => Math.ceil(m / 5) * 5;
const hoursText = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
};

/** Logged items move the pending items scheduled within this many minutes after them. */
const FOLLOW_WINDOW = 240;
/** The most a logged time can pull a pending item earlier than its usual time. */
const MAX_EARLIER = 60;

/**
 * The day's doses and routine events, adjusted to what actually happened:
 * - When you log something (waking up, a meal, a dose) earlier or later than usual, the pending
 *   items scheduled within 4 hours after it shift by the same amount, so your usual gaps hold.
 *   Shifting earlier is limited to 1 hour.
 * - With-food doses line up with their meal (one scheduled within 90 min of the dose).
 * - Safety rules always win, pushing items later when needed:
 *   - A meal waits at least min(usual gap, 3 h) after the previous meal, and 1 h after an
 *     empty-stomach dose.
 *   - Empty-stomach doses wait 2 h after a logged meal or a with-food dose.
 *   - Doses keep `spacingHours` from other medications, and repeat doses of the same medication
 *     keep their usual gap (up to 1 h shorter).
 * - A dose that's overdue and not logged yet counts as happening now, so the doses that depend on
 *   it keep moving later until it's taken or skipped (pass `now`).
 * Pending doses also get `earliest`: the soonest the rules allow, from what you've logged.
 * Without a routine, only the dose rules apply.
 */
export function planTimeline(
  meds: Medication[],
  log: DoseLogEntry[],
  date: string,
  routine?: Routine,
  routineLog: RoutineLogEntry[] = [],
  now?: number,
): TimelineItem[] {
  const midnight = parseDate(date).getTime();
  const toMinutes = (at: number) => Math.round((at - midnight) / 60000);
  const nowMinutes = now === undefined ? -Infinity : toMinutes(now);

  const doses: TimelineItem[] = meds.flatMap((med) =>
    med.doseTimes.map((t, i) => {
      const key = doseKey(date, med.id, i);
      const entry = log.find((e) => e.key === key) ?? null;
      return {
        kind: 'dose' as const,
        med,
        doseIndex: i,
        key,
        scheduled: t,
        planned: t,
        reason: null,
        entry,
        takenAt: entry?.status === 'taken' ? toMinutes(entry.at) : null,
        earliest: null,
      };
    }),
  );
  const routineItems: TimelineItem[] = routine
    ? ROUTINE_EVENTS.map((event) => {
        const key = routineKey(date, event);
        return {
          kind: 'routine' as const,
          event,
          key,
          scheduled: routine[event],
          planned: routine[event],
          reason: null,
          entry: routineLog.find((e) => e.key === key) ?? null,
        };
      })
    : [];
  // Routine events come first when times tie, so a meal is placed before its with-food dose.
  const items = [...routineItems, ...doses].sort(
    (a, b) => a.scheduled - b.scheduled || (a.kind === 'routine' ? -1 : 1) - (b.kind === 'routine' ? -1 : 1),
  );

  /** The most recent thing you logged, which later items follow. */
  let anchor: { scheduled: Minutes; actual: Minutes; label: string } | null = null;
  let lastMeal: { event: RoutineEvent; scheduled: Minutes; time: Minutes; logged: boolean } | null = null;
  let lastEmptyDose: { med: Medication; time: Minutes; waiting: boolean; logged: boolean } | null = null;
  const doseEvents: { med: Medication; scheduled: Minutes; time: Minutes; waiting: boolean; logged: boolean }[] = [];
  const mealTimes = new Map<RoutineEvent, Minutes>();

  /** Shift a pending item with the most recent logged item, if it's close enough after it. */
  const follow = (item: TimelineItem) => {
    if (!anchor) return;
    const since = item.scheduled - anchor.scheduled;
    const drift = Math.max(-MAX_EARLIER, anchor.actual - anchor.scheduled);
    if (since < 0 || since > FOLLOW_WINDOW || Math.abs(drift) < 5) return;
    item.planned = item.scheduled + drift;
    item.reason = `${anchor.label} ${hoursText(Math.abs(anchor.actual - anchor.scheduled))} ${drift < 0 ? 'earlier' : 'later'}`;
  };

  // Safety rules: the latest lower bound wins. `fromLog` marks bounds based only on logged times.
  let floor: { at: number; why: string } | null = null;
  let loggedFloor: number | null = null;
  const atLeast = (at: number, why: string, fromLog: boolean) => {
    if (!floor || at > floor.at) floor = { at, why };
    if (fromLog && (loggedFloor === null || at > loggedFloor)) loggedFloor = at;
  };
  const applyFloor = (item: TimelineItem) => {
    const f = floor as { at: number; why: string } | null;
    if (f && f.at > item.planned) {
      item.planned = round5(f.at);
      item.reason = f.why;
    }
    floor = null;
  };

  for (const item of items) {
    floor = null;
    loggedFloor = null;

    if (item.kind === 'routine') {
      if (item.entry?.status === 'skipped') continue;
      const done = item.entry?.status === 'done';
      if (done) {
        item.planned = toMinutes(item.entry!.at);
        anchor = {
          scheduled: item.scheduled,
          actual: item.planned,
          label: item.event === 'wake' ? 'You woke up' : `${ROUTINE_LABEL[item.event]} was`,
        };
      } else {
        if (item.event === 'wake') continue;
        follow(item);
        if (lastMeal) {
          const gap = Math.min(item.scheduled - lastMeal.scheduled, 180);
          atLeast(lastMeal.time + gap, `${hoursText(gap)} after ${ROUTINE_LABEL[lastMeal.event].toLowerCase()}`, false);
        }
        if (lastEmptyDose) {
          atLeast(
            lastEmptyDose.time + 60,
            `1 hour after ${shortName(lastEmptyDose.med.name)}${lastEmptyDose.waiting ? ' (not taken yet)' : ''}`,
            false,
          );
        }
        applyFloor(item);
      }
      if (item.event === 'wake') continue;
      lastMeal = { event: item.event, scheduled: item.scheduled, time: item.planned, logged: done };
      mealTimes.set(item.event, item.planned);
      continue;
    }

    // Doses
    const d = item;
    if (d.entry?.status === 'skipped') continue;
    if (d.takenAt !== null) {
      d.planned = d.takenAt;
      anchor = { scheduled: d.scheduled, actual: d.planned, label: `${shortName(d.med.name)} was taken` };
    } else {
      follow(d);
      if (d.med.foodRule === 'with_food' && routine) {
        // Line up with the meal scheduled closest to this dose (within 90 minutes), early or late.
        const meal = MEALS.map((m) => ({ m, diff: Math.abs(routine[m] - d.scheduled) }))
          .filter((x) => x.diff <= 90)
          .sort((a, b) => a.diff - b.diff)[0]?.m;
        const mealTime = meal ? mealTimes.get(meal) : undefined;
        if (meal && mealTime !== undefined && mealTime !== d.planned) {
          d.planned = mealTime;
          d.reason = mealTime === d.scheduled ? null : `With ${ROUTINE_LABEL[meal].toLowerCase()}`;
        }
      }
      for (const e of doseEvents) {
        const name = shortName(e.med.name) + (e.waiting ? ' (not taken yet)' : '');
        if (e.med.id === d.med.id) {
          atLeast(
            e.time + (d.scheduled - e.scheduled) - 60,
            `Keeps about ${Math.round((d.scheduled - e.scheduled) / 60)} hours after your last dose${e.waiting ? ' (not taken yet)' : ''}`,
            e.logged,
          );
          continue;
        }
        const gap = Math.max(d.med.spacingHours ?? 0, e.med.spacingHours ?? 0) * 60;
        if (gap > 0) atLeast(e.time + gap, `${gap / 60} hours after ${name}`, e.logged);
        if (d.med.foodRule === 'empty_stomach' && e.med.foodRule === 'with_food') {
          atLeast(e.time + 120, `2 hours after ${name} and food`, e.logged);
        }
        if (d.med.foodRule === 'with_food' && e.med.foodRule === 'empty_stomach') {
          atLeast(e.time + 60, `1 hour after ${name} (empty stomach)`, e.logged);
        }
      }
      if (d.med.foodRule === 'empty_stomach' && lastMeal?.logged) {
        atLeast(lastMeal.time + 120, `2 hours after ${ROUTINE_LABEL[lastMeal.event].toLowerCase()}`, true);
      }
      const lf = loggedFloor as number | null;
      d.earliest = lf === null ? null : round5(lf);
      applyFloor(d);
    }
    // An overdue dose that isn't logged yet will be taken now at the earliest.
    const waiting = d.takenAt === null && d.planned < nowMinutes;
    const time = waiting ? nowMinutes : d.planned;
    const logged = d.takenAt !== null;
    doseEvents.push({ med: d.med, scheduled: d.scheduled, time, waiting, logged });
    if (d.med.foodRule === 'empty_stomach') lastEmptyDose = { med: d.med, time, waiting, logged };
  }
  return items;
}

/** The day's doses (see planTimeline for the rules). */
export function planDay(
  meds: Medication[],
  log: DoseLogEntry[],
  date: string,
  routine?: Routine,
  routineLog?: RoutineLogEntry[],
  now?: number,
): PlannedDose[] {
  return planTimeline(meds, log, date, routine, routineLog, now).filter(
    (i): i is PlannedDose & { kind: 'dose' } => i.kind === 'dose',
  );
}

export type MissedDose = PlannedDose & { date: string; dueAt: number };

/**
 * Doses from earlier days that were due but never logged as taken or skipped, newest first.
 * Looks back `daysBack` days, starting from the first day you ever logged a dose or routine event,
 * so days before you started tracking don't show up (days since then count even if nothing was
 * logged that day). A late dose that moved past midnight counts once its time has passed.
 */
export function findMissedDoses(
  meds: Medication[],
  log: DoseLogEntry[],
  routine: Routine | undefined,
  routineLog: RoutineLogEntry[],
  now = Date.now(),
  daysBack = 2,
): MissedDose[] {
  const out: MissedDose[] = [];
  const firstTracked = [...log, ...routineLog].map((e) => e.key.split('|')[0]).sort()[0];
  if (!firstTracked) return out;
  for (let back = 1; back <= daysBack; back++) {
    const day = new Date(now);
    day.setDate(day.getDate() - back);
    const date = todayString(day);
    if (date < firstTracked) continue;
    const midnight = parseDate(date).getTime();
    // Plan the day from what was logged, without treating overdue doses as "happening now":
    // otherwise one missed dose would push the next ones past the current time and hide them.
    for (const d of planDay(meds, log, date, routine, routineLog)) {
      const dueAt = midnight + d.planned * 60000;
      if (!d.entry && dueAt <= now) out.push({ ...d, date, dueAt });
    }
  }
  return out.sort((a, b) => b.dueAt - a.dueAt);
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

const DOSE_PREFIX = 'med-';
const REFILL_PREFIX = 'refill-';
const SNOOZE_PREFIX = 'snooze-';
export const DOSE_CATEGORY = 'dose';

type DoseData = { kind: 'dose'; medId: string; doseIndex: number; date: string };

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

type ReminderStep = 'first' | 'repeat' | 'last';

function doseContent(med: Medication, doseIndex: number, date: string, step: ReminderStep = 'first', waiting: string[] = []) {
  const name = shortName(med.name);
  const pills = `${med.pillsPerDose} pill${med.pillsPerDose === 1 ? '' : 's'} · ${FOOD_RULE_HINT[med.foodRule]}`;
  const held = waiting.map((w) => (w === name ? `your next ${w} dose` : w));
  const heldText = listNames(held);
  const onHold = held.length
    ? ` ${heldText.charAt(0).toUpperCase()}${heldText.slice(1)} ${held.length === 1 ? 'is' : 'are'} on hold until you do.`
    : '';
  const text =
    step === 'first'
      ? { title: `Time for ${name}`, body: pills }
      : step === 'repeat'
        ? { title: `Reminder: ${name}`, body: `Not logged yet · ${pills}` }
        : { title: `Still need to take ${name}?`, body: `Tap Taken or Skip so I can plan the rest of your day.${onHold}` };
  return {
    ...text,
    data: { kind: 'dose', medId: med.id, doseIndex, date } satisfies DoseData,
    categoryIdentifier: DOSE_CATEGORY,
  };
}

const listNames = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** "CellCept (mycophenolate mofetil)" -> "CellCept" for short notification titles. */
export const shortName = (name: string) => name.replace(/\s*\(.*\)\s*$/, '').trim() || name;

/** iOS keeps at most 64 pending notifications; leave room for UV and sunscreen alerts. */
const MAX_DOSE_NOTIFICATIONS = 48;

/**
 * Minutes after a dose is due to remind again if it hasn't been logged. The last one says which
 * doses are waiting on it.
 */
const REPEAT_AFTER = [0, 60, 120];

// Snoozes, saved so they survive the reminders being rescheduled.
const SNOOZE_KEY = 'mylupus.snoozes';
const loadSnoozes = () => readJSON<Record<string, number>>(SNOOZE_KEY, {});

/**
 * Replace dose and refill notifications to match the medication list and what's been logged.
 *
 * Each day, only the next dose that hasn't been logged gets reminders: at its time, then again
 * 1 and 2 hours later until you tap Taken, Snooze, or Skip. Doses after it wait,
 * because their times depend on when you actually take it; they're scheduled as soon as it's
 * logged. Called whenever the app opens or something is logged.
 */
export async function rescheduleMedNotifications(meds?: Medication[]) {
  if (Platform.OS === 'web') return;
  meds = meds ?? (await loadMeds());

  await cancelByPrefix(DOSE_PREFIX, REFILL_PREFIX, SNOOZE_PREFIX);
  if (meds.length === 0 || !remindersOn('meds')) return;

  let permission = await getNotificationPermission();
  if (permission === 'undetermined') permission = await requestNotificationPermission();
  if (permission !== 'granted') return;

  const [log, routine, routineLog, snoozes] = await Promise.all([
    loadDoseLog(),
    loadRoutine(),
    loadRoutineLog(),
    loadSnoozes(),
  ]);
  const now = Date.now();
  await dismissLoggedReminders(log);

  let budget = MAX_DOSE_NOTIFICATIONS;
  // Start with yesterday, for a late-night dose that moved past midnight.
  for (let offset = -1; offset < 14 && budget > 0; offset++) {
    const day = new Date(now);
    day.setDate(day.getDate() + offset);
    const date = todayString(day);
    const midnight = parseDate(date).getTime();
    const pending = planDay(meds, log, date, routine, routineLog, now)
      .filter((d) => !d.entry)
      .sort((a, b) => a.planned - b.planned);
    if (pending.length === 0) continue;

    // The next dose, plus any others due at the same time (e.g. two pills with breakfast).
    const first = pending[0].planned;
    const next = pending.filter((d) => d.planned - first <= 10);
    const waiting = pending.filter((d) => !next.includes(d)).map((d) => shortName(d.med.name));
    const uniqueWaiting = [...new Set(waiting)];

    for (const d of next) {
      const due = Math.max(midnight + d.planned * 60000, snoozes[d.key] ?? 0);
      for (const [n, after] of REPEAT_AFTER.entries()) {
        const when = due + after * 60000;
        if (when <= now + 30000 || budget <= 0) continue;
        const step: ReminderStep = n === 0 ? 'first' : n === REPEAT_AFTER.length - 1 ? 'last' : 'repeat';
        await Notifications.scheduleNotificationAsync({
          identifier: `${DOSE_PREFIX}${d.med.id}-${d.doseIndex}-${date}-${n}`,
          content: doseContent(d.med, d.doseIndex, date, step, uniqueWaiting),
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(when) },
        });
        budget--;
      }
    }
  }

  for (const med of meds) {
    const supply = supplyInfo(med);
    if (!supply) continue;
    for (const daysBefore of [7, 3]) {
      const when = new Date(supply.runOut);
      when.setDate(when.getDate() - daysBefore);
      when.setHours(10, 0, 0, 0);
      if (when.getTime() <= now) continue;
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

/** Clear reminders already on the lock screen for doses that have since been logged. */
async function dismissLoggedReminders(log: DoseLogEntry[]) {
  try {
    const logged = new Set(log.map((e) => e.key));
    const shown = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      shown
        .filter((n) => {
          const data = n.request.content.data as Partial<DoseData> | undefined;
          return (
            data?.kind === 'dose' &&
            data.date &&
            data.medId &&
            data.doseIndex !== undefined &&
            logged.has(doseKey(data.date, data.medId, data.doseIndex))
          );
        })
        .map((n) => Notifications.dismissNotificationAsync(n.request.identifier)),
    );
  } catch {
    // Tidying up is a bonus.
  }
}

/** Remind again in `minutes`, then keep repeating from there until the dose is logged. */
export async function snoozeDose(med: Medication, doseIndex: number, date = todayString(), minutes = 15) {
  const snoozes = await loadSnoozes();
  const cutoff = Date.now() - 2 * 86400000;
  for (const [k, until] of Object.entries(snoozes)) if (until < cutoff) delete snoozes[k];
  snoozes[doseKey(date, med.id, doseIndex)] = Date.now() + minutes * 60000;
  await writeJSON(SNOOZE_KEY, snoozes);
  await rescheduleMedNotifications();
}

const handledResponses = new Set<string>();

async function handleDoseResponse(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data as Partial<DoseData> | undefined;
  if (data?.kind !== 'dose' || !data.medId || data.doseIndex === undefined) return false;
  const action = response.actionIdentifier;
  const id = `${response.notification.request.identifier}|${response.notification.date}|${action}`;
  if (handledResponses.has(id)) return false;
  handledResponses.add(id);
  // A late-night dose answered after midnight still belongs to the day it was scheduled.
  const date = data.date ?? todayString(new Date(response.notification.date));
  const key = doseKey(date, data.medId, data.doseIndex);

  if (action === 'taken') await logDose(key, 'taken');
  else if (action === 'skip') await logDose(key, 'skipped');
  else if (action === 'snooze') {
    const med = (await loadMeds()).find((m) => m.id === data.medId);
    if (med) await snoozeDose(med, data.doseIndex, date);
    return true;
  } else return false;
  await rescheduleMedNotifications();
  return true;
}

/**
 * Handle Taken / Snooze / Skip pressed on a dose notification, including the one that opened the
 * app if it wasn't running. Returns a cleanup function.
 */
export function listenForDoseActions(onChange?: () => void): () => void {
  if (Platform.OS === 'web') return () => {};
  const handle = async (response: Notifications.NotificationResponse) => {
    if (await handleDoseResponse(response)) onChange?.();
  };
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  try {
    const last = Notifications.getLastNotificationResponse();
    if (last) {
      Notifications.clearLastNotificationResponse();
      handle(last);
    }
  } catch {
    // Older runtimes: the listener above still handles taps while the app is running.
  }
  return () => sub.remove();
}
