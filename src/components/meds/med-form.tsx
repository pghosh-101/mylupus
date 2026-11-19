import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton, Field, Input, Segmented, Stepper, TimeStepper } from '@/components/meds/controls';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  FOOD_RULE_HINT,
  FOOD_RULE_LABEL,
  foodConflict,
  formatDate,
  newId,
  parseDate,
  QUICK_PICKS,
  suggestTimes,
  supplyInfo,
  todayString,
  type FoodRule,
  type Medication,
  type Minutes,
  type Routine,
} from '@/lib/meds';

type Props = {
  visible: boolean;
  /** Medication to edit, or null to add a new one. */
  med: Medication | null;
  routine: Routine;
  onSave: (med: Medication) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

export function MedForm({ visible, med, routine, onSave, onDelete, onClose }: Props) {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [pills, setPills] = useState(1);
  const [foodRule, setFoodRule] = useState<FoodRule>('any');
  const [times, setTimes] = useState<Minutes[]>([routine.breakfast]);
  const [instructions, setInstructions] = useState('');
  const [sideEffects, setSideEffects] = useState('');
  const [trackSupply, setTrackSupply] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [asOf, setAsOf] = useState(todayString());

  // Load the medication (or blank form) each time the form opens.
  useEffect(() => {
    if (!visible) return;
    setName(med?.name ?? '');
    setPills(med?.pillsPerDose ?? 1);
    setFoodRule(med?.foodRule ?? 'any');
    setTimes(med?.doseTimes ?? [routine.breakfast]);
    setInstructions(med?.instructions ?? '');
    setSideEffects(med?.sideEffects ?? '');
    setTrackSupply(Boolean(med?.supply));
    setQuantity(med?.supply ? String(med.supply.quantity) : '');
    setAsOf(med?.supply?.asOf ?? todayString());
  }, [visible, med, routine.breakfast]);

  const setTimesPerDay = (n: number) => {
    setTimes(suggestTimes(n, foodRule, routine));
  };

  const draft: Medication = {
    id: med?.id ?? newId(),
    name: name.trim(),
    pillsPerDose: pills,
    doseTimes: [...times].sort((a, b) => a - b),
    foodRule,
    instructions: instructions.trim(),
    sideEffects: sideEffects.trim(),
    supply: trackSupply && Number(quantity) > 0 ? { quantity: Number(quantity), asOf } : null,
  };
  const supply = supplyInfo(draft);

  const save = () => {
    if (!draft.name) return Alert.alert('Add a name', 'Give this medication a name first.');
    onSave(draft);
  };

  const confirmDelete = () => {
    if (!med) return;
    Alert.alert(`Delete ${med.name}?`, 'Its reminders will stop. Past dose history is kept.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(med.id) },
    ]);
  };

  const shiftDate = (days: number) => {
    const d = parseDate(asOf);
    d.setDate(d.getDate() + days);
    if (d.getTime() <= parseDate(todayString()).getTime()) setAsOf(todayString(d));
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView edges={['top', 'bottom']} style={[styles.sheet, { backgroundColor: theme.backgroundElement }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12}>
            <ThemedText style={{ color: theme.accent }}>Cancel</ThemedText>
          </Pressable>
          <ThemedText type="smallBold" numberOfLines={1} style={styles.title}>
            {med ? 'Edit medication' : 'Add medication'}
          </ThemedText>
          <Pressable onPress={save} hitSlop={12}>
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              Save
            </ThemedText>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {!med && (
            <Field label="Quick pick" hint="Fills in typical instructions. Always follow your own prescription label.">
              <Segmented
                options={QUICK_PICKS.map((q) => ({ value: q.name, label: q.name.split(' (')[0] }))}
                value={name}
                onChange={(v) => {
                  const pick = QUICK_PICKS.find((q) => q.name === v)!;
                  setName(pick.name);
                  setFoodRule(pick.foodRule);
                  setInstructions(pick.instructions);
                  setTimes(suggestTimes(times.length, pick.foodRule, routine));
                }}
              />
            </Field>
          )}

          <Field label="Name">
            <Input value={name} onChangeText={setName} placeholder="e.g. Plaquenil" autoCorrect={false} />
          </Field>

          <Field label="Pills per dose">
            <Stepper
              label={`${pills} pill${pills === 1 ? '' : 's'}`}
              onMinus={() => setPills(Math.max(1, pills - 1))}
              onPlus={() => setPills(Math.min(20, pills + 1))}
            />
          </Field>

          <Field label="How to take" hint={FOOD_RULE_HINT[foodRule]}>
            <Segmented
              options={(Object.keys(FOOD_RULE_LABEL) as FoodRule[]).map((k) => ({
                value: k,
                label: FOOD_RULE_LABEL[k],
              }))}
              value={foodRule}
              onChange={setFoodRule}
            />
          </Field>

          <Field label="Times per day">
            <Segmented
              options={[1, 2, 3, 4].map((n) => ({ value: n, label: `${n}×` }))}
              value={times.length}
              onChange={setTimesPerDay}
            />
          </Field>

          <Field label="Schedule">
            {times.map((t, i) => {
              const warning = foodConflict(t, foodRule, routine);
              return (
                <View key={i} style={styles.timeRow}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.doseLabel}>
                    Dose {i + 1}
                  </ThemedText>
                  <View style={styles.timeCol}>
                    <TimeStepper value={t} onChange={(m) => setTimes(times.map((x, j) => (j === i ? m : x)))} />
                    {warning && (
                      <ThemedText type="small" style={{ color: theme.sunAlert }}>
                        {warning}
                      </ThemedText>
                    )}
                  </View>
                </View>
              );
            })}
            <ActionButton
              label="Suggest times from my routine"
              kind="secondary"
              onPress={() => setTimes(suggestTimes(times.length, foodRule, routine))}
            />
          </Field>

          <Field label="Instructions">
            <Input
              value={instructions}
              onChangeText={setInstructions}
              placeholder="e.g. Keep antacids 2 hours apart"
              multiline
            />
          </Field>

          <Field label="Side effects to watch for">
            <Input value={sideEffects} onChangeText={setSideEffects} placeholder="e.g. Nausea, headache" multiline />
          </Field>

          <Field label="Refill tracking">
            <Segmented
              options={[
                { value: 'on', label: 'Track supply' },
                { value: 'off', label: 'Off' },
              ]}
              value={trackSupply ? 'on' : 'off'}
              onChange={(v) => setTrackSupply(v === 'on')}
            />
            {trackSupply && (
              <>
                <ThemedText type="small" themeColor="textSecondary">
                  Pills on hand
                </ThemedText>
                <Input value={quantity} onChangeText={setQuantity} placeholder="e.g. 120" keyboardType="number-pad" />
                <ThemedText type="small" themeColor="textSecondary">
                  As of
                </ThemedText>
                <Stepper
                  label={asOf === todayString() ? 'Today' : formatDate(parseDate(asOf))}
                  onMinus={() => shiftDate(-1)}
                  onPlus={() => shiftDate(1)}
                />
                {supply && (
                  <ThemedText type="small" themeColor="textSecondary">
                    {supply.perDay} pills a day, so you&apos;ll run out around{' '}
                    <ThemedText type="smallBold">{formatDate(supply.runOut)}</ThemedText>. Refill reminders 7 and 3
                    days before.
                  </ThemedText>
                )}
              </>
            )}
          </Field>

          <ActionButton label={med ? 'Save changes' : 'Add medication'} onPress={save} />
          {med && <ActionButton label="Delete medication" kind="danger" onPress={confirmDelete} />}
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
  title: { flex: 1, textAlign: 'center' },
  body: { padding: Spacing.three, gap: Spacing.four, paddingBottom: Spacing.six },
  timeRow: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  doseLabel: { width: 52, paddingTop: 10 },
  timeCol: { flex: 1, gap: Spacing.one },
});
