import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SymptomChips } from '@/components/log/symptom-chips';
import { Field, FormSheet, Input, MultiChips, Segmented, Stepper } from '@/components/meds/controls';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { DIET_TAGS, SYMPTOMS, type EveningEntry, type Level } from '@/lib/daily';

const LEVELS: { value: Level; label: string }[] = [
  { value: 0, label: 'None' },
  { value: 1, label: 'Mild' },
  { value: 2, label: 'Moderate' },
  { value: 3, label: 'Severe' },
];

export function EveningForm({
  visible,
  date,
  existing,
  onSave,
  onClose,
}: {
  visible: boolean;
  date: string;
  existing: EveningEntry | null;
  onSave: (e: EveningEntry) => void;
  onClose: () => void;
}) {
  const [symptoms, setSymptoms] = useState<Partial<Record<string, Level>>>({});
  /** Every symptom shown as a choice (built-in and ones you added). */
  const [allSymptoms, setAllSymptoms] = useState<string[]>([...SYMPTOMS]);
  const [stress, setStress] = useState<Level>(0);
  const [diet, setDiet] = useState<EveningEntry['diet']>(null);
  const [dietTags, setDietTags] = useState<string[]>([]);
  const [homeMeals, setHomeMeals] = useState(0);
  const [outMeals, setOutMeals] = useState(0);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!visible) return;
    setSymptoms(existing?.symptoms ?? {});
    setStress(existing?.stress ?? 0);
    setDiet(existing?.diet ?? null);
    setDietTags(existing?.dietTags ?? []);
    setHomeMeals(existing?.homeMeals ?? 0);
    setOutMeals(existing?.outMeals ?? 0);
    setNotes(existing?.notes ?? '');
  }, [visible, existing]);

  const save = () => {
    // Untouched symptoms count as "none" so every day has a full record.
    const names = [...new Set([...allSymptoms, ...Object.keys(symptoms)])];
    const full = Object.fromEntries(names.map((s) => [s, symptoms[s] ?? 0])) as Record<string, Level>;
    onSave({ date, symptoms: full, stress, diet, dietTags, homeMeals, outMeals, notes: notes.trim() });
  };

  return (
    <FormSheet visible={visible} title="How was today?" saveLabel="Save check-in" onClose={onClose} onSave={save}>
      <Field label="Any symptoms today?" hint="Tap the ones you had. Leave blank for a good day.">
        <SymptomChips
          base={SYMPTOMS}
          value={Object.keys(symptoms).filter((s) => (symptoms[s] ?? 0) > 0)}
          onOptionsChange={setAllSymptoms}
          onChange={(picked) =>
            setSymptoms(
              Object.fromEntries(
                [...new Set([...Object.keys(symptoms), ...picked])].map((s) => [
                  s,
                  picked.includes(s) ? Math.max(1, symptoms[s] ?? 0) : 0,
                ]),
              ) as Record<string, Level>,
            )
          }
        />
        {Object.keys(symptoms)
          .filter((s) => (symptoms[s] ?? 0) > 0)
          .map((s) => (
          <View key={s} style={styles.symptom}>
            <ThemedText type="small">{s}</ThemedText>
            <Segmented
              options={LEVELS.slice(1)}
              value={symptoms[s] ?? 1}
              onChange={(v) => setSymptoms({ ...symptoms, [s]: v })}
            />
          </View>
        ))}
      </Field>

      <Field label="Stress">
        <Segmented options={LEVELS} value={stress} onChange={setStress} />
      </Field>

      <Field label="How did you eat?">
        <Segmented
          options={[
            { value: 'well', label: 'Well' },
            { value: 'so-so', label: 'So-so' },
            { value: 'poorly', label: 'Poorly' },
          ]}
          value={diet ?? ''}
          onChange={(v) => setDiet(v as EveningEntry['diet'])}
        />
      </Field>

      <Field label="Meals">
        <View style={styles.mealRow}>
          <ThemedText type="small" style={styles.mealLabel}>
            Home-cooked
          </ThemedText>
          <Stepper
            label={String(homeMeals)}
            onMinus={() => setHomeMeals(Math.max(0, homeMeals - 1))}
            onPlus={() => setHomeMeals(Math.min(6, homeMeals + 1))}
          />
        </View>
        <View style={styles.mealRow}>
          <ThemedText type="small" style={styles.mealLabel}>
            Eaten out / takeout
          </ThemedText>
          <Stepper
            label={String(outMeals)}
            onMinus={() => setOutMeals(Math.max(0, outMeals - 1))}
            onPlus={() => setOutMeals(Math.min(6, outMeals + 1))}
          />
        </View>
      </Field>

      <Field label="Food tags">
        <MultiChips options={DIET_TAGS} value={dietTags} onChange={setDietTags} />
      </Field>

      <Field label="Notes" hint="Anything else, like what you ate or how you felt.">
        <Input value={notes} onChangeText={setNotes} placeholder="e.g. Home-cooked dal and rice for dinner" multiline />
      </Field>
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  symptom: { gap: Spacing.one, marginBottom: Spacing.two },
  mealRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  mealLabel: { flex: 1 },
});
