import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { ActionButton, DayStepper, Field, FormSheet, Input } from '@/components/meds/controls';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { newLabId, type LabResult } from '@/lib/labs';
import { todayString } from '@/lib/meds';

const num = (s: string) => (s.trim() === '' || isNaN(Number(s)) ? null : Number(s));

/** Add a result to a test, or edit / delete an existing one. */
export function ResultSheet({
  visible,
  test,
  name,
  result,
  template,
  onSave,
  onDelete,
  onClose,
}: {
  visible: boolean;
  test: string;
  name: string;
  /** The result being edited, or null to add a new one. */
  result: LabResult | null;
  /** The latest result, used to pre-fill unit and range for a new one. */
  template?: LabResult;
  onSave: (r: LabResult) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(todayString());
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('');
  const [low, setLow] = useState('');
  const [high, setHigh] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!visible) return;
    const src = result ?? template;
    setDate(result?.date ?? todayString());
    setValue(result ? String(result.value) : '');
    setUnit(src?.unit ?? '');
    setLow(src?.low?.toString() ?? '');
    setHigh(src?.high?.toString() ?? '');
    setNote(result?.note ?? '');
  }, [visible, result, template]);

  const save = () => {
    const v = num(value);
    if (v === null) return Alert.alert('Enter a value', 'Type the number from your lab report.');
    onSave({
      id: result?.id ?? newLabId(),
      test,
      date,
      value: v,
      unit: unit.trim(),
      low: num(low),
      high: num(high),
      note: note.trim(),
    });
  };

  return (
    <FormSheet
      visible={visible}
      title={result ? `Edit ${name}` : `Add ${name}`}
      saveLabel={result ? 'Save changes' : 'Add result'}
      onClose={onClose}
      onSave={save}>
      <Field label="Date">
        <DayStepper value={date} onChange={setDate} />
      </Field>
      <Field label="Value">
        <View style={styles.row}>
          <View style={styles.flex}>
            <Input value={value} onChangeText={(v) => setValue(v.replace(',', '.'))} placeholder="Value" keyboardType="decimal-pad" />
          </View>
          <View style={styles.unit}>
            <Input value={unit} onChangeText={setUnit} placeholder="Unit" autoCapitalize="none" />
          </View>
        </View>
      </Field>
      <Field label="Normal range on this report" hint="Leave a side blank if the report shows only one limit.">
        <View style={styles.row}>
          <View style={styles.flex}>
            <Input value={low} onChangeText={setLow} placeholder="Low" keyboardType="decimal-pad" />
          </View>
          <ThemedText themeColor="textSecondary">to</ThemedText>
          <View style={styles.flex}>
            <Input value={high} onChangeText={setHigh} placeholder="High" keyboardType="decimal-pad" />
          </View>
        </View>
      </Field>
      <Field label="Note">
        <Input value={note} onChangeText={setNote} placeholder="e.g. Doctor said it's trending the right way" multiline />
      </Field>
      {result && (
        <ActionButton
          label="Delete this result"
          kind="danger"
          onPress={() =>
            Alert.alert('Delete this result?', undefined, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => onDelete(result.id) },
            ])
          }
        />
      )}
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  flex: { flex: 1 },
  unit: { width: 110 },
});
