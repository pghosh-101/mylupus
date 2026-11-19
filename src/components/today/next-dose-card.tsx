import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { CardHeader } from '@/components/card-header';
import { ActionButton } from '@/components/meds/controls';
import { TakenSheet } from '@/components/meds/taken-sheet';
import { Card } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { HeadingFont, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  FOOD_RULE_HINT,
  formatPlanMinutes,
  loadDoseLog,
  loadMeds,
  loadRoutine,
  loadRoutineLog,
  logDose,
  planDay,
  rescheduleMedNotifications,
  shortName,
  todayString,
  type PlannedDose,
} from '@/lib/meds';

/** "in 45 min", "in 2 h 10 min", "now", "20 min ago". */
function relative(minutesFromNow: number): string {
  if (Math.abs(minutesFromNow) < 5) return 'now';
  const m = Math.abs(minutesFromNow);
  const text = m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
  return minutesFromNow > 0 ? `in ${text}` : `${text} ago`;
}

/** Circular progress for today's doses. */
function DoseRing({ done, total }: { done: number; total: number }) {
  const theme = useTheme();
  const size = 64;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const progress = total ? done / total : 0;
  return (
    <View style={styles.ring} accessible accessibilityLabel={`${done} of ${total} doses done today`}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={theme.backgroundSelected} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={theme.accent}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * progress} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.ringLabel}>
        <ThemedText type="smallBold">
          {done}/{total}
        </ThemedText>
      </View>
    </View>
  );
}

/** Today's next medication dose, with a progress ring and a one-tap "Taken". */
export function NextDoseCard() {
  const theme = useTheme();
  const [doses, setDoses] = useState<PlannedDose[] | null>(null);
  const [asking, setAsking] = useState<PlannedDose | null>(null);
  const [now, setNow] = useState(() => new Date());

  const reload = useCallback(async () => {
    const [meds, log, routine, routineLog] = await Promise.all([loadMeds(), loadDoseLog(), loadRoutine(), loadRoutineLog()]);
    setDoses(meds.length ? planDay(meds, log, todayString(), routine, routineLog) : []);
    setNow(new Date());
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );
  // Keep "in 45 min" current.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (doses === null) return null;

  if (doses.length === 0) {
    return (
      <Card>
        <CardHeader icon="pills.fill" title="MEDICATIONS" />
        <ThemedText>Add your medications to see your next dose here.</ThemedText>
        <ActionButton label="Add medications" kind="secondary" onPress={() => router.navigate('/meds')} />
      </Card>
    );
  }

  const done = doses.filter((d) => d.entry).length;
  const next = doses.find((d) => !d.entry);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  return (
    <Card>
      <CardHeader
        icon="pills.fill"
        title={next ? 'NEXT DOSE' : 'MEDICATIONS'}
        right={
          <Pressable onPress={() => router.navigate('/meds')} hitSlop={8}>
            <ThemedText type="small" style={{ color: theme.accent }}>
              All meds ›
            </ThemedText>
          </Pressable>
        }
      />

      <View style={styles.body}>
        <DoseRing done={done} total={doses.length} />
        <View style={styles.flex}>
          {next ? (
            <>
              <ThemedText style={styles.medName}>{shortName(next.med.name)}</ThemedText>
              <ThemedText type="small" style={{ color: next.planned <= nowMinutes ? theme.sunAlert : theme.textSecondary }}>
                {formatPlanMinutes(next.planned)} · {relative(next.planned - nowMinutes)}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {next.med.pillsPerDose} pill{next.med.pillsPerDose === 1 ? '' : 's'} · {FOOD_RULE_HINT[next.med.foodRule]}
              </ThemedText>
            </>
          ) : (
            <>
              <ThemedText style={styles.medName}>All done for today</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {done} of {doses.length} doses logged. Nice work.
              </ThemedText>
            </>
          )}
        </View>
      </View>

      {next && <ActionButton label={`Took ${shortName(next.med.name)}`} onPress={() => setAsking(next)} />}

      <TakenSheet
        prompt={asking ? `When did you take ${shortName(asking.med.name)}?` : null}
        date={todayString()}
        onClose={() => setAsking(null)}
        onConfirm={async (at) => {
          const key = asking?.key;
          setAsking(null);
          if (!key) return;
          await logDose(key, 'taken', at);
          await reload();
          rescheduleMedNotifications();
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  body: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  flex: { flex: 1, gap: 2 },
  medName: { fontSize: 20, lineHeight: 26, fontFamily: HeadingFont.bold },
  ring: { width: 64, height: 64 },
  ringLabel: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
