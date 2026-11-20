import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CheckinCard } from '@/components/log/checkin-cards';
import { MorningAlertCard } from '@/components/morning-alert-card';
import { Card, Screen } from '@/components/screen';
import { SettingsSheet } from '@/components/settings-sheet';
import { ThemedText } from '@/components/themed-text';
import { HeadsUpCard } from '@/components/today/heads-up-card';
import { NextDoseCard } from '@/components/today/next-dose-card';
import { UvCard } from '@/components/uv-card';
import { useTheme } from '@/hooks/use-theme';
import { Settings, withName } from '@/lib/settings';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function TodayScreen() {
  // Set after mount so the pre-rendered web page and the live clock never disagree.
  const [title, setTitle] = useState('Today');
  const [date, setDate] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const theme = useTheme();
  useEffect(() => {
    setTitle(`${greeting()}${withName()}`);
    setDate(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }));
  }, []);

  return (
    <Screen title={title} subtitle={date}>
      <NextDoseCard />
      <CheckinCard compact />
      <HeadsUpCard />
      <UvCard />
      <MorningAlertCard />
      <Pressable onPress={() => setSettingsOpen(true)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
        <Card>
          <View style={styles.row}>
            <View style={styles.flex}>
              <ThemedText type="smallBold">Settings</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {Settings.name ? `${Settings.name} · ` : ''}UV limit {Settings.uvThreshold} · Morning alert{' '}
                {new Date(2000, 0, 1, Settings.morningAlert.hour, Settings.morningAlert.minute).toLocaleTimeString(undefined, {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </ThemedText>
            </View>
            <ThemedText style={{ color: theme.accent }}>›</ThemedText>
          </View>
        </Card>
      </Pressable>
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          MyLupus helps you track patterns to discuss with your care team. It isn&apos;t medical advice.
        </ThemedText>
      </Card>
      <SettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1, gap: 2 },
});
