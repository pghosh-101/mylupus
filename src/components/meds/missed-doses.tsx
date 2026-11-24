import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton } from '@/components/meds/controls';
import { TakenSheet } from '@/components/meds/taken-sheet';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tap } from '@/lib/haptics';
import {
  findMissedDoses,
  FOOD_RULE_HINT,
  formatPlanMinutes,
  loadDoseLog,
  loadMeds,
  loadRoutine,
  loadRoutineLog,
  logDose,
  parseDate,
  rescheduleMedNotifications,
  shortName,
  todayString,
  type MissedDose,
} from '@/lib/meds';

/** "Yesterday" or "Sat, Nov 22". */
function dayLabel(date: string) {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (date === todayString(y)) return 'Yesterday';
  return parseDate(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * "Missed doses (N)": doses from the last two days that were never logged, such as a late-night
 * dose that rolled past midnight. Tap to log when you took each one, or that you didn't.
 * Shows nothing when there are none.
 */
export function MissedDoses({ onChanged }: { onChanged?: () => void }) {
  const theme = useTheme();
  const [missed, setMissed] = useState<MissedDose[]>([]);
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState<MissedDose | null>(null);

  const reload = useCallback(async () => {
    const [meds, log, routine, routineLog] = await Promise.all([
      loadMeds(),
      loadDoseLog(),
      loadRoutine(),
      loadRoutineLog(),
    ]);
    const found = meds.length ? findMissedDoses(meds, log, routine, routineLog) : [];
    setMissed(found);
    return found;
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

  const record = async (dose: MissedDose, status: 'taken' | 'skipped', at?: number) => {
    setAsking(null);
    await logDose(dose.key, status, at);
    const left = await reload();
    if (left.length === 0) setOpen(false);
    rescheduleMedNotifications().catch(() => {});
    onChanged?.();
  };

  if (missed.length === 0 && !open) return null;

  const dates = [...new Set(missed.map((m) => m.date))];

  return (
    <>
      <Pressable
        onPress={() => {
          tap();
          setOpen(true);
        }}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: theme.backgroundElement, borderColor: theme.sunAlert, opacity: pressed ? 0.75 : 1 },
        ]}>
        <ThemedText type="smallBold" style={{ color: theme.sunAlert }}>
          Missed doses ({missed.length})
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.flex} numberOfLines={1}>
          {missed.length === 1
            ? `${shortName(missed[0].med.name)}, ${dayLabel(missed[0].date).toLowerCase()}`
            : 'Tap to log them'}
        </ThemedText>
        <ThemedText type="smallBold" style={{ color: theme.accent }}>
          ›
        </ThemedText>
      </Pressable>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <SafeAreaView edges={['top', 'bottom']} style={[styles.flex, { backgroundColor: theme.background }]}>
          <View style={styles.header}>
            <ThemedText type="smallBold">Missed doses</ThemedText>
            <Pressable onPress={() => setOpen(false)} hitSlop={12}>
              <ThemedText type="smallBold" style={{ color: theme.accent }}>
                Done
              </ThemedText>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.inner}>
              <ThemedText type="small" themeColor="textSecondary">
                Doses from the last two days that weren&apos;t logged. If you took one, tap I took it and pick the
                time, even if it was after midnight. Your history and reminders update.
              </ThemedText>
              {missed.length === 0 && (
                <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText type="smallBold">All caught up</ThemedText>
                </View>
              )}
              {dates.map((date) => (
                <View key={date} style={styles.group}>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    {dayLabel(date).toUpperCase()}
                  </ThemedText>
                  {missed
                    .filter((m) => m.date === date)
                    .sort((a, b) => a.dueAt - b.dueAt)
                    .map((m) => (
                      <View key={m.key} style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                        <ThemedText type="smallBold">
                          {shortName(m.med.name)} · due {formatPlanMinutes(m.planned)}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {m.med.pillsPerDose} pill{m.med.pillsPerDose === 1 ? '' : 's'} · {FOOD_RULE_HINT[m.med.foodRule]}
                        </ThemedText>
                        <View style={styles.actions}>
                          <View style={styles.flex}>
                            <ActionButton label="I took it" onPress={() => setAsking(m)} />
                          </View>
                          <View style={styles.flex}>
                            <ActionButton label="Didn't take it" kind="secondary" onPress={() => record(m, 'skipped')} />
                          </View>
                        </View>
                      </View>
                    ))}
                </View>
              ))}
            </View>
          </ScrollView>

          {/* Inside this sheet so it opens on top of it. */}
          <TakenSheet
            prompt={asking ? `When did you take ${shortName(asking.med.name)}?` : null}
            date={asking?.date ?? todayString()}
            initialMinutes={asking?.planned}
            onClose={() => setAsking(null)}
            onConfirm={(at) => asking && record(asking, 'taken', at)}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: Spacing.two + 4,
    paddingHorizontal: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  scroll: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.six, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three },
  group: { gap: Spacing.two },
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.two },
});
