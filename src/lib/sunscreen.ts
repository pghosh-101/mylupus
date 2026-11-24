import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { success } from '@/lib/haptics';
import type { Place } from '@/lib/location';
import { getNotificationPermission, remindersOn, requestNotificationPermission } from '@/lib/notifications';
import { Settings } from '@/lib/settings';
import { fetchDailyProjections, formatHour, formatTime } from '@/lib/uv';

export const REAPPLY_MS = 2 * 60 * 60 * 1000;

const STATE_KEY = 'mylupus.sunscreen';
const LOG_KEY = 'mylupus.sunscreenLog';
const REMINDER_ID = 'sunscreen-reapply';

/** The current outing: when sunscreen went on, and the reminder (if one was scheduled). */
export type SunscreenState = {
  appliedAt: number;
  /** When to reapply, or null if UV will be within the limit by then. */
  reapplyAt: number | null;
  /** Whether a notification was scheduled for reapplyAt. */
  notified: boolean;
};

/**
 * History of sunscreen events, kept for pattern-finding. 'inside' ends an outing; 'stayed_in'
 * marks a whole day spent indoors (`date`), so a high-UV day without sunscreen isn't counted
 * against you.
 */
export type SunscreenEvent = { type: 'applied' | 'inside' | 'stayed_in'; at: number; date?: string };

export async function loadSunscreenState(): Promise<SunscreenState | null> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as SunscreenState) : null;
  } catch {
    return null;
  }
}

async function saveState(state: SunscreenState | null) {
  try {
    if (state) await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
    else await AsyncStorage.removeItem(STATE_KEY);
  } catch {
    // Not fatal.
  }
}

async function logEvent(event: SunscreenEvent) {
  try {
    const raw = await AsyncStorage.getItem(LOG_KEY);
    const log: SunscreenEvent[] = raw ? JSON.parse(raw) : [];
    log.push(event);
    await AsyncStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-2000)));
  } catch {
    // Not fatal.
  }
}

export async function loadSunscreenLog(): Promise<SunscreenEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function cancelReminder() {
  if (Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => {});
}

const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Log sunscreen and schedule a reminder in 2 hours, but only if UV is projected to still be
 * above the limit then. Returns a short message describing what happened.
 */
export async function applySunscreen(place: Place): Promise<{ state: SunscreenState; message: string }> {
  const now = Date.now();
  success();
  await logEvent({ type: 'applied', at: now });
  await cancelReminder();

  const remindDate = new Date(now + REAPPLY_MS);
  const limit = Settings.uvThreshold;
  let message: string;
  let notified = false;

  // Is UV projected above the limit at the 2-hour mark? Only then is a reapply reminder useful.
  let projectedUv: number | null = null;
  let stillHigh = true; // If the forecast is unavailable, remind anyway (safer).
  let risesLater: number | null = null; // Hour UV goes above the limit later that day, if it does.
  try {
    const days = await fetchDailyProjections(place.latitude, place.longitude, limit, 8);
    const day = days.find((d) => d.date === localDate(remindDate));
    if (day) {
      // Blend the hourly values to the exact minute of the reminder.
      const hour = remindDate.getHours();
      const thisHour = day.hours.find((h) => h.hour === hour)?.uv;
      const nextHour = day.hours.find((h) => h.hour === hour + 1)?.uv ?? thisHour;
      if (thisHour !== undefined && nextHour !== undefined) {
        projectedUv = thisHour + (nextHour - thisHour) * (remindDate.getMinutes() / 60);
        stillHigh = projectedUv > limit;
        if (!stillHigh && day.window && day.window.start > hour) risesLater = day.window.start;
      }
    }
  } catch {
    // Keep stillHigh = true.
  }

  if (!stillHigh) {
    message =
      `Logged. No reapply reminder needed: UV is projected to be ${projectedUv !== null ? projectedUv.toFixed(1) : `at or below ${limit}`} at ${formatTime(remindDate)}.` +
      (risesLater !== null
        ? ` It goes above ${limit} around ${formatHour(risesLater)}, so put sunscreen on again before heading out then.`
        : '');
  } else if (Platform.OS === 'web') {
    message = `Logged. Reapply around ${formatTime(remindDate)}.`;
  } else if (!remindersOn('sunscreen')) {
    message = `Logged. Reapply around ${formatTime(remindDate)}. (Sunscreen reminders are off in Settings.)`;
  } else {
    let permission = await getNotificationPermission();
    if (permission === 'undetermined') permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      message = `Logged. Turn on notifications to get a reminder. Reapply around ${formatTime(remindDate)}.`;
    } else {
      await Notifications.scheduleNotificationAsync({
        identifier: REMINDER_ID,
        content: {
          title: 'Time to reapply sunscreen',
          body:
            `It's been 2 hours` +
            (projectedUv !== null ? ` and UV is projected around ${projectedUv.toFixed(1)}` : '') +
            `. If you're back inside, open MyLupus and tap "I'm back inside".`,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: remindDate },
      });
      notified = true;
      message = `Logged. I'll remind you to reapply at ${formatTime(remindDate)}.`;
    }
  }

  const state: SunscreenState = {
    appliedAt: now,
    reapplyAt: stillHigh ? remindDate.getTime() : null,
    notified,
  };
  await saveState(state);
  return { state, message };
}

const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Days marked as spent indoors ("YYYY-MM-DD"). */
export function stayedInDays(log: SunscreenEvent[]): Set<string> {
  return new Set(log.filter((e) => e.type === 'stayed_in').map((e) => e.date ?? localDay(new Date(e.at))));
}

/** Days with sunscreen logged ("YYYY-MM-DD"). */
export function sunscreenDays(log: SunscreenEvent[]): Set<string> {
  return new Set(log.filter((e) => e.type === 'applied').map((e) => localDay(new Date(e.at))));
}

/** Mark a day (default today) as spent indoors, or clear that mark. */
export async function setStayedIn(date: string, stayedIn: boolean): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(LOG_KEY);
    const log: SunscreenEvent[] = raw ? JSON.parse(raw) : [];
    const rest = log.filter((e) => !(e.type === 'stayed_in' && (e.date ?? localDay(new Date(e.at))) === date));
    if (stayedIn) rest.push({ type: 'stayed_in', at: Date.now(), date });
    await AsyncStorage.setItem(LOG_KEY, JSON.stringify(rest.slice(-2000)));
  } catch {
    // Not fatal.
  }
}

/** Cancel the reapply reminder because you're back indoors. */
export async function backInside(): Promise<void> {
  await logEvent({ type: 'inside', at: Date.now() });
  await cancelReminder();
  await saveState(null);
}
