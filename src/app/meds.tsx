import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';

import { tap } from '@/lib/haptics';
import { CardHeader } from '@/components/card-header';
import { ActionButton } from '@/components/meds/controls';
import { MedForm } from '@/components/meds/med-form';
import { RoutineForm } from '@/components/meds/routine-form';
import { TakenSheet } from '@/components/meds/taken-sheet';
import { Card, Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  DEFAULT_ROUTINE,
  FOOD_RULE_HINT,
  formatDate,
  formatMinutes,
  formatPlanMinutes,
  loadDoseLog,
  loadMeds,
  loadRoutine,
  logDose,
  planDay,
  rescheduleMedNotifications,
  saveMeds,
  saveRoutine,
  shortName,
  snoozeDose,
  supplyInfo,
  todayString,
  undoDose,
  type DoseLogEntry,
  type Medication,
  type PlannedDose,
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

/** Checklist of today's doses, adjusted around what was actually taken. */
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
  const [asking, setAsking] = useState<PlannedDose | null>(null);
  if (meds.length === 0) return null;

  const today = todayString();
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const doses = planDay(meds, log, today);
  const done = doses.filter((d) => d.entry).length;

  const record = async (key: string, status: 'taken' | 'skipped', at?: number) => {
    await logDose(key, status, at);
    onChange();
    rescheduleMedNotifications();
  };

  return (
    <Card>
      <View style={styles.rowBetween}>
        <CardHeader icon="checklist" title="TODAY" />
        <ThemedText type="small" themeColor="textSecondary">
          {done} of {doses.length} done
        </ThemedText>
      </View>

      {doses.map((d) => {
        const { med, key, entry } = d;
        const due = d.planned <= nowMinutes;
        const moved = !entry && d.planned !== d.scheduled;
        return (
          <View key={key} style={[styles.dose, { borderColor: theme.backgroundSelected }]}>
            <View style={styles.rowBetween}>
              <View style={styles.flex}>
                <ThemedText type="smallBold">
                  {formatPlanMinutes(entry?.status === 'skipped' ? d.scheduled : d.planned)} ·{' '}
                  {shortName(med.name)}
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
                    rescheduleMedNotifications();
                  }}>
                  <ThemedText type="small" style={{ color: theme.accent }}>
                    Undo
                  </ThemedText>
                </Pressable>
              )}
            </View>

            {moved && (
              <ThemedText type="small" style={{ color: theme.sunAlert }}>
                Moved from {formatMinutes(d.scheduled)} · {d.reason}
              </ThemedText>
            )}
            {!entry && med.foodRule === 'empty_stomach' && (
              <ThemedText type="small" themeColor="textSecondary">
                {d.planned - 120 <= nowMinutes
                  ? `Eat next after ${formatPlanMinutes(d.planned + 60)}`
                  : `No food ${formatPlanMinutes(d.planned - 120)} – ${formatPlanMinutes(d.planned + 60)}`}
              </ThemedText>
            )}

            {entry ? (
              <ThemedText type="small" style={{ color: entry.status === 'taken' ? theme.accent : theme.textSecondary }}>
                {entry.status === 'taken' ? '✓ Taken' : 'Skipped'} at {formatTime(new Date(entry.at))}
              </ThemedText>
            ) : (
              <View style={styles.doseButtons}>
                <SmallButton label="Taken" primary={due} onPress={() => setAsking(d)} />
                {due && (
                  <SmallButton
                    label={snoozed[key] ? 'Snoozed' : 'Snooze 15 min'}
                    onPress={async () => {
                      await snoozeDose(med, d.doseIndex, today);
                      setSnoozed({ ...snoozed, [key]: true });
                    }}
                  />
                )}
                <SmallButton label="Skip" onPress={() => record(key, 'skipped')} />
              </View>
            )}
          </View>
        );
      })}

      <TakenSheet
        dose={asking}
        date={today}
        onClose={() => setAsking(null)}
        onConfirm={async (at) => {
          const key = asking?.key;
          setAsking(null);
          if (!key) return;
          await record(key, 'taken', at);
        }}
      />
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
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.small,
        { backgroundColor: primary ? theme.accent : theme.backgroundSelected, opacity: pressed ? 0.7 : 1 },
      ]}>
      <ThemedText type="button" style={{ color: primary ? theme.onAccent : theme.accent }}>
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
