import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActionButton } from '@/components/meds/controls';
import { TakenSheet } from '@/components/meds/taken-sheet';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  formatPlanMinutes,
  loadDoseLog,
  loadMeds,
  loadRoutine,
  loadRoutineLog,
  logDose,
  parseDate,
  planDay,
  rescheduleMedNotifications,
  shortName,
  undoDose,
  type DoseLogEntry,
  type PlannedDose,
} from '@/lib/meds';
import { formatTime } from '@/lib/uv';

/**
 * Every dose planned for one day, with what happened to it. Doses that were never logged
 * (for example a late dose that rolled past midnight) can be filled in here, and logged ones
 * can be changed or cleared, the same way a check-in can be edited.
 */
export function DayDoses({ date, onChanged }: { date: string; onChanged?: () => void }) {
  const theme = useTheme();
  const [doses, setDoses] = useState<PlannedDose[]>([]);
  /** Logged doses for medications that have since been removed or changed. */
  const [orphans, setOrphans] = useState<{ entry: DoseLogEntry; label: string }[]>([]);
  const [asking, setAsking] = useState<PlannedDose | null>(null);

  const reload = useCallback(async () => {
    const [meds, log, routine, routineLog] = await Promise.all([
      loadMeds(),
      loadDoseLog(),
      loadRoutine(),
      loadRoutineLog(),
    ]);
    const planned = planDay(meds, log, date, routine, routineLog).sort((a, b) => a.planned - b.planned);
    setDoses(planned);
    const keys = new Set(planned.map((d) => d.key));
    setOrphans(
      log
        .filter((e) => e.key.startsWith(`${date}|`) && !keys.has(e.key))
        .map((entry) => {
          const med = meds.find((m) => m.id === entry.key.split('|')[1]);
          return { entry, label: med ? shortName(med.name) : 'A removed medication' };
        }),
    );
  }, [date]);

  useEffect(() => {
    reload();
  }, [reload]);

  const record = async (dose: PlannedDose, status: 'taken' | 'skipped' | null, at?: number) => {
    setAsking(null);
    if (status) await logDose(dose.key, status, at);
    else await undoDose(dose.key);
    await reload();
    rescheduleMedNotifications().catch(() => {});
    onChanged?.();
  };

  const now = Date.now();
  const midnight = parseDate(date).getTime();
  const perDay = (d: PlannedDose) => doses.filter((x) => x.med.id === d.med.id).length;

  if (doses.length === 0 && orphans.length === 0) {
    return <ThemedText>No medications set up</ThemedText>;
  }

  return (
    <>
      {doses.map((d) => {
        const due = midnight + d.planned * 60000;
        const missed = !d.entry && due <= now;
        const status = d.entry
          ? d.entry.status === 'taken'
            ? `Taken at ${formatTime(new Date(d.entry.at))}${d.entry.at - midnight >= 86400000 ? ' (after midnight)' : ''}`
            : 'Didn’t take it'
          : missed
            ? 'Not logged'
            : 'Not due yet';
        return (
          <View key={d.key} style={[styles.dose, { borderColor: theme.backgroundSelected }]}>
            <View style={styles.row}>
              <ThemedText type="smallBold" style={styles.flex}>
                {shortName(d.med.name)}
                {perDay(d) > 1 ? ` · dose ${d.doseIndex + 1}` : ''}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                due {formatPlanMinutes(d.planned)}
              </ThemedText>
            </View>
            <ThemedText
              type="small"
              style={{
                color: missed ? theme.sunAlert : d.entry?.status === 'taken' ? theme.accent : theme.textSecondary,
              }}>
              {status}
            </ThemedText>
            {d.entry ? (
              <View style={styles.row}>
                <View style={styles.flex}>
                  <ActionButton
                    label={d.entry.status === 'taken' ? 'Change time' : 'I took it'}
                    kind="secondary"
                    onPress={() => setAsking(d)}
                  />
                </View>
                <View style={styles.flex}>
                  <ActionButton label="Clear" kind="secondary" onPress={() => record(d, null)} />
                </View>
              </View>
            ) : missed ? (
              <View style={styles.row}>
                <View style={styles.flex}>
                  <ActionButton label="I took it" onPress={() => setAsking(d)} />
                </View>
                <View style={styles.flex}>
                  <ActionButton label="Didn't take it" kind="secondary" onPress={() => record(d, 'skipped')} />
                </View>
              </View>
            ) : null}
          </View>
        );
      })}

      {orphans.map(({ entry, label }) => (
        <ThemedText key={entry.key} type="small" themeColor="textSecondary">
          {label}: {entry.status === 'taken' ? `taken at ${formatTime(new Date(entry.at))}` : 'didn’t take it'}
        </ThemedText>
      ))}

      <TakenSheet
        prompt={asking ? `When did you take ${shortName(asking.med.name)}?` : null}
        date={date}
        initialMinutes={asking ? (asking.takenAt ?? asking.planned) : undefined}
        onClose={() => setAsking(null)}
        onConfirm={(at) => asking && record(asking, 'taken', at)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dose: { gap: Spacing.one, paddingBottom: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth },
});
