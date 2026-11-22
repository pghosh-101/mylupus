import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Input } from '@/components/meds/controls';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addCustomSymptom, loadCustomSymptoms, removeCustomSymptom } from '@/lib/daily';
import { select } from '@/lib/haptics';

/**
 * Multi-select symptom chips: the built-in list, symptoms you've added before, and a
 * "+ Add symptom" chip to type a new one. Added symptoms are saved for next time.
 * Press and hold a symptom you added to remove it from the choices.
 */
export function SymptomChips({
  base,
  value,
  onChange,
  onOptionsChange,
}: {
  base: readonly string[];
  value: string[];
  onChange: (v: string[]) => void;
  /** Called with every option shown (built-in and added), e.g. to record unpicked ones as "none". */
  onOptionsChange?: (all: string[]) => void;
}) {
  const theme = useTheme();
  const [custom, setCustom] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    loadCustomSymptoms().then(setCustom);
  }, []);

  const baseKey = base.join('|');
  const customKey = custom.join('|');
  useEffect(() => {
    onOptionsChange?.([...base, ...custom]);
    // Report whenever the list of options changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseKey, customKey]);

  // Symptoms already picked on this entry but no longer in the lists (e.g. removed later) still show.
  const options = [...new Set([...base, ...custom, ...value])];

  const add = async () => {
    const name = draft.trim();
    if (!name) return setAdding(false);
    const list = await addCustomSymptom(name);
    setCustom(list);
    const match = [...base, ...list].find((s) => s.toLowerCase() === name.toLowerCase()) ?? name;
    if (!value.includes(match)) onChange([...value, match]);
    setDraft('');
    setAdding(false);
  };

  const remove = (name: string) => {
    const go = async () => {
      setCustom(await removeCustomSymptom(name));
      onChange(value.filter((v) => v !== name));
    };
    if (Platform.OS === 'web') return go();
    Alert.alert(`Remove "${name}"?`, 'It will no longer show as a choice. Past entries keep it.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: go },
    ]);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {options.map((o) => {
          const on = value.includes(o);
          const isCustom = custom.includes(o);
          return (
            <Pressable
              key={o}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityHint={isCustom ? 'Press and hold to remove from your choices' : undefined}
              onPress={() => {
                select();
                onChange(on ? value.filter((x) => x !== o) : [...value, o]);
              }}
              onLongPress={isCustom ? () => remove(o) : undefined}
              style={[
                styles.chip,
                {
                  backgroundColor: on ? theme.accentFill : theme.background,
                  borderColor: on ? theme.accentFill : theme.backgroundSelected,
                },
              ]}>
              <ThemedText type="small" style={{ color: on ? theme.onAccent : theme.text, fontWeight: '600' }}>
                {o}
              </ThemedText>
            </Pressable>
          );
        })}
        {!adding && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              select();
              setAdding(true);
            }}
            style={[styles.chip, styles.addChip, { borderColor: theme.accent }]}>
            <ThemedText type="small" style={{ color: theme.accent, fontWeight: '700' }}>
              + Add symptom
            </ThemedText>
          </Pressable>
        )}
      </View>
      {adding && (
        <View style={styles.addRow}>
          <View style={styles.flex}>
            <Input
              value={draft}
              onChangeText={setDraft}
              placeholder="e.g. Dry eyes, Chest tightness"
              autoFocus
              autoCapitalize="sentences"
              returnKeyType="done"
              onSubmitEditing={add}
              maxLength={40}
            />
          </View>
          <Pressable onPress={add} hitSlop={8} style={[styles.addButton, { backgroundColor: theme.accentFill }]}>
            <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
              Add
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => {
              setDraft('');
              setAdding(false);
            }}
            hitSlop={8}>
            <ThemedText type="small" style={{ color: theme.accent }}>
              Cancel
            </ThemedText>
          </Pressable>
        </View>
      )}
      {custom.length > 0 && !adding && (
        <ThemedText type="small" themeColor="textSecondary">
          Press and hold a symptom you added to remove it.
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { paddingVertical: Spacing.one + 2, paddingHorizontal: Spacing.three, borderRadius: 999, borderWidth: 1 },
  addChip: { borderStyle: 'dashed' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
  addButton: { borderRadius: 12, paddingVertical: Spacing.two + 2, paddingHorizontal: Spacing.three },
});
