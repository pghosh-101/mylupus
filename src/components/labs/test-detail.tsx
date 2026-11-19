import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LabChart } from '@/components/labs/lab-chart';
import { ActionButton, Input, Segmented } from '@/components/meds/controls';
import { Card } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  displayStatus,
  FLAG_LABEL,
  flagFor,
  formatRange,
  formatValue,
  labName,
  testFor,
  type LabResult,
  type TestNote,
} from '@/lib/labs';
import { parseDate, todayString } from '@/lib/meds';

const longDate = (d: string) =>
  parseDate(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/** One test: what it is, your doctor's note, a chart over time, and every result. */
export function TestDetail({
  test,
  results,
  note,
  onSaveNote,
  onSaveResult,
  onDelete,
  onClose,
}: {
  test: string | null;
  results: LabResult[];
  note?: TestNote;
  onSaveNote: (note: TestNote | null) => void;
  onSaveResult: (result: LabResult) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const info = test ? testFor(test) : undefined;
  const latest = results[results.length - 1];
  const status = results.length ? displayStatus(results, note) : null;

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
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {info && (
            <ThemedText type="small" themeColor="textSecondary">
              {info.about}
            </ThemedText>
          )}

          {status?.worsening && note?.okForMe && (
            <Card>
              <ThemedText type="smallBold" style={{ color: theme.sunAlert }}>
                Rising since last test
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Your doctor said your level was OK, but it went up by more than 20% since the previous result. Worth
                mentioning at your next visit.
              </ThemedText>
            </Card>
          )}

          {latest && (
            <Card>
              <LabChart results={results} accepted={note?.okForMe} />
              <ThemedText type="small" themeColor="textSecondary">
                Normal range: {formatRange(latest.low, latest.high, latest.unit)}
              </ThemedText>
            </Card>
          )}

          {test && <DoctorNoteCard key={test} note={note} onSave={onSaveNote} />}

          <Card>
            <ThemedText type="smallBold" themeColor="textSecondary">
              ALL RESULTS
            </ThemedText>
            {[...results].reverse().map((r) => (
              <ResultRow key={r.id} result={r} accepted={note?.okForMe} onSave={onSaveResult} onDelete={onDelete} />
            ))}
          </Card>
          <ThemedText type="small" themeColor="textSecondary">
            Lab results need your doctor&apos;s interpretation. Trends over time usually matter more than a single value.
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function DoctorNoteCard({ note, onSave }: { note?: TestNote; onSave: (note: TestNote | null) => void }) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note?.note ?? '');
  const [ok, setOk] = useState(note?.okForMe ?? false);

  useEffect(() => {
    setText(note?.note ?? '');
    setOk(note?.okForMe ?? false);
  }, [note]);

  if (!editing) {
    return (
      <Card>
        <View style={styles.rowBetween}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            DOCTOR&apos;S NOTE
          </ThemedText>
          <Pressable onPress={() => setEditing(true)} hitSlop={8}>
            <ThemedText type="small" style={{ color: theme.accent }}>
              {note ? 'Edit' : 'Add'}
            </ThemedText>
          </Pressable>
        </View>
        {note ? (
          <>
            {note.okForMe && <ThemedText type="smallBold">✓ My doctor says this level is OK for me</ThemedText>}
            {note.note ? <ThemedText type="small">{note.note}</ThemedText> : null}
            <ThemedText type="small" themeColor="textSecondary">
              Updated {longDate(note.updated)}
            </ThemedText>
          </>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            Write down what your doctor said about this test. If they said your level is fine, you can turn off the
            warning.
          </ThemedText>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <ThemedText type="smallBold" themeColor="textSecondary">
        DOCTOR&apos;S NOTE
      </ThemedText>
      <Input
        value={text}
        onChangeText={setText}
        placeholder="e.g. Still above normal but coming down slowly. Doctor says this is OK."
        multiline
      />
      <ThemedText type="small" themeColor="textSecondary">
        Out-of-range results
      </ThemedText>
      <Segmented
        options={[
          { value: 'flag', label: 'Flag as usual' },
          { value: 'ok', label: 'Doctor says OK' },
        ]}
        value={ok ? 'ok' : 'flag'}
        onChange={(v) => setOk(v === 'ok')}
      />
      {ok && (
        <ThemedText type="small" themeColor="textSecondary">
          No orange warning for this test. You&apos;ll still see a heads-up if it rises more than 20% between tests.
        </ThemedText>
      )}
      <View style={styles.buttons}>
        <View style={styles.flex}>
          <ActionButton label="Cancel" kind="secondary" onPress={() => setEditing(false)} />
        </View>
        <View style={styles.flex}>
          <ActionButton
            label="Save note"
            onPress={() => {
              onSave(text.trim() || ok ? { note: text.trim(), okForMe: ok, updated: todayString() } : null);
              setEditing(false);
            }}
          />
        </View>
      </View>
    </Card>
  );
}

function ResultRow({
  result,
  accepted,
  onSave,
  onDelete,
}: {
  result: LabResult;
  accepted?: boolean;
  onSave: (r: LabResult) => void;
  onDelete: (id: string) => void;
}) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(result.note);
  const flag = flagFor(result);
  const out = flag === 'low' || flag === 'high';

  return (
    <View style={[styles.result, { borderColor: theme.backgroundSelected }]}>
      <View style={styles.rowBetween}>
        <View style={styles.flex}>
          <ThemedText type="smallBold">
            {formatValue(result.value)} {result.unit}
            {FLAG_LABEL[flag] ? (
              <ThemedText type="small" style={{ color: out && !accepted ? theme.sunAlert : theme.textSecondary }}>
                {' '}
                · {FLAG_LABEL[flag]}
              </ThemedText>
            ) : null}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {longDate(result.date)}
          </ThemedText>
        </View>
        <Pressable onPress={() => setEditing(!editing)} hitSlop={8}>
          <ThemedText type="small" style={{ color: theme.accent }}>
            {result.note ? 'Edit note' : 'Add note'}
          </ThemedText>
        </Pressable>
        <Pressable
          hitSlop={8}
          onPress={() =>
            Alert.alert('Delete this result?', undefined, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => onDelete(result.id) },
            ])
          }>
          <ThemedText type="small" style={{ color: theme.sunAlert }}>
            Delete
          </ThemedText>
        </Pressable>
      </View>
      {!editing && result.note ? (
        <ThemedText type="small" style={styles.note}>
          {result.note}
        </ThemedText>
      ) : null}
      {editing && (
        <>
          <Input value={text} onChangeText={setText} placeholder="e.g. Doctor said it's trending the right way" multiline />
          <ActionButton
            label="Save note"
            onPress={() => {
              onSave({ ...result, note: text.trim() });
              setEditing(false);
            }}
          />
        </>
      )}
    </View>
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
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  result: { borderTopWidth: 1, paddingTop: Spacing.two, gap: Spacing.two },
  flex: { flex: 1 },
  buttons: { flexDirection: 'row', gap: Spacing.two },
  note: { fontStyle: 'italic' },
});
