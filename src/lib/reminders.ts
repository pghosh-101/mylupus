import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { scheduleEveningReminder } from '@/lib/daily';
import { loadSavedPlace } from '@/lib/location';
import { rescheduleMedNotifications } from '@/lib/meds';
import { DEV_COPY, remindersOn, scheduleMorningAlerts } from '@/lib/notifications';
import { cancelReminder } from '@/lib/sunscreen';

/**
 * Bring every kind of reminder in line with the current settings: schedule what's on, cancel
 * what's off. Run at startup and after settings change.
 */
export async function applyReminderSettings() {
  if (Platform.OS === 'web') return;
  if (DEV_COPY) {
    // A dev-server copy clears anything it scheduled before this rule existed.
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
    return;
  }
  await Promise.all([
    rescheduleMedNotifications().catch(() => {}),
    scheduleEveningReminder().catch(() => {}),
    remindersOn('sunscreen') ? Promise.resolve() : cancelReminder().catch(() => {}),
    loadSavedPlace()
      .then((place) => (place ? scheduleMorningAlerts(place, true) : 0))
      .catch(() => {}),
  ]);
}
