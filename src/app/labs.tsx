import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AddResultsForm } from '@/components/labs/add-results-form';
import { TestDetail } from '@/components/labs/test-detail';
import { ActionButton } from '@/components/meds/controls';
import { Card, Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  byTest,
  FLAG_LABEL,
  flagFor,
  formatValue,
  LAB_TESTS,
  labName,
  loadLabs,
  saveLabs,
  testFor,
  type LabResult,
} from '@/lib/labs';
import { parseDate } from '@/lib/meds';

const GROUPS = ['Lupus activity', 'Blood counts', 'Kidneys', 'Liver', 'Other'] as const;

export default function LabsScreen() {
  const [labs, setLabs] = useState<LabResult[]>([]);
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadLabs().then(setLabs);
    }, []),
  );

  const update = async (next: LabResult[]) => {
    setLabs(next);
    await saveLabs(next);
  };

  const grouped = byTest(labs);
  const groupOf = (test: string) => testFor(test)?.group ?? 'Other';
  const tests = [...grouped.keys()].sort(
    (a, b) =>
      LAB_TESTS.findIndex((t) => t.key === a) - LAB_TESTS.findIndex((t) => t.key === b) ||
      labName(a).localeCompare(labName(b)),
  );
  const dates = labs.map((l) => l.date).sort();
  const lastDraw = dates.length ? dates[dates.length - 1] : null;

  return (
    <Screen title="Labs">
      <ActionButton label="Add lab results" onPress={() => setAdding(true)} />

      {labs.length === 0 ? (
        <Card>
          <ThemedText>
            Add results from your lab reports (C3, C4, anti-dsDNA, blood counts, kidney tests, and more) to see how they
            change over time.
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Tip: start with your most recent report, then add older ones to build up the trend.
          </ThemedText>
        </Card>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Latest results from {parseDate(lastDraw!).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}.
          Tap a test for its chart.
        </ThemedText>
      )}

      {GROUPS.map((g) => {
        const inGroup = tests.filter((t) => groupOf(t) === g);
        if (!inGroup.length) return null;
        return (
          <Card key={g}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {g.toUpperCase()}
            </ThemedText>
            {inGroup.map((t) => (
              <TestRow key={t} results={grouped.get(t)!} onPress={() => setViewing(t)} />
            ))}
          </Card>
        );
      })}

      <AddResultsForm
        visible={adding}
        onClose={() => setAdding(false)}
        onSave={async (results) => {
          setAdding(false);
          await update([...labs, ...results]);
        }}
      />
      <TestDetail
        test={viewing}
        results={viewing ? grouped.get(viewing) ?? [] : []}
        onClose={() => setViewing(null)}
        onDelete={async (id) => {
          const next = labs.filter((l) => l.id !== id);
          await update(next);
          if (!next.some((l) => l.test === viewing)) setViewing(null);
        }}
      />
    </Screen>
  );
}

function TestRow({ results, onPress }: { results: LabResult[]; onPress: () => void }) {
  const theme = useTheme();
  const latest = results[results.length - 1];
  const prev = results[results.length - 2];
  const flag = flagFor(latest);
  const out = flag === 'low' || flag === 'high';
  let change = '';
  if (prev && prev.value !== 0) {
    const pct = Math.round(((latest.value - prev.value) / Math.abs(prev.value)) * 100);
    change = pct === 0 ? 'No change' : `${pct > 0 ? '↑' : '↓'} ${Math.abs(pct)}% since ${parseDate(prev.date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
  }
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { borderColor: theme.backgroundSelected, opacity: pressed ? 0.6 : 1 }]}>
      <View style={styles.flex}>
        <ThemedText type="smallBold">{labName(latest.test)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {change || `${results.length} result`}
        </ThemedText>
      </View>
      <View style={styles.right}>
        <ThemedText type="smallBold">
          {formatValue(latest.value)} <ThemedText type="small" themeColor="textSecondary">{latest.unit}</ThemedText>
        </ThemedText>
        {FLAG_LABEL[flag] ? (
          <ThemedText type="small" style={{ color: out ? theme.sunAlert : theme.textSecondary }}>
            {FLAG_LABEL[flag]}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderTopWidth: 1, paddingTop: Spacing.two },
  flex: { flex: 1, gap: Spacing.half },
  right: { alignItems: 'flex-end' },
});
