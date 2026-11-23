import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CardHeader } from '@/components/card-header';
import { EveningForm } from '@/components/log/evening-form';
import { RaynaudList } from '@/components/log/raynaud-list';
import { SleepForm } from '@/components/log/sleep-form';
import { ActionButton } from '@/components/meds/controls';
import { Card } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  LEVEL_LABEL,
  loadRaynaud,
  loadWeatherLog,
  saveEvening,
  saveSleep,
  warningSigns,
  type EveningEntry,
  type RaynaudEvent,
  type SleepEntry,
} from '@/lib/daily';
import { loadDoseLog, loadMeds, parseDate, shortName, todayString } from '@/lib/meds';
import type { DayWeather } from '@/lib/uv';

/** One day: everything logged, with buttons to fill in or edit its check-ins. */
export function DaySheet({
  date,
  sleep,
  evening,
  inFlare,
  onChanged,
  onClose,
}: {
  date: string | null;
  sleep: SleepEntry | undefined;
  evening: EveningEntry | undefined;
  inFlare: boolean;
  onChanged: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [form, setForm] = useState<'sleep' | 'evening' | null>(null);
  const [doses, setDoses] = useState<string[]>([]);
  const [weather, setWeather] = useState<DayWeather | null>(null);
  const [raynaud, setRaynaud] = useState<RaynaudEvent[]>([]);
  const [raynaudTick, setRaynaudTick] = useState(0);

  useEffect(() => {
    if (!date) return;
    (async () => {
      const [meds, log, w, r] = await Promise.all([loadMeds(), loadDoseLog(), loadWeatherLog(), loadRaynaud()]);
      setRaynaud(r.filter((e) => todayString(new Date(e.at)) === date));
      setDoses(
        log
          .filter((e) => e.key.startsWith(`${date}|`))
          .map((e) => {
            const med = meds.find((m) => m.id === e.key.split('|')[1]);
            const name = med ? shortName(med.name) : 'Medication';
            const time = new Date(e.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
            return e.status === 'taken' ? `${name} taken at ${time}` : `${name} skipped`;
          }),
      );
      setWeather(w[date] ?? null);
    })();
  }, [date, raynaudTick]);

  if (!date) return null;
  const title = parseDate(date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const symptoms = evening
    ? Object.entries(evening.symptoms)
        .filter(([, v]) => (v ?? 0) > 0)
        .map(([k, v]) => `${k} (${LEVEL_LABEL[v!].toLowerCase()})`)
    : [];

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView edges={['top', 'bottom']} style={[styles.sheet, { backgroundColor: theme.background }]}>
        <View style={styles.header}>
          <ThemedText type="smallBold">{title}</ThemedText>
          <Pressable onPress={onClose} hitSlop={12}>
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              Done
            </ThemedText>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          {inFlare && (
            <ThemedText type="smallBold" style={{ color: theme.sunAlert }}>
              During a logged flare
            </ThemedText>
          )}

          <Card>
            <CardHeader icon="bed.double.fill" title="SLEEP" />
            <ThemedText>{sleep ? `${sleep.hours} hours · ${sleep.quality === 'ok' ? 'OK' : sleep.quality}` : 'Not logged'}</ThemedText>
            <ActionButton label={sleep ? 'Edit sleep' : 'Add sleep'} kind="secondary" onPress={() => setForm('sleep')} />
          </Card>

          <Card>
            <CardHeader icon="checkmark.circle.fill" title="CHECK-IN" />
            {evening ? (
              <>
                <ThemedText>{symptoms.length ? symptoms.join(', ') : 'No symptoms'}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Stress {LEVEL_LABEL[evening.stress].toLowerCase()}
                  {evening.diet ? ` · ate ${evening.diet}` : ''} · {evening.homeMeals} home-cooked / {evening.outMeals} eaten out
                </ThemedText>
                {evening.dietTags.length > 0 && (
                  <ThemedText type="small" themeColor="textSecondary">
                    Food: {evening.dietTags.join(', ')}
                  </ThemedText>
                )}
                {evening.notes ? <ThemedText type="small" style={styles.note}>{evening.notes}</ThemedText> : null}
              </>
            ) : (
              <ThemedText>Not logged</ThemedText>
            )}
            <ActionButton label={evening ? 'Edit check-in' : 'Add check-in'} kind="secondary" onPress={() => setForm('evening')} />
          </Card>

          <Card>
            <CardHeader icon="pills.fill" title="MEDICATIONS" />
            {doses.length ? doses.map((d) => <ThemedText key={d} type="small">{d}</ThemedText>) : <ThemedText>Nothing logged</ThemedText>}
          </Card>

          {raynaud.length > 0 && (
            <Card>
              <CardHeader icon="hand.raised.fill" title="RAYNAUD'S" />
              <RaynaudList
                episodes={raynaud}
                onChanged={() => {
                  setRaynaudTick((t) => t + 1);
                  onChanged();
                }}
              />
            </Card>
          )}

          {weather && (
            <Card>
              <CardHeader icon="cloud.sun.fill" title="WEATHER" />
              <ThemedText type="small">
                {[
                  weather.uvMax != null ? `Max UV ${weather.uvMax}` : null,
                  weather.tempMinF != null && weather.tempMaxF != null ? `${Math.round(weather.tempMinF)}–${Math.round(weather.tempMaxF)}°F` : null,
                  weather.conditions,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </ThemedText>
            </Card>
          )}
        </ScrollView>

        <SleepForm
          visible={form === 'sleep'}
          date={date}
          existing={sleep ?? null}
          onClose={() => setForm(null)}
          onSave={async (entry) => {
            setForm(null);
            await saveSleep(entry);
            onChanged();
          }}
        />
        <EveningForm
          visible={form === 'evening'}
          date={date}
          existing={evening ?? null}
          onClose={() => setForm(null)}
          onSave={async (entry) => {
            setForm(null);
            await saveEvening(entry);
            onChanged();
            const warning = warningSigns(entry);
            if (warning) Alert.alert('Worth a call to your doctor', warning);
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  body: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  note: { fontStyle: 'italic' },
});
