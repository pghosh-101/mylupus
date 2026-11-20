import { useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';

import { ActionButton, Field, FormSheet, Input, Segmented, TimeStepper } from '@/components/meds/controls';
import { ThemedText } from '@/components/themed-text';
import { loadSavedPlace } from '@/lib/location';
import { scheduleEveningReminder } from '@/lib/daily';
import { rescheduleMedNotifications } from '@/lib/meds';
import {
  getNotificationPermission,
  requestNotificationPermission,
  scheduleMorningAlerts,
  type PermissionState,
} from '@/lib/notifications';
import { saveSettings, Settings, type AppSettings } from '@/lib/settings';

/** Edit name, UV limit, and morning alert time; or replay the welcome screens. */
export function SettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [uv, setUv] = useState(2);
  const [alertAt, setAlertAt] = useState(8 * 60);
  const [appearance, setAppearance] = useState<AppSettings['appearance']>('system');
  const [notif, setNotif] = useState<PermissionState | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName(Settings.name);
    setUv(Settings.uvThreshold);
    setAlertAt(Settings.morningAlert.hour * 60 + Settings.morningAlert.minute);
    setAppearance(Settings.appearance);
    if (Platform.OS !== 'web') getNotificationPermission().then(setNotif);
  }, [visible]);

  const turnOnNotifications = async () => {
    const status = await requestNotificationPermission();
    setNotif(status);
    if (status !== 'granted') return;
    scheduleEveningReminder().catch(() => {});
    rescheduleMedNotifications().catch(() => {});
    const place = await loadSavedPlace();
    if (place) scheduleMorningAlerts(place, true).catch(() => {});
  };

  const save = async () => {
    const alertChanged =
      uv !== Settings.uvThreshold || alertAt !== Settings.morningAlert.hour * 60 + Settings.morningAlert.minute;
    onClose();
    await saveSettings({
      name: name.trim(),
      uvThreshold: uv,
      morningAlert: { hour: Math.floor(alertAt / 60), minute: alertAt % 60 },
      appearance,
    });
    if (alertChanged && Platform.OS !== 'web') {
      const place = await loadSavedPlace();
      if (place) scheduleMorningAlerts(place, true).catch(() => {});
    }
  };

  return (
    <FormSheet visible={visible} title="Settings" saveLabel="Save settings" onClose={onClose} onSave={save}>
      <Field label="Your name" hint="Used in greetings. Leave blank for none.">
        <Input value={name} onChangeText={setName} placeholder="Your first name" autoCapitalize="words" autoCorrect={false} />
      </Field>
      <Field label="Protect myself when UV is above" hint="Ask your doctor if you're not sure.">
        <Segmented options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} value={uv} onChange={setUv} />
      </Field>
      <Field label="Morning UV alert">
        <TimeStepper value={alertAt} onChange={setAlertAt} />
      </Field>
      <Field label="Appearance" hint="System follows your device's light or dark setting.">
        <Segmented
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          value={appearance}
          onChange={setAppearance}
        />
      </Field>
      {Platform.OS !== 'web' && notif && (
        <Field
          label="Notifications"
          hint="Medication reminders, the morning UV alert, sunscreen reapply reminders, and the evening check-in.">
          {notif === 'granted' ? (
            <ThemedText>✓ On</ThemedText>
          ) : notif === 'undetermined' ? (
            <ActionButton label="Turn on notifications" kind="secondary" onPress={turnOnNotifications} />
          ) : (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                Notifications are off for Expo Go. Turn them on in iPhone Settings.
              </ThemedText>
              <ActionButton label="Open iPhone Settings" kind="secondary" onPress={() => Linking.openSettings()} />
            </>
          )}
        </Field>
      )}
      <Field label="Welcome screens">
        <ThemedText type="small" themeColor="textSecondary">
          See the intro again, including the permission prompts.
        </ThemedText>
        <ActionButton
          label="Show welcome again"
          kind="secondary"
          onPress={async () => {
            onClose();
            await saveSettings({ onboarded: false });
          }}
        />
      </Field>
    </FormSheet>
  );
}
