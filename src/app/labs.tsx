import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AddResultsForm } from '@/components/labs/add-results-form';
import { ReviewScanForm } from '@/components/labs/review-scan-form';
import { TestDetail } from '@/components/labs/test-detail';
import { ActionButton } from '@/components/meds/controls';
import { Card, Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  byTest,
  displayStatus,
  formatValue,
  LAB_TESTS,
  labName,
  loadLabs,
  loadTestNotes,
  saveLabs,
  saveTestNote,
  testFor,
  type LabResult,
  type TestNote,
} from '@/lib/labs';
import { aiErrorMessage, hasAiKey, readLabReport, type ExtractedResult, type ReportImage } from '@/lib/ai';
import { parseDate } from '@/lib/meds';
import { photographReport, pickReportImages } from '@/lib/scan';

const GROUPS = ['Lupus activity', 'Blood counts', 'Kidneys', 'Liver', 'Other'] as const;

export default function LabsScreen() {
  const [labs, setLabs] = useState<LabResult[]>([]);
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, TestNote>>({});
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<{ results: ExtractedResult[]; notes: string } | null>(null);

  const reload = useCallback(async () => {
    const [l, n] = await Promise.all([loadLabs(), loadTestNotes()]);
    setLabs(l);
    setNotes(n);
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
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

  const runScan = async (source: 'camera' | 'library') => {
    try {
      const images: ReportImage[] | null = source === 'camera' ? await photographReport() : await pickReportImages();
      if (!images?.length) return;
      setScanning(true);
      setScan(await readLabReport(images));
    } catch (e) {
      console.warn('Lab report scan failed:', e);
      Alert.alert("Couldn't read the report", aiErrorMessage(e));
    } finally {
      setScanning(false);
    }
  };

  const startScan = () => {
    if (!hasAiKey) {
      Alert.alert(
        'Claude API key needed',
        'Reading photos uses Claude. Add EXPO_PUBLIC_ANTHROPIC_API_KEY to the .env.local file on your laptop, then restart the app.',
      );
      return;
    }
    if (Platform.OS === 'web') return runScan('library');
    Alert.alert('Scan a lab report', 'Photograph a printed report, or pick photos or screenshots (up to 5 pages).', [
      { text: 'Take a photo', onPress: () => runScan('camera') },
      { text: 'Choose from photos', onPress: () => runScan('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <Screen title="Labs">
      {scanning ? (
        <Card>
          <ActivityIndicator />
          <ThemedText themeColor="textSecondary" style={styles.center}>
            Reading your report… this can take up to a minute.
          </ThemedText>
        </Card>
      ) : (
        <View style={styles.buttons}>
          <ActionButton label="Scan a lab report" onPress={startScan} />
          <ActionButton label="Type results in" kind="secondary" onPress={() => setAdding(true)} />
        </View>
      )}

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
              <TestRow key={t} results={grouped.get(t)!} note={notes[t]} onPress={() => setViewing(t)} />
            ))}
          </Card>
        );
      })}

      <ReviewScanForm
        extracted={scan?.results ?? null}
        notes={scan?.notes ?? ''}
        existing={labs}
        onClose={() => setScan(null)}
        onSave={async (results) => {
          setScan(null);
          await update([...labs, ...results]);
        }}
      />
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
        note={viewing ? notes[viewing] : undefined}
        onSaveNote={async (note) => {
          if (!viewing) return;
          await saveTestNote(viewing, note);
          setNotes(await loadTestNotes());
        }}
        onSaveResult={async (result) => {
          await update(labs.map((l) => (l.id === result.id ? result : l)));
        }}
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

function TestRow({ results, note, onPress }: { results: LabResult[]; note?: TestNote; onPress: () => void }) {
  const theme = useTheme();
  const latest = results[results.length - 1];
  const prev = results[results.length - 2];
  const status = displayStatus(results, note);
  let change = '';
  if (prev && prev.value !== 0) {
    const pct = Math.round(((latest.value - prev.value) / Math.abs(prev.value)) * 100);
    change = pct === 0 ? 'No change' : `${pct > 0 ? '↑' : '↓'} ${Math.abs(pct)}% since ${parseDate(prev.date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
  }
  const statusColor = status.tone === 'alert' ? theme.sunAlert : theme.textSecondary;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { borderColor: theme.backgroundSelected, opacity: pressed ? 0.6 : 1 }]}>
      <View style={styles.flex}>
        <ThemedText type="smallBold">{labName(latest.test)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {change || `${results.length} result`}
        </ThemedText>
        {status.worsening && (
          <ThemedText type="small" style={{ color: theme.sunAlert }}>
            Rising since last test
          </ThemedText>
        )}
        {note?.note ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.note}>
            Doctor: {note.note}
          </ThemedText>
        ) : null}
      </View>
      <View style={styles.right}>
        <ThemedText type="smallBold">
          {formatValue(latest.value)} <ThemedText type="small" themeColor="textSecondary">{latest.unit}</ThemedText>
        </ThemedText>
        {status.label ? (
          <ThemedText type="small" style={[styles.status, { color: statusColor }]}>
            {status.label}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderTopWidth: 1, paddingTop: Spacing.two },
  flex: { flex: 1, gap: Spacing.half },
  right: { alignItems: 'flex-end', maxWidth: '45%' },
  buttons: { gap: Spacing.two },
  center: { textAlign: 'center' },
  status: { textAlign: 'right' },
  note: { fontStyle: 'italic' },
});
