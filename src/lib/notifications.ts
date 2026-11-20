import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Place } from '@/lib/location';
import { Settings, withName, type AppSettings } from '@/lib/settings';
import { fetchDailyProjections, formatHour, type DayProjection } from '@/lib/uv';

const MORNING_PREFIX = 'morning-uv-';

// Show notifications as banners even when the app is open.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * A copy of the app loaded from the dev server (`npx expo start`) doesn't schedule reminders.
 * Expo Go keeps it separate from the EAS Update copy, with its own storage and its own scheduled
 * notifications, so if both scheduled reminders the phone would get everything twice.
 * Set EXPO_PUBLIC_DEV_NOTIFICATIONS=1 to test reminders from the dev server.
 */
export const DEV_COPY = __DEV__ && process.env.EXPO_PUBLIC_DEV_NOTIFICATIONS !== '1';

export type ReminderKind = keyof AppSettings['notify'];

/** Whether reminders of this kind should be scheduled (the Settings switch, and not a dev copy). */
export const remindersOn = (kind: ReminderKind) => Platform.OS !== 'web' && !DEV_COPY && Settings.notify[kind];

/** Cancel every scheduled notification whose identifier starts with one of `prefixes`. */
export async function cancelByPrefix(...prefixes: string[]) {
  if (Platform.OS === 'web') return;
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    existing
      .filter((n) => prefixes.some((p) => n.identifier.startsWith(p)))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export async function getNotificationPermission(): Promise<PermissionState> {
  if (Platform.OS === 'web') return 'denied';
  const { status } = await Notifications.getPermissionsAsync();
  return status as PermissionState;
}

export async function requestNotificationPermission(): Promise<PermissionState> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status as PermissionState;
}

const fmt = (uv: number) => uv.toFixed(1);

/** The wording of the morning notification. Kept short so iOS doesn't cut it off. */
export function morningMessage(day: DayProjection): { title: string; body: string } {
  const limit = Settings.uvThreshold;
  const parts = [`UV now ${fmt(day.atAlertHour)}`, `max ${fmt(day.max)} at ${formatHour(day.peakHour)}`];
  parts.push(
    day.window
      ? `above ${limit} from ${formatHour(day.window.start)}–${formatHour(day.window.end)}`
      : `within your limit all day`,
  );
  return { title: `Good morning${withName()}`, body: `${parts.join(' · ')}\nTap to log your sleep.` };
}

/** Local Date for the alert time on a "YYYY-MM-DD" date, in the phone's time zone. */
function alertDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const { hour, minute } = Settings.morningAlert;
  return new Date(y, m - 1, d, hour, minute, 0);
}

let lastScheduled = 0;

/**
 * Replace the upcoming morning notifications with fresh projections for `place`.
 * Runs at most once an hour unless `force` is set. Returns how many were scheduled.
 */
export async function scheduleMorningAlerts(place: Place, force = false): Promise<number> {
  if (Platform.OS === 'web') return 0;
  if (!remindersOn('morningUv')) {
    await cancelByPrefix(MORNING_PREFIX);
    return 0;
  }
  if (!force && Date.now() - lastScheduled < 60 * 60 * 1000) return 0;
  if ((await getNotificationPermission()) !== 'granted') return 0;

  const days = await fetchDailyProjections(
    place.latitude,
    place.longitude,
    Settings.uvThreshold,
    Settings.morningAlert.hour,
  );

  await cancelByPrefix(MORNING_PREFIX);

  let count = 0;
  for (const day of days) {
    const when = alertDate(day.date);
    if (when.getTime() <= Date.now() + 60 * 1000) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: `${MORNING_PREFIX}${day.date}`,
      content: morningMessage(day),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
    });
    count++;
  }
  lastScheduled = Date.now();
  return count;
}

/** Send today's morning message in 5 seconds, so you can see what it looks like. */
export async function sendTestMorningAlert(place: Place): Promise<void> {
  const [today] = await fetchDailyProjections(
    place.latitude,
    place.longitude,
    Settings.uvThreshold,
    Settings.morningAlert.hour,
  );
  await Notifications.scheduleNotificationAsync({
    content: morningMessage(today),
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5 },
  });
}
