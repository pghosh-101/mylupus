import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ActionButton, Segmented, TimeStepper } from '@/components/meds/controls';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { parseDate, shortName, type Minutes, type PlannedDose } from '@/lib/meds';

/** Asks what time a dose was actually taken. */
export function TakenSheet({
  dose,
  date,
  onConfirm,
  onClose,
}: {
  dose: PlannedDose | null;
  /** The plan's day, "YYYY-MM-DD". */
  date: string;
  onConfirm: (takenAt: number) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const nowMinutes = () => {
    const n = new Date();
    return n.getHours() * 60 + Math.floor(n.getMinutes() / 5) * 5;
  };
  const [time, setTime] = useState<Minutes>(nowMinutes);
  const [quick, setQuick] = useState<number>(0);

  useEffect(() => {
    if (dose) {
      setTime(nowMinutes());
      setQuick(0);
    }
  }, [dose]);

  const pickQuick = (minutesAgo: number) => {
    setQuick(minutesAgo);
    setTime((((nowMinutes() - minutesAgo) % 1440) + 1440) % 1440);
  };

  const confirm = () => {
    // A late-night dose logged after midnight belongs to the previous day's plan.
    let minutes = time;
    const now = new Date();
    const planDayStart = parseDate(date).getTime();
    if (now.getTime() - planDayStart >= 24 * 3600 * 1000 && time < 12 * 60) minutes += 1440;
    onConfirm(planDayStart + minutes * 60000);
  };

  return (
    <Modal visible={dose !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.backgroundElement }]} onPress={() => {}}>
          {dose && (
            <>
              <ThemedText type="smallBold">When did you take {shortName(dose.med.name)}?</ThemedText>
              <Segmented
                options={[
                  { value: 0, label: 'Now' },
                  { value: 15, label: '15 min ago' },
                  { value: 30, label: '30 min ago' },
                  { value: 60, label: '1 hr ago' },
                ]}
                value={quick}
                onChange={pickQuick}
              />
              <View style={styles.center}>
                <TimeStepper
                  value={time}
                  step={5}
                  onChange={(m) => {
                    setQuick(-1);
                    setTime(m);
                  }}
                />
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                Later doses today adjust to keep the right spacing and food timing.
              </ThemedText>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <ActionButton label="Cancel" kind="secondary" onPress={onClose} />
                </View>
                <View style={styles.flex}>
                  <ActionButton label="Save" onPress={confirm} />
                </View>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  center: { alignItems: 'center' },
  row: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
});
