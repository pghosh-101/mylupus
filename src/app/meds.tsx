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
  loadRoutineLog,
  logDose,
  logRoutine,
  planTimeline,
  rescheduleMedNotifications,
  ROUTINE_LABEL,
  saveMeds,
  saveRoutine,
  shortName,
  snoozeDose,
  supplyInfo,
  todayString,
  undoDose,
  undoRoutine,
  type DoseLogEntry,
  type Medication,
  type Routine,
  type RoutineLogEntry,
  type TimelineItem,
} from '@/lib/meds';
import { formatTime } from '@/lib/uv';

export default function MedsScreen() {
  const [meds, setMeds] = useState<Medication[]>([]);
  const [log, setLog] = useState<DoseLogEntry[]>([]);
  const [routine, setRoutine] = useState<Routine>(DEFAULT_ROUTINE);
  const [routineLog, setRoutineLog] = useState<RoutineLogEntry[]>([]);
  const [editing, setEditing] = useState<Medication | 'new' | null>(null);
  const [editingRoutine, setEditingRoutine] = useState(false);

  const reload = useCallback(async () => {
    const [m, l, r, rl] = await Promise.all([loadMeds(), loadDoseLog(), loadRoutine(), loadRoutineLog()]);
    setMeds(m);
    setLog(l);
    setRoutine(r);
    setRoutineLog(rl);
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
      <TodaysDoses meds={meds} log={log} routine={routine} routineLog={routineLog} onChange={reload} />

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
/** Today's doses and routine (wake up, meals), adjusted around what actually happened. */
function TodaysDoses({
  meds,
  log,
  routine,
  routineLog,
  onChange,
}: {
  meds: Medication[];
  log: DoseLogEntry[];
  routine: Routine;
  routineLog: RoutineLogEntry[];
  onChange: () => void;
}) {
  const theme = useTheme();
  const [snoozed, setSnoozed] = useState<Record<string, boolean>>({});
  const [asking, setAsking] = useState<TimelineItem | null>(null);
  if (meds.length === 0) return null;

  const today = todayString();
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const items = planTimeline(meds, log, today, routine, routineLog);
  const doses = items.filter((i) => i.kind === 'dose');
  const done = doses.filter((d) => d.entry).length;

  const afterChange = () => {
    onChange();
    rescheduleMedNotifications();
  };
  const recordDose = async (key: string, status: 'taken' | 'skipped', at?: number) => {
    await logDose(key, status, at);
    afterChange();
  };
  const recordRoutine = async (key: string, status: 'done' | 'skipped', at?: number) => {
    await logRoutine(key, status, at);
    afterChange();
  };

  const prompt = !asking
    ? null
    : asking.kind === 'dose'
      ? `When did you take ${shortName(asking.med.name)}?`
      : asking.event === 'wake'
        ? 'When did you wake up?'
        : `When did you eat ${ROUTINE_LABEL[asking.event].toLowerCase()}?`;

  return (
    <Card>
      <View style={styles.rowBetween}>
        <CardHeader icon="checklist" title="TODAY" />
        <ThemedText type="small" themeColor="textSecondary">
          {done} of {doses.length} doses
        </ThemedText>
      </View>

      {items.map((item) => {
        const { key, entry } = item;
        const due = item.planned <= nowMinutes;
        const moved = !entry && item.planned !== item.scheduled;
        const undo = async () => {
          if (item.kind === 'dose') await undoDose(key);
          else await undoRoutine(key);
          afterChange();
        };

        if (item.kind === 'routine') {
          const label = ROUTINE_LABEL[item.event];
          const isWake = item.event === 'wake';
          return (
            <View key={key} style={[styles.dose, { borderColor: theme.backgroundSelected }]}>
              <View style={styles.rowBetween}>
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.flex}>
                  {formatPlanMinutes(entry?.status === 'skipped' ? item.scheduled : item.planned)} · {label}
                </ThemedText>
                {entry ? (
                  <Pressable hitSlop={8} onPress={undo}>
                    <ThemedText type="small" style={{ color: theme.accent }}>
                      Undo
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>
              {moved && (
                <ThemedText type="small" style={{ color: theme.sunAlert }}>
                  Moved from {formatMinutes(item.scheduled)} · {item.reason}
                </ThemedText>
              )}
              {entry ? (
                <ThemedText type="small" style={{ color: entry.status === 'done' ? theme.accent : theme.textSecondary }}>
                  {entry.status === 'done' ? `✓ ${isWake ? 'Woke up' : 'Ate'} at ${formatTime(new Date(entry.at))}` : 'Skipped'}
                </ThemedText>
              ) : (
                <View style={styles.doseButtons}>
                  <SmallButton label={isWake ? 'Woke up' : 'Ate'} primary={due} onPress={() => setAsking(item)} />
                  {!isWake && <SmallButton label="Skip" onPress={() => recordRoutine(key, 'skipped')} />}
                </View>
              )}
            </View>
          );
        }

        const { med } = item;
        return (
          <View key={key} style={[styles.dose, { borderColor: theme.backgroundSelected }]}>
            <View style={styles.rowBetween}>
              <View style={styles.flex}>
                <ThemedText type="smallBold">
                  {formatPlanMinutes(entry?.status === 'skipped' ? item.scheduled : item.planned)} · {shortName(med.name)}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {med.pillsPerDose} pill{med.pillsPerDose === 1 ? '' : 's'} · {FOOD_RULE_HINT[med.foodRule]}
                </ThemedText>
              </View>
              {entry && (
                <Pressable hitSlop={8} onPress={undo}>
                  <ThemedText type="small" style={{ color: theme.accent }}>
                    Undo
                  </ThemedText>
                </Pressable>
              )}
            </View>

            {moved && (
              <ThemedText type="small" style={{ color: theme.sunAlert }}>
                Moved from {formatMinutes(item.scheduled)} · {item.reason}
              </ThemedText>
            )}
            {!entry && med.foodRule === 'empty_stomach' && (
              <ThemedText type="small" themeColor="textSecondary">
                {item.planned - 120 <= nowMinutes
                  ? `Eat next after ${formatPlanMinutes(item.planned + 60)}`
                  : `No food ${formatPlanMinutes(item.planned - 120)} – ${formatPlanMinutes(item.planned + 60)}`}
              </ThemedText>
            )}

            {entry ? (
              <ThemedText type="small" style={{ color: entry.status === 'taken' ? theme.accent : theme.textSecondary }}>
                {entry.status === 'taken' ? '✓ Taken' : 'Skipped'} at {formatTime(new Date(entry.at))}
              </ThemedText>
            ) : (
              <View style={styles.doseButtons}>
                <SmallButton label="Taken" primary={due} onPress={() => setAsking(item)} />
                {due && (
                  <SmallButton
                    label={snoozed[key] ? 'Snoozed' : 'Snooze 15 min'}
                    onPress={async () => {
                      await snoozeDose(med, item.doseIndex, today);
                      setSnoozed({ ...snoozed, [key]: true });
                    }}
                  />
                )}
                <SmallButton label="Skip" onPress={() => recordDose(key, 'skipped')} />
              </View>
            )}
          </View>
        );
      })}

      <TakenSheet
        prompt={prompt}
        date={today}
        onClose={() => setAsking(null)}
        onConfirm={async (at) => {
          const item = asking;
          setAsking(null);
          if (!item) return;
          if (item.kind === 'dose') await recordDose(item.key, 'taken', at);
          else await recordRoutine(item.key, 'done', at);
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
