import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatMinutes, wrap, type Minutes } from '@/lib/meds';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label.toUpperCase()}
      </ThemedText>
      {children}
      {hint && (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      )}
    </View>
  );
}

export function Input(props: TextInputProps) {
  const theme = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.textSecondary}
      {...props}
      style={[
        styles.input,
        { color: theme.text, borderColor: theme.backgroundSelected, backgroundColor: theme.background },
        props.multiline && { minHeight: 88, textAlignVertical: 'top' },
        props.style,
      ]}
    />
  );
}

/** − value + control. */
export function Stepper({
  label,
  onMinus,
  onPlus,
  accessibilityLabel,
}: {
  label: string;
  onMinus: () => void;
  onPlus: () => void;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.stepper} accessibilityLabel={accessibilityLabel}>
      <StepButton text="−" onPress={onMinus} />
      <View style={[styles.stepValue, { backgroundColor: theme.background, borderColor: theme.backgroundSelected }]}>
        <ThemedText type="smallBold">{label}</ThemedText>
      </View>
      <StepButton text="+" onPress={onPlus} />
    </View>
  );
}

function StepButton({ text, onPress }: { text: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.stepButton,
        { backgroundColor: theme.backgroundSelected, opacity: pressed ? 0.6 : 1 },
      ]}>
      <ThemedText style={{ color: theme.accent, fontSize: 20, lineHeight: 22 }}>{text}</ThemedText>
    </Pressable>
  );
}

/** Time picker in 15-minute steps (or `step`). */
export function TimeStepper({
  value,
  onChange,
  step = 15,
}: {
  value: Minutes;
  onChange: (m: Minutes) => void;
  step?: number;
}) {
  return (
    <Stepper
      label={formatMinutes(value)}
      onMinus={() => onChange(wrap(value - step))}
      onPlus={() => onChange(wrap(value + step))}
    />
  );
}

/** Row of choice chips. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.segRow}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            style={[
              styles.seg,
              {
                backgroundColor: selected ? theme.accent : theme.background,
                borderColor: selected ? theme.accent : theme.backgroundSelected,
              },
            ]}>
            <ThemedText type="smallBold" style={{ color: selected ? theme.onAccent : theme.text }}>
              {o.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ActionButton({
  label,
  onPress,
  kind = 'primary',
  disabled,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  const theme = useTheme();
  const bg = kind === 'primary' ? theme.accent : theme.backgroundSelected;
  const fg = kind === 'primary' ? theme.onAccent : kind === 'danger' ? theme.sunAlert : theme.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.7 : 1 },
      ]}>
      <ThemedText type="button" style={{ color: fg }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { gap: Spacing.two },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stepButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  stepValue: {
    minWidth: 110,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  segRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  seg: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: 12, borderWidth: 1 },
  action: {
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: 12,
    alignItems: 'center',
  },
});

/** Multi-select chips. */
export function MultiChips({
  options,
  value,
  onChange,
}: {
  options: readonly string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const theme = useTheme();
  return (
    <View style={chipStyles.row}>
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <Pressable
            key={o}
            onPress={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
            style={[
              chipStyles.chip,
              {
                backgroundColor: on ? theme.accent : theme.background,
                borderColor: on ? theme.accent : theme.backgroundSelected,
              },
            ]}>
            <ThemedText type="small" style={{ color: on ? theme.onAccent : theme.text, fontWeight: '600' }}>
              {o}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Full-screen form sheet with Cancel / title / Save header and a big save button at the bottom. */
export function FormSheet({
  visible,
  title,
  saveLabel = 'Save',
  onSave,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  saveLabel?: string;
  onSave: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: theme.backgroundElement }}>
        <View style={chipStyles.header}>
          <Pressable onPress={onClose} hitSlop={12}>
            <ThemedText style={{ color: theme.accent }}>Cancel</ThemedText>
          </Pressable>
          <ThemedText type="smallBold" numberOfLines={1} style={chipStyles.title}>
            {title}
          </ThemedText>
          <Pressable onPress={onSave} hitSlop={12}>
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              Save
            </ThemedText>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={chipStyles.body} keyboardShouldPersistTaps="handled">
          {children}
          <ActionButton label={saveLabel} onPress={onSave} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Month + year stepper for "YYYY-MM" values. */
export function MonthStepper({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [y, m] = value.split('-').map(Number);
  const shift = (delta: number) => {
    const d = new Date(y, m - 1 + delta, 1);
    const now = new Date();
    if (d.getTime() > new Date(now.getFullYear(), now.getMonth(), 1).getTime()) return;
    onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  return <Stepper label={`${MONTHS[m - 1]} ${y}`} onMinus={() => shift(-1)} onPlus={() => shift(1)} />;
}

const chipStyles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { paddingVertical: Spacing.one + 2, paddingHorizontal: Spacing.three, borderRadius: 999, borderWidth: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  title: { flex: 1, textAlign: 'center' },
  body: { padding: Spacing.three, gap: Spacing.four, paddingBottom: Spacing.six },
});

/** Day stepper for "YYYY-MM-DD" values; can't go past today. Hold-free: ±1 day, ±1 month buttons. */
export function DayStepper({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const shift = (days: number, months = 0) => {
    const [y, m, d] = value.split('-').map(Number);
    const next = new Date(y, m - 1 + months, d + days);
    const today = new Date();
    if (next.getTime() > today.getTime()) return;
    onChange(
      `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`,
    );
  };
  const [y, m, d] = value.split('-').map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <View style={{ gap: Spacing.two }}>
      <Stepper label={label} onMinus={() => shift(-1)} onPlus={() => shift(1)} />
      <View style={{ flexDirection: 'row', gap: Spacing.two }}>
        <ActionButton label="− 1 month" kind="secondary" onPress={() => shift(0, -1)} />
        <ActionButton label="+ 1 month" kind="secondary" onPress={() => shift(0, 1)} />
      </View>
    </View>
  );
}

/** Bottom action sheet: a list of options plus Cancel. Works on iPhone and web. */
export function ActionMenu({
  visible,
  title,
  options,
  onClose,
}: {
  visible: boolean;
  title?: string;
  options: { label: string; onPress: () => void; destructive?: boolean }[];
  onClose: () => void;
}) {
  const theme = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={menuStyles.backdrop} onPress={onClose}>
        <View style={[menuStyles.sheet, { backgroundColor: theme.backgroundElement }]}>
          {title && (
            <ThemedText type="small" themeColor="textSecondary" style={menuStyles.title}>
              {title}
            </ThemedText>
          )}
          {options.map((o) => (
            <Pressable
              key={o.label}
              onPress={() => {
                onClose();
                o.onPress();
              }}
              style={({ pressed }) => [
                menuStyles.option,
                { borderColor: theme.backgroundSelected, opacity: pressed ? 0.6 : 1 },
              ]}>
              <ThemedText style={{ color: o.destructive ? theme.sunAlert : theme.accent }}>{o.label}</ThemedText>
            </Pressable>
          ))}
          <Pressable onPress={onClose} style={[menuStyles.option, menuStyles.cancel, { borderColor: theme.backgroundSelected }]}>
            <ThemedText type="smallBold">Cancel</ThemedText>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const menuStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { paddingBottom: Spacing.five, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  title: { textAlign: 'center', paddingVertical: Spacing.three },
  option: { paddingVertical: Spacing.three, alignItems: 'center', borderTopWidth: 1 },
  cancel: { marginTop: Spacing.two },
});
