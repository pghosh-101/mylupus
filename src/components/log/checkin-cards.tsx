import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { EveningForm } from '@/components/log/evening-form';
import { SleepForm } from '@/components/log/sleep-form';
import { ActionButton } from '@/components/meds/controls';
import { Card } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  loadEvening,
  loadSleep,
  logRaynaud,
  saveEvening,
  saveSleep,
  warningSigns,
  type EveningEntry,
  type SleepEntry,
} from '@/lib/daily';
import { loadSavedPlace } from '@/lib/location';
import { todayString } from '@/lib/meds';
import { fetchCurrentUv, formatTime } from '@/lib/uv';

/** Today's sleep and evening check-ins, plus Raynaud's quick log. */
export function CheckinCard({
  compact,
  onSaved,
}: {
  /** On the Today screen: only show what's still to do. */
  compact?: boolean;
  onSaved?: () => void;
}) {
  const theme = useTheme();
  const today = todayString();
  const [sleep, setSleep] = useState<SleepEntry | null>(null);
  const [evening, setEvening] = useState<EveningEntry | null>(null);
  const [form, setForm] = useState<'sleep' | 'evening' | null>(null);
  const [raynaudNote, setRaynaudNote] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const [s, e] = await Promise.all([loadSleep(), loadEvening()]);
    setSleep(s[today] ?? null);
    setEvening(e[today] ?? null);
    setLoaded(true);
  }, [today]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const logRaynaudNow = async () => {
    let tempF: number | null = null;
    try {
      const place = await loadSavedPlace();
      if (place) tempF = (await fetchCurrentUv(place.latitude, place.longitude)).tempF ?? null;
    } catch {
      // Temperature is optional.
    }
    await logRaynaud({ at: Date.now(), tempF });
    setRaynaudNote(`Raynaud's logged at ${formatTime(new Date())}${tempF !== null ? ` (${Math.round(tempF)}°F outside)` : ''}.`);
    onSaved?.();
  };

  if (!loaded) return null;
  const hour = new Date().getHours();
  const showSleep = !compact || !sleep;
  const showEvening = !compact || (!evening && hour >= 18);
  if (compact && !showSleep && !showEvening) return null;

  return (
    <Card>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {compact ? 'CHECK IN' : 'TODAY'}
      </ThemedText>

      {showSleep && (
        <Row
          title="Sleep"
          status={sleep ? `${sleep.hours} hours · ${sleep.quality === 'ok' ? 'OK' : sleep.quality}` : 'How did you sleep last night?'}
          done={Boolean(sleep)}
          actionLabel={sleep ? 'Edit' : 'Log sleep'}
          onPress={() => setForm('sleep')}
        />
      )}
      {showEvening && (
        <Row
          title="Evening check-in"
          status={
            evening
              ? `Stress ${['none', 'mild', 'moderate', 'severe'][evening.stress]} · ${evening.homeMeals} home / ${evening.outMeals} out`
              : 'Symptoms, stress, and meals'
          }
          done={Boolean(evening)}
          actionLabel={evening ? 'Edit' : 'Check in'}
          onPress={() => setForm('evening')}
        />
      )}

      {!compact && (
        <View style={[styles.row, { borderColor: theme.backgroundSelected }]}>
          <View style={styles.flex}>
            <ThemedText type="smallBold">Raynaud&apos;s episode</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {raynaudNote ?? 'Tap when your fingers go cold or change color.'}
            </ThemedText>
          </View>
          <ActionButton label="Log now" kind="secondary" onPress={logRaynaudNow} />
        </View>
      )}

      <SleepForm
        visible={form === 'sleep'}
        date={today}
        existing={sleep}
        onClose={() => setForm(null)}
        onSave={async (entry) => {
          setForm(null);
          await saveSleep(entry);
          await reload();
          onSaved?.();
        }}
      />
      <EveningForm
        visible={form === 'evening'}
        date={today}
        existing={evening}
        onClose={() => setForm(null)}
        onSave={async (entry) => {
          setForm(null);
          await saveEvening(entry);
          await reload();
          onSaved?.();
          const warning = warningSigns(entry);
          if (warning) Alert.alert('Worth a call to your doctor', warning);
        }}
      />
    </Card>
  );
}

function Row({
  title,
  status,
  done,
  actionLabel,
  onPress,
}: {
  title: string;
  status: string;
  done: boolean;
  actionLabel: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.row, { borderColor: theme.backgroundSelected }]}>
      <View style={styles.flex}>
        <ThemedText type="smallBold">
          {done ? '✓ ' : ''}
          {title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {status}
        </ThemedText>
      </View>
      {done ? (
        <Pressable onPress={onPress} hitSlop={8}>
          <ThemedText type="small" style={{ color: theme.accent }}>
            {actionLabel}
          </ThemedText>
        </Pressable>
      ) : (
        <ActionButton label={actionLabel} onPress={onPress} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderTopWidth: 1,
    paddingTop: Spacing.two,
  },
  flex: { flex: 1, gap: Spacing.half },
});
