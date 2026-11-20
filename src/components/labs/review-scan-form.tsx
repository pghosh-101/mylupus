import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { DayStepper, Field, FormSheet, Input } from '@/components/meds/controls';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ExtractedResult } from '@/lib/ai';
import { labName, newLabId, testFor, type LabResult } from '@/lib/labs';
import { parseDate, todayString } from '@/lib/meds';

type Row = {
  id: string;
  include: boolean;
  test: string;
  date: string;
  value: string;
  unit: string;
  low: string;
  high: string;
};

const num = (s: string) => (s.trim() === '' || isNaN(Number(s)) ? null : Number(s));
const validDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(parseDate(d).getTime());

/** Review what Claude read from the photos before saving. Nothing is saved until you tap Save. */
export function ReviewScanForm({
  extracted,
  notes,
  existing,
  onSave,
  onClose,
}: {
  extracted: ExtractedResult[] | null;
  notes: string;
  existing: LabResult[];
  onSave: (results: LabResult[]) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [rows, setRows] = useState<Row[]>([]);
  const [fallbackDate, setFallbackDate] = useState(todayString());

  useEffect(() => {
    if (!extracted) return;
    setRows(
      extracted.map((r) => {
        const test = r.test_key !== 'other' && testFor(r.test_key) ? r.test_key : `custom:${r.name_on_report.trim() || 'Unknown test'}`;
        const date = validDate(r.date) ? r.date : '';
        // Already saved (same test, date, and value)? Leave it unchecked to avoid duplicates.
        const duplicate = existing.some((e) => e.test === test && e.date === date && e.value === r.value);
        return {
          id: newLabId(),
          include: !duplicate,
          test,
          date,
          value: String(r.value),
          unit: r.unit,
          low: r.ref_low?.toString() ?? '',
          high: r.ref_high?.toString() ?? '',
        };
      }),
    );
    setFallbackDate(todayString());
  }, [extracted, existing]);

  const update = (id: string, patch: Partial<Row>) => setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const missingDate = rows.some((r) => r.include && !r.date);
  const dates = [...new Set(rows.map((r) => r.date))].sort().reverse();

  const save = () => {
    const chosen = rows.filter((r) => r.include && num(r.value) !== null);
    if (!chosen.length) return Alert.alert('Nothing selected', 'Check at least one result to save.');
    onSave(
      chosen.map((r) => ({
        id: newLabId(),
        test: r.test,
        date: r.date || fallbackDate,
        value: num(r.value)!,
        unit: r.unit.trim(),
        low: num(r.low),
        high: num(r.high),
        note: '',
      })),
    );
  };

  const count = rows.filter((r) => r.include).length;

  return (
    <FormSheet
      visible={extracted !== null}
      title="Check the results"
      saveLabel={`Save ${count} result${count === 1 ? '' : 's'}`}
      onClose={onClose}
      onSave={save}>
      <ThemedText type="small" themeColor="textSecondary">
        Claude read these from your photo. Compare them with the report and fix anything that looks off before
        saving. Unchecked results won&apos;t be saved.
      </ThemedText>
      {notes ? (
        <ThemedText type="small" style={styles.notes}>
          Note from the reader: {notes}
        </ThemedText>
      ) : null}
      {rows.length === 0 && (
        <ThemedText>No numeric results were found. Try a clearer, closer photo of the results table.</ThemedText>
      )}

      {missingDate && (
        <Field label="Date for results without one" hint="The report didn't show a date for some results.">
          <DayStepper value={fallbackDate} onChange={setFallbackDate} />
        </Field>
      )}

      {dates.map((d) => (
        <View key={d || 'none'} style={styles.group}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {d
              ? parseDate(d).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()
              : 'NO DATE ON REPORT'}
          </ThemedText>
          {rows
            .filter((r) => r.date === d)
            .map((r) => (
              <View key={r.id} style={[styles.row, { borderColor: theme.backgroundSelected, opacity: r.include ? 1 : 0.5 }]}>
                <Pressable onPress={() => update(r.id, { include: !r.include })} style={styles.checkRow} hitSlop={6}>
                  <View
                    style={[
                      styles.check,
                      { borderColor: theme.accent, backgroundColor: r.include ? theme.accentFill : 'transparent' },
                    ]}>
                    {r.include && <ThemedText style={[styles.checkMark, { color: theme.onAccent }]}>✓</ThemedText>}
                  </View>
                  <ThemedText type="smallBold" style={styles.flex}>
                    {labName(r.test)}
                  </ThemedText>
                </Pressable>
                <View style={styles.valueRow}>
                  <View style={styles.flex}>
                    <Input
                      value={r.value}
                      onChangeText={(v) => update(r.id, { value: v.replace(',', '.') })}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={styles.unit}>
                    <Input value={r.unit} onChangeText={(v) => update(r.id, { unit: v })} autoCapitalize="none" />
                  </View>
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  Range on report: {r.low || '–'} to {r.high || '–'}
                </ThemedText>
              </View>
            ))}
        </View>
      ))}
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  notes: { fontStyle: 'italic' },
  group: { gap: Spacing.two },
  row: { borderTopWidth: 1, paddingTop: Spacing.two, gap: Spacing.two },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkMark: { fontSize: 14, lineHeight: 16 },
  flex: { flex: 1 },
  valueRow: { flexDirection: 'row', gap: Spacing.two },
  unit: { width: 110 },
});
