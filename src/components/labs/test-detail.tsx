import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LabChart } from '@/components/labs/lab-chart';
import { Card } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { FLAG_LABEL, flagFor, formatRange, formatValue, labName, testFor, type LabResult } from '@/lib/labs';
import { parseDate } from '@/lib/meds';

/** One test: what it is, a chart over time, and every result. */
export function TestDetail({
  test,
  results,
  onDelete,
  onClose,
}: {
  test: string | null;
  results: LabResult[];
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const info = test ? testFor(test) : undefined;
  const latest = results[results.length - 1];

  return (
    <Modal visible={test !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView edges={['top', 'bottom']} style={[styles.sheet, { backgroundColor: theme.background }]}>
        <View style={styles.header}>
          <ThemedText type="smallBold">{test ? labName(test) : ''}</ThemedText>
          <Pressable onPress={onClose} hitSlop={12}>
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              Done
            </ThemedText>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          {info && (
            <ThemedText type="small" themeColor="textSecondary">
              {info.about}
            </ThemedText>
          )}
          {latest && (
            <Card>
              <LabChart results={results} />
              <ThemedText type="small" themeColor="textSecondary">
                Normal range: {formatRange(latest.low, latest.high, latest.unit)}
              </ThemedText>
            </Card>
          )}
          <Card>
            <ThemedText type="smallBold" themeColor="textSecondary">
              ALL RESULTS
            </ThemedText>
            {[...results].reverse().map((r) => {
              const flag = flagFor(r);
              return (
                <View key={r.id} style={[styles.row, { borderColor: theme.backgroundSelected }]}>
                  <View style={styles.flex}>
                    <ThemedText type="smallBold">
                      {formatValue(r.value)} {r.unit}
                      {FLAG_LABEL[flag] ? ` · ${FLAG_LABEL[flag]}` : ''}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {parseDate(r.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </ThemedText>
                  </View>
                  <Pressable
                    hitSlop={8}
                    onPress={() =>
                      Alert.alert('Delete this result?', undefined, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => onDelete(r.id) },
                      ])
                    }>
                    <ThemedText type="small" style={{ color: theme.sunAlert }}>
                      Delete
                    </ThemedText>
                  </Pressable>
                </View>
              );
            })}
          </Card>
          <ThemedText type="small" themeColor="textSecondary">
            Lab results need your doctor&apos;s interpretation. Trends over time usually matter more than a single value.
          </ThemedText>
        </ScrollView>
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
  row: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, paddingTop: Spacing.two, gap: Spacing.two },
  flex: { flex: 1 },
});
