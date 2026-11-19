import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { loadSavedPlace } from '@/lib/location';
import { scheduleEveningReminder } from '@/lib/daily';
import {
  getNotificationPermission,
  requestNotificationPermission,
  scheduleMorningAlerts,
  sendTestMorningAlert,
  type PermissionState,
} from '@/lib/notifications';
import { Settings } from '@/lib/settings';
import { formatTime } from '@/lib/uv';

export function MorningAlertCard() {
  const [permission, setPermission] = useState<PermissionState | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const { hour, minute } = Settings.morningAlert;
  const timeLabel = formatTime(new Date(2000, 0, 1, hour, minute));

  useEffect(() => {
    getNotificationPermission().then(setPermission);
  }, []);

  const turnOn = useCallback(async () => {
    const status = await requestNotificationPermission();
    setPermission(status);
    if (status !== 'granted') return;
    scheduleEveningReminder().catch(() => {});
    const place = await loadSavedPlace();
    if (!place) return setNote('Alerts will be scheduled once your UV loads.');
    try {
      const n = await scheduleMorningAlerts(place, true);
      setNote(n ? `Scheduled the next ${n} morning alert${n === 1 ? '' : 's'}.` : null);
    } catch {
      setNote("Couldn't reach the weather service. Alerts will be scheduled next time the UV loads.");
    }
  }, []);

  const test = useCallback(async () => {
    const place = await loadSavedPlace();
    if (!place) return setNote('Load your UV first, then try the test.');
    try {
      await sendTestMorningAlert(place);
      setNote('Test alert coming in 5 seconds. You can lock your phone to see it on the lock screen.');
    } catch {
      setNote("Couldn't reach the weather service for the test. Try again in a moment.");
    }
  }, []);

  if (Platform.OS === 'web' || permission === null) return null;

  return (
    <Card>
      <ThemedText type="smallBold" themeColor="textSecondary">
        MORNING UV ALERT
      </ThemedText>
      <ThemedText>
        {permission === 'granted'
          ? `On · every day at ${timeLabel}`
          : `Get a ${timeLabel} message with the UV right now, today's projected max, and when it's above your limit.`}
      </ThemedText>

      <View style={styles.row}>
        {permission === 'granted' && <SmallButton label="Send a test now" onPress={test} />}
        {permission === 'undetermined' && <SmallButton label="Turn on" onPress={turnOn} primary />}
        {permission === 'denied' && (
          <SmallButton label="Open Settings" onPress={() => Linking.openSettings()} primary />
        )}
      </View>
      {permission === 'denied' && (
        <ThemedText type="small" themeColor="textSecondary">
          Notifications are off for Expo Go. Turn them on in Settings, then come back.
        </ThemedText>
      )}
      {note && (
        <ThemedText type="small" themeColor="textSecondary">
          {note}
        </ThemedText>
      )}
      <ThemedText type="small" themeColor="textSecondary" style={{ opacity: 0.8 }}>
        Numbers in the alert are projections from the last time you opened the app.
      </ThemedText>
    </Card>
  );
}

function SmallButton({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: primary ? theme.accent : theme.backgroundSelected, opacity: pressed ? 0.7 : 1 },
      ]}>
      <ThemedText type="button" style={{ color: primary ? theme.onAccent : theme.accent }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  button: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: 12 },
});
