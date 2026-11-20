import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { ActionButton, Field, FormSheet, Input, Segmented, TimeStepper } from '@/components/meds/controls';
import { ThemedText } from '@/components/themed-text';
import { loadSavedPlace } from '@/lib/location';
import { scheduleMorningAlerts } from '@/lib/notifications';
import { saveSettings, Settings } from '@/lib/settings';

/** Edit name, UV limit, and morning alert time; or replay the welcome screens. */
export function SettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [uv, setUv] = useState(2);
  const [alertAt, setAlertAt] = useState(8 * 60);

  useEffect(() => {
    if (!visible) return;
    setName(Settings.name);
    setUv(Settings.uvThreshold);
    setAlertAt(Settings.morningAlert.hour * 60 + Settings.morningAlert.minute);
  }, [visible]);

  const save = async () => {
    const alertChanged =
      uv !== Settings.uvThreshold || alertAt !== Settings.morningAlert.hour * 60 + Settings.morningAlert.minute;
    onClose();
    await saveSettings({
      name: name.trim(),
      uvThreshold: uv,
      morningAlert: { hour: Math.floor(alertAt / 60), minute: alertAt % 60 },
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
