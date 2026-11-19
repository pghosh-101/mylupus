import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Field, TimeStepper } from '@/components/meds/controls';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Routine } from '@/lib/meds';

const FIELDS: { key: keyof Routine; label: string }[] = [
  { key: 'wake', label: 'Wake up' },
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'bed', label: 'Bedtime' },
];

export function RoutineForm({
  visible,
  routine,
  onSave,
  onClose,
}: {
  visible: boolean;
  routine: Routine;
  onSave: (r: Routine) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState(routine);
  useEffect(() => {
    if (visible) setDraft(routine);
  }, [visible, routine]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView edges={['top', 'bottom']} style={[styles.sheet, { backgroundColor: theme.backgroundElement }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12}>
            <ThemedText style={{ color: theme.accent }}>Cancel</ThemedText>
          </Pressable>
          <ThemedText type="smallBold">My routine</ThemedText>
          <Pressable onPress={() => onSave(draft)} hitSlop={12}>
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              Save
            </ThemedText>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <ThemedText themeColor="textSecondary">
            Used to suggest dose times and to check that each dose fits its food rule. Changing it
            doesn&apos;t move doses you&apos;ve already set.
          </ThemedText>
          {FIELDS.map((f) => (
            <Field key={f.key} label={f.label}>
              <TimeStepper value={draft[f.key]} onChange={(m) => setDraft({ ...draft, [f.key]: m })} />
            </Field>
          ))}
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
  body: { padding: Spacing.three, gap: Spacing.four, paddingBottom: Spacing.six },
});
