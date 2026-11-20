import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DEMO } from '@/lib/demo';
import { CheckinCard } from '@/components/log/checkin-cards';
import { Card, Screen } from '@/components/screen';
import { SettingsSheet } from '@/components/settings-sheet';
import { ThemedText } from '@/components/themed-text';
import { HeadsUpCard } from '@/components/today/heads-up-card';
import { NextDoseCard } from '@/components/today/next-dose-card';
import { UvCard } from '@/components/uv-card';
import { useTheme } from '@/hooks/use-theme';
import { withName } from '@/lib/settings';

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
      {DEMO && (
        <View style={[styles.demo, { backgroundColor: theme.backgroundSelected }]}>
          <ThemedText type="small">
            <ThemedText type="smallBold">Demo · sample data</ThemedText> for a fictional user. Nothing you enter
            leaves this browser.
          </ThemedText>
        </View>
      )}
      <NextDoseCard />
      <CheckinCard compact />
      <HeadsUpCard />
      <UvCard />
      <Pressable onPress={() => setSettingsOpen(true)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
        <Card>
          <View style={styles.row}>
            <SymbolView name={{ ios: 'gearshape.fill' }} size={18} tintColor={theme.accent} fallback={null} style={styles.icon} />
            <ThemedText type="smallBold" style={styles.flex}>
              Settings
            </ThemedText>
            <ThemedText style={{ color: theme.textSecondary }}>›</ThemedText>
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
  flex: { flex: 1 },
  icon: { width: 20, height: 20 },
  demo: { borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 },
});
