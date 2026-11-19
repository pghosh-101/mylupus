import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Place } from '@/lib/location';
import {
  applySunscreen,
  backInside,
  loadSunscreenState,
  REAPPLY_MS,
  type SunscreenState,
} from '@/lib/sunscreen';
import { formatTime } from '@/lib/uv';

/** "I put on sunscreen" / "I'm back inside" controls inside the UV card. */
export function SunscreenRow({ place, needsProtection }: { place: Place; needsProtection: boolean }) {
  const theme = useTheme();
  const [state, setState] = useState<SunscreenState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Ignore state saved by an older version of the app.
    loadSunscreenState().then((s) => setState(s && 'notified' in s ? s : null));
  }, []);

  const apply = useCallback(async () => {
    setBusy(true);
    try {
      const result = await applySunscreen(place);
      setState(result.state);
      setMessage(result.message);
    } finally {
      setBusy(false);
    }
  }, [place]);

  const inside = useCallback(async () => {
    await backInside();
    setState(null);
    setMessage('Welcome back. Reminder cancelled.');
  }, []);

  // An outing is "active" until 2 hours after the last application.
  const active = state && Date.now() < state.appliedAt + REAPPLY_MS;

  return (
    <View style={[styles.box, { borderColor: theme.backgroundSelected }]}>
      {active ? (
        <>
          <ThemedText type="smallBold">
            Sunscreen on at {formatTime(new Date(state.appliedAt))}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {state.reapplyAt === null
              ? 'No need to reapply: UV will be within your limit by then.'
              : state.notified
                ? `Reminder set for ${formatTime(new Date(state.reapplyAt))}.`
                : `Reapply around ${formatTime(new Date(state.reapplyAt))}.`}
          </ThemedText>
          <View style={styles.row}>
            <Button label="I reapplied" onPress={apply} disabled={busy} primary />
            <Button label="I'm back inside" onPress={inside} disabled={busy} />
          </View>
        </>
      ) : (
        <>
          {state && (
            <ThemedText type="small" themeColor="textSecondary">
              Last applied at {formatTime(new Date(state.appliedAt))}.
            </ThemedText>
          )}
          <View style={styles.row}>
            <Button
              label="I put on sunscreen"
              onPress={apply}
              disabled={busy}
              primary={needsProtection}
            />
          </View>
        </>
      )}
      {message && (
        <ThemedText type="small" themeColor="textSecondary">
          {message}
        </ThemedText>
      )}
    </View>
  );
}

function Button({
  label,
  onPress,
  primary,
  disabled,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: primary ? theme.accent : theme.backgroundSelected,
          opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
        },
      ]}>
      <ThemedText type="button" style={{ color: primary ? theme.onAccent : theme.accent }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { borderTopWidth: 1, paddingTop: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  button: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: 12 },
});
