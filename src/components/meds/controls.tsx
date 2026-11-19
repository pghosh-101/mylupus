import type { ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

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
            <ThemedText type="smallBold" style={{ color: selected ? '#fff' : theme.text }}>
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
  const fg = kind === 'primary' ? '#fff' : kind === 'danger' ? theme.sunAlert : theme.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.7 : 1 },
      ]}>
      <ThemedText type="smallBold" style={{ color: fg }}>
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
