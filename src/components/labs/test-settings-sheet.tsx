import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Field, FormSheet, Input } from '@/components/meds/controls';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { defaultLabName } from '@/lib/labs';

const num = (s: string) => (s.trim() === '' || isNaN(Number(s)) ? null : Number(s));

/** Rename a test and set its normal range for every result. */
export function TestSettingsSheet({
  visible,
  test,
  name: currentName,
  low,
  high,
  onSave,
  onClose,
}: {
  visible: boolean;
  test: string;
  name: string;
  low: number | null;
  high: number | null;
  onSave: (s: { name: string; low: number | null; high: number | null; rangeChanged: boolean }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [lo, setLo] = useState('');
  const [hi, setHi] = useState('');

  useEffect(() => {
    if (!visible) return;
    setName(currentName);
    setLo(low?.toString() ?? '');
    setHi(high?.toString() ?? '');
  }, [visible, currentName, low, high]);

  const original = defaultLabName(test);

  return (
    <FormSheet
      visible={visible}
      title="Edit lab"
      saveLabel="Save"
      onClose={onClose}
      onSave={() =>
        onSave({
          name: name.trim() || original,
          low: num(lo),
          high: num(hi),
          rangeChanged: num(lo) !== low || num(hi) !== high,
        })
      }>
      <Field label="Name" hint={name.trim() !== original ? `Original name: ${original}` : undefined}>
        <Input value={name} onChangeText={setName} placeholder={original} />
      </Field>
      <Field label="Normal range" hint="Applies to every result for this lab. Use the range from your latest report.">
        <View style={styles.row}>
          <View style={styles.flex}>
            <Input value={lo} onChangeText={setLo} placeholder="Low" keyboardType="decimal-pad" />
          </View>
          <ThemedText themeColor="textSecondary">to</ThemedText>
          <View style={styles.flex}>
            <Input value={hi} onChangeText={setHi} placeholder="High" keyboardType="decimal-pad" />
          </View>
        </View>
      </Field>
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  flex: { flex: 1 },
});
