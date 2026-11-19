import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ActionButton, DayStepper, Field, FormSheet, Input, MultiChips } from '@/components/meds/controls';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { LAB_TESTS, labName, newLabId, testFor, type LabResult } from '@/lib/labs';
import { todayString } from '@/lib/meds';

type Row = {
  test: string;
  value: string;
  unit: string;
  low: string;
  high: string;
  showRange: boolean;
  note: string;
  showNote: boolean;
};

const num = (s: string) => (s.trim() === '' || isNaN(Number(s)) ? null : Number(s));

function rowFor(test: string): Row {
  const t = testFor(test);
  return {
    test,
    value: '',
    unit: t?.unit ?? '',
    low: t?.low?.toString() ?? '',
    high: t?.high?.toString() ?? '',
    showRange: false,
    note: '',
    showNote: false,
  };
}

/** Add several results from one blood draw at once. */
export function AddResultsForm({
  visible,
  onSave,
  onClose,
}: {
  visible: boolean;
  onSave: (results: LabResult[]) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [date, setDate] = useState(todayString());
  const [rows, setRows] = useState<Row[]>([]);
  const [custom, setCustom] = useState('');

  useEffect(() => {
    if (!visible) return;
    setDate(todayString());
    setRows([]);
    setCustom('');
  }, [visible]);

  const picked = rows.map((r) => r.test);
  const names = LAB_TESTS.map((t) => t.name);
  const setPickedNames = (selected: string[]) => {
    const keys = LAB_TESTS.filter((t) => selected.includes(t.name)).map((t) => t.key);
    const keepCustom = rows.filter((r) => r.test.startsWith('custom:'));
    setRows([
      ...LAB_TESTS.filter((t) => keys.includes(t.key)).map((t) => rows.find((r) => r.test === t.key) ?? rowFor(t.key)),
      ...keepCustom,
    ]);
  };
  const update = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = () => {
    const filled = rows.filter((r) => num(r.value) !== null);
    if (filled.length === 0) return Alert.alert('No values yet', 'Pick at least one test and enter its value.');
    onSave(
      filled.map((r) => ({
        id: newLabId(),
        test: r.test,
        date,
        value: num(r.value)!,
        unit: r.unit.trim(),
        low: num(r.low),
        high: num(r.high),
        note: r.note.trim(),
      })),
    );
  };

  return (
    <FormSheet visible={visible} title="Add lab results" saveLabel="Save results" onClose={onClose} onSave={save}>
      <Field label="Date of blood draw">
        <DayStepper value={date} onChange={setDate} />
      </Field>

      <Field label="Which tests?" hint="Tap every test on this lab report.">
        <MultiChips
          options={names}
          value={LAB_TESTS.filter((t) => picked.includes(t.key)).map((t) => t.name)}
          onChange={setPickedNames}
        />
        <View style={styles.customRow}>
          <View style={styles.flex}>
            <Input value={custom} onChangeText={setCustom} placeholder="Other test name" />
          </View>
          <ActionButton
            label="Add"
            kind="secondary"
            onPress={() => {
              const name = custom.trim();
              if (!name || picked.includes(`custom:${name}`)) return;
              setRows([...rows, rowFor(`custom:${name}`)]);
              setCustom('');
            }}
          />
        </View>
      </Field>

      {rows.map((r, i) => (
        <View key={r.test} style={[styles.row, { borderColor: theme.backgroundSelected }]}>
          <ThemedText type="smallBold">{labName(r.test)}</ThemedText>
          <View style={styles.valueRow}>
            <View style={styles.flex}>
              <Input
                value={r.value}
                onChangeText={(v) => update(i, { value: v.replace(',', '.') })}
                placeholder="Value"
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.unit}>
              <Input value={r.unit} onChangeText={(v) => update(i, { unit: v })} placeholder="Unit" autoCapitalize="none" />
            </View>
          </View>
          <Pressable onPress={() => update(i, { showRange: !r.showRange })} hitSlop={8}>
            <ThemedText type="small" style={{ color: theme.accent }}>
              Normal range: {r.low || '–'} to {r.high || '–'} {r.unit} · {r.showRange ? 'Done' : 'Edit to match your report'}
            </ThemedText>
          </Pressable>
          <Pressable onPress={() => update(i, { showNote: !r.showNote })} hitSlop={8}>
            <ThemedText type="small" style={{ color: theme.accent }}>
              {r.showNote ? 'Hide note' : r.note ? 'Edit note' : "Add a doctor's note"}
            </ThemedText>
          </Pressable>
          {r.showNote && (
            <Input
              value={r.note}
              onChangeText={(v) => update(i, { note: v })}
              placeholder="e.g. Doctor said this is OK, still coming down"
              multiline
            />
          )}
          {r.showRange && (
            <View style={styles.valueRow}>
              <View style={styles.flex}>
                <Input value={r.low} onChangeText={(v) => update(i, { low: v })} placeholder="Low" keyboardType="decimal-pad" />
              </View>
              <View style={styles.flex}>
                <Input value={r.high} onChangeText={(v) => update(i, { high: v })} placeholder="High" keyboardType="decimal-pad" />
              </View>
            </View>
          )}
        </View>
      ))}
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  customRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  row: { borderTopWidth: 1, paddingTop: Spacing.three, gap: Spacing.two },
  valueRow: { flexDirection: 'row', gap: Spacing.two },
  unit: { width: 110 },
});
