import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';

import { ActionButton } from '@/components/meds/controls';
import { MedForm } from '@/components/meds/med-form';
import { RoutineForm } from '@/components/meds/routine-form';
import { Card, Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  DEFAULT_ROUTINE,
  doseKey,
  FOOD_RULE_HINT,
  formatDate,
  formatMinutes,
  loadDoseLog,
  loadMeds,
  loadRoutine,
  logDose,
  saveMeds,
  saveRoutine,
  shortName,
  snoozeDose,
  supplyInfo,
  todayString,
  undoDose,
  type DoseLogEntry,
  type Medication,
  type Routine,
} from '@/lib/meds';
import { formatTime } from '@/lib/uv';

export default function MedsScreen() {
  const [meds, setMeds] = useState<Medication[]>([]);
  const [log, setLog] = useState<DoseLogEntry[]>([]);
  const [routine, setRoutine] = useState<Routine>(DEFAULT_ROUTINE);
  const [editing, setEditing] = useState<Medication | 'new' | null>(null);
  const [editingRoutine, setEditingRoutine] = useState(false);

  const reload = useCallback(async () => {
    const [m, l, r] = await Promise.all([loadMeds(), loadDoseLog(), loadRoutine()]);
    setMeds(m);
    setLog(l);
    setRoutine(r);
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && reload());
    return () => sub.remove();
  }, [reload]);

  const saveMed = async (med: Medication) => {
    const next = meds.some((m) => m.id === med.id) ? meds.map((m) => (m.id === med.id ? med : m)) : [...meds, med];
    setEditing(null);
    setMeds(next);
    await saveMeds(next);
  };

  const deleteMed = async (id: string) => {
    const next = meds.filter((m) => m.id !== id);
    setEditing(null);
    setMeds(next);
    await saveMeds(next);
  };

  return (
    <Screen title="Medications">
      <TodaysDoses meds={meds} log={log} onChange={reload} />

      {meds.map((med) => (
        <MedCard key={med.id} med={med} onPress={() => setEditing(med)} />
      ))}

      {meds.length === 0 && (
        <Card>
          <ThemedText>
            Add your medications to get dose reminders, a daily checklist, and refill reminders before you run out.
          </ThemedText>
        </Card>
      )}

      <View style={styles.buttons}>
        <ActionButton label="Add medication" onPress={() => setEditing('new')} />
        <ActionButton label="My routine" kind="secondary" onPress={() => setEditingRoutine(true)} />
      </View>

      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          MyLupus follows the timing you set. It doesn&apos;t check for drug interactions, so ask your
          pharmacist when you add a new medication.
        </ThemedText>
      </Card>

      <MedForm
        visible={editing !== null}
        med={editing === 'new' ? null : editing}
        routine={routine}
        onSave={saveMed}
        onDelete={deleteMed}
        onClose={() => setEditing(null)}
      />
      <RoutineForm
        visible={editingRoutine}
        routine={routine}
        onClose={() => setEditingRoutine(false)}
        onSave={async (r) => {
          setRoutine(r);
          setEditingRoutine(false);
          await saveRoutine(r);
        }}
      />
    </Screen>
  );
}

/** Checklist of today's doses, in time order. */
function TodaysDoses({
  meds,
  log,
  onChange,
}: {
  meds: Medication[];
  log: DoseLogEntry[];
  onChange: () => void;
}) {
  const theme = useTheme();
  const [snoozed, setSnoozed] = useState<Record<string, boolean>>({});
  if (meds.length === 0) return null;

  const today = todayString();
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const doses = meds
    .flatMap((med) => med.doseTimes.map((t, i) => ({ med, i, t, key: doseKey(today, med.id, i) })))
    .sort((a, b) => a.t - b.t);
  const done = doses.filter((d) => log.some((e) => e.key === d.key)).length;

  return (
    <Card>
      <View style={styles.rowBetween}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          TODAY
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {done} of {doses.length} done
        </ThemedText>
      </View>

      {doses.map(({ med, i, t, key }) => {
        const entry = log.find((e) => e.key === key);
        const due = t <= nowMinutes;
        return (
          <View key={key} style={[styles.dose, { borderColor: theme.backgroundSelected }]}>
            <View style={styles.rowBetween}>
              <View style={styles.flex}>
                <ThemedText type="smallBold">
                  {formatMinutes(t)} · {shortName(med.name)}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {med.pillsPerDose} pill{med.pillsPerDose === 1 ? '' : 's'} · {FOOD_RULE_HINT[med.foodRule]}
                </ThemedText>
              </View>
              {entry && (
                <Pressable
                  hitSlop={8}
                  onPress={async () => {
                    await undoDose(key);
                    onChange();
                  }}>
                  <ThemedText type="small" style={{ color: theme.accent }}>
                    Undo
                  </ThemedText>
                </Pressable>
              )}
            </View>

            {entry ? (
              <ThemedText type="small" style={{ color: entry.status === 'taken' ? theme.accent : theme.textSecondary }}>
                {entry.status === 'taken' ? '✓ Taken' : 'Skipped'} at {formatTime(new Date(entry.at))}
              </ThemedText>
            ) : (
              <View style={styles.doseButtons}>
                <SmallButton
                  label="Taken"
                  primary={due}
                  onPress={async () => {
                    await logDose(key, 'taken');
                    onChange();
                  }}
                />
                {due && (
                  <SmallButton
                    label={snoozed[key] ? 'Snoozed' : 'Snooze 15 min'}
                    onPress={async () => {
                      await snoozeDose(med, i);
                      setSnoozed({ ...snoozed, [key]: true });
                    }}
                  />
                )}
                <SmallButton
                  label="Skip"
                  onPress={async () => {
                    await logDose(key, 'skipped');
                    onChange();
                  }}
                />
              </View>
            )}
          </View>
        );
      })}
    </Card>
  );
}

function MedCard({ med, onPress }: { med: Medication; onPress: () => void }) {
  const theme = useTheme();
  const supply = supplyInfo(med);
  const lowSupply = supply && supply.daysLeft <= 7;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <Card>
        <View style={styles.rowBetween}>
          <ThemedText type="smallBold" style={styles.flex}>
            {med.name}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.accent }}>
            Edit
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {med.pillsPerDose} pill{med.pillsPerDose === 1 ? '' : 's'} at{' '}
          {med.doseTimes.map(formatMinutes).join(', ')} · {FOOD_RULE_HINT[med.foodRule]}
        </ThemedText>
        {med.instructions ? <ThemedText type="small">{med.instructions}</ThemedText> : null}
        {supply && (
          <ThemedText type="small" style={{ color: lowSupply ? theme.sunAlert : theme.textSecondary }}>
            About {supply.pillsLeft} pills left · runs out around {formatDate(supply.runOut)}
            {lowSupply ? ' · time to refill' : ''}
          </ThemedText>
        )}
      </Card>
    </Pressable>
  );
}

function SmallButton({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.small,
        { backgroundColor: primary ? theme.accent : theme.backgroundSelected, opacity: pressed ? 0.7 : 1 },
      ]}>
      <ThemedText type="smallBold" style={{ color: primary ? '#fff' : theme.accent }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  buttons: { gap: Spacing.two },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
  dose: { borderTopWidth: 1, paddingTop: Spacing.two, gap: Spacing.two },
  doseButtons: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  small: { paddingVertical: Spacing.one + 2, paddingHorizontal: Spacing.three, borderRadius: 12 },
});
