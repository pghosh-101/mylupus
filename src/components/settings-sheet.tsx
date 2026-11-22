import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, Switch, View } from 'react-native';

import { ActionButton, Field, FormSheet, Input, Segmented, TimeStepper } from '@/components/meds/controls';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { select } from '@/lib/haptics';
import { getNotificationPermission, requestNotificationPermission, type PermissionState } from '@/lib/notifications';
import { applyReminderSettings } from '@/lib/reminders';
import { saveSettings, Settings, type AppSettings } from '@/lib/settings';

type Notify = AppSettings['notify'];

const REMINDERS: { key: keyof Notify; label: string; hint: string }[] = [
  {
    key: 'meds',
    label: 'Medication reminders',
    hint: 'Repeats 1 and 2 hours later if you haven’t logged the dose. Also refill reminders.',
  },
  { key: 'morningUv', label: 'Morning UV alert', hint: "Today's peak UV and the hours above your limit." },
  { key: 'sunscreen', label: 'Sunscreen reapply', hint: '2 hours after you put it on, if UV is still high.' },
  { key: 'evening', label: 'Evening check-in', hint: '9 PM reminder to log your day.' },
];

/** Edit name, UV limit, reminders, location, and appearance; or replay the welcome screens. */
export function SettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [uv, setUv] = useState(2);
  const [alertAt, setAlertAt] = useState(8 * 60);
  const [appearance, setAppearance] = useState<AppSettings['appearance']>('system');
  const [notify, setNotify] = useState<Notify>(Settings.notify);
  const [useLocation, setUseLocation] = useState(true);
  const [notif, setNotif] = useState<PermissionState | null>(null);
  const [locPerm, setLocPerm] = useState<PermissionState | null>(null);
  const native = Platform.OS !== 'web';

  useEffect(() => {
    if (!visible) return;
    setName(Settings.name);
    setUv(Settings.uvThreshold);
    setAlertAt(Settings.morningAlert.hour * 60 + Settings.morningAlert.minute);
    setAppearance(Settings.appearance);
    setNotify({ ...Settings.notify });
    setUseLocation(Settings.useLocation);
    if (native) {
      getNotificationPermission().then(setNotif);
      Location.getForegroundPermissionsAsync()
        .then((p) => setLocPerm(p.status as PermissionState))
        .catch(() => {});
    }
  }, [visible, native]);

  const turnOnNotifications = async () => {
    setNotif(await requestNotificationPermission());
  };

  const toggleLocation = async (on: boolean) => {
    setUseLocation(on);
    if (on && locPerm === 'undetermined') {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocPerm(status as PermissionState);
    }
  };

  const save = async () => {
    onClose();
    await saveSettings({
      name: name.trim(),
      uvThreshold: uv,
      morningAlert: { hour: Math.floor(alertAt / 60), minute: alertAt % 60 },
      appearance,
      notify,
      useLocation,
    });
    // Reminders include your name, UV limit, and alert time, and follow the switches.
    applyReminderSettings().catch(() => {});
  };

  return (
    <FormSheet visible={visible} title="Settings" saveLabel="Save settings" onClose={onClose} onSave={save}>
      <Field label="Your name" hint="Used in greetings. Leave blank for none.">
        <Input value={name} onChangeText={setName} placeholder="Your first name" autoCapitalize="words" autoCorrect={false} />
      </Field>
      <Field label="Protect myself when UV is above" hint="Ask your doctor if you're not sure.">
        <Segmented options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} value={uv} onChange={setUv} />
      </Field>

      {native && (
        <Field label="Notifications">
          {notif === 'undetermined' && (
            <ActionButton label="Allow notifications" kind="secondary" onPress={turnOnNotifications} />
          )}
          {notif === 'denied' && (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                Notifications are blocked for Expo Go, so none of these will arrive. Allow them in iPhone Settings.
              </ThemedText>
              <ActionButton label="Open iPhone Settings" kind="secondary" onPress={() => Linking.openSettings()} />
            </>
          )}
          {REMINDERS.map((r) => (
            <View key={r.key}>
              <SwitchRow
                label={r.label}
                hint={r.hint}
                value={notify[r.key]}
                onChange={(on) => setNotify({ ...notify, [r.key]: on })}
              />
              {r.key === 'morningUv' && notify.morningUv && <TimeStepper value={alertAt} onChange={setAlertAt} />}
            </View>
          ))}
        </Field>
      )}

      {native && (
        <Field label="Location">
          <SwitchRow
            label="Use my location for UV"
            hint={
              useLocation
                ? 'Checks roughly where you are (city level) for UV.'
                : 'UV is shown for a city you pick on the Today screen.'
            }
            value={useLocation}
            onChange={toggleLocation}
          />
          {useLocation && locPerm === 'denied' && (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                Location is blocked for Expo Go. Allow it in iPhone Settings, or turn this off and pick a city.
              </ThemedText>
              <ActionButton label="Open iPhone Settings" kind="secondary" onPress={() => Linking.openSettings()} />
            </>
          )}
        </Field>
      )}

      {native && (
        <Field
          label="Camera and photos"
          hint="Only used when you scan a lab report. iPhone controls this permission: change it in iPhone Settings.">
          <ActionButton label="Open iPhone Settings" kind="secondary" onPress={() => Linking.openSettings()} />
        </Field>
      )}

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

function SwitchRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (on: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.row, { borderColor: theme.backgroundSelected }]}>
      <View style={styles.text}>
        <ThemedText type="smallBold">{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      </View>
      <Switch
        value={value}
        onValueChange={(on) => {
          select();
          onChange(on);
        }}
        trackColor={{ true: theme.accentFill, false: theme.backgroundSelected }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={theme.backgroundSelected}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, gap: 2 },
});
