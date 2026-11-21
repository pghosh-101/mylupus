import * as WebBrowser from 'expo-web-browser';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { hasAiKey, aiErrorMessage } from '@/lib/ai';
import { DEMO } from '@/lib/demo';
import { select, tap } from '@/lib/haptics';
import { explainStudy } from '@/lib/learn';

/** Open a link in an in-app browser (a new tab on the web). */
export function openLink(url: string) {
  if (Platform.OS === 'web') return Linking.openURL(url);
  WebBrowser.openBrowserAsync(url, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
  }).catch(() => Linking.openURL(url));
}

/** "Nov 19, 2026" from "2026-11-19". */
export function formatDay(isoDate: string) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d || 1).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** A labeled, horizontally scrolling row of single-choice filter chips. */
export function ChipRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.chipBlock}>
      {label ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.chipLabel}>
          {label}
        </ThemedText>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => {
                select();
                onChange(o.value);
              }}
              style={[
                styles.chip,
                {
                  backgroundColor: on ? theme.accentFill : theme.backgroundElement,
                  borderColor: on ? theme.accentFill : theme.backgroundSelected,
                },
              ]}>
              <ThemedText
                type="small"
                style={{
                  color: on ? theme.onAccent : theme.text,
                  fontWeight: '600',
                }}>
                {o.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** Multi-select chips that wrap onto several lines. */
export function ToggleChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T[];
  onChange: (v: T[]) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <Pressable
            key={o.value}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            onPress={() => {
              select();
              onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value]);
            }}
            style={[
              styles.chip,
              {
                backgroundColor: on ? theme.accentFill : theme.background,
                borderColor: on ? theme.accentFill : theme.backgroundSelected,
              },
            ]}>
            <ThemedText
              type="small"
              style={{
                color: on ? theme.onAccent : theme.text,
                fontWeight: '600',
              }}>
              {on ? '✓ ' : ''}
              {o.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Small rounded button used in headers and on cards. */
export function PillButton({ label, onPress, active }: { label: string; onPress: () => void; active?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: active ? theme.accentFill : theme.backgroundSelected,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <ThemedText
        type="small"
        style={{
          color: active ? theme.onAccent : theme.accent,
          fontWeight: '700',
        }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** One study, news story, trial, or library article. */
export function ItemCard({
  label,
  meta,
  title,
  source,
  detail,
  mentions,
  url,
  saved,
  onToggleSave,
  pmid,
}: {
  label: string;
  /** Right side of the top line, e.g. a date or "5 min read". */
  meta?: string;
  title: string;
  source: string;
  detail?: string;
  mentions?: string[];
  url: string;
  saved: boolean;
  onToggleSave: () => void;
  pmid?: string;
}) {
  const theme = useTheme();
  const [explaining, setExplaining] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [explanation, setExplanation] = useState('');
  const canExplain = Boolean(pmid) && (hasAiKey || DEMO);

  const explain = async () => {
    if (explaining === 'done') return setExplaining('idle');
    setExplaining('loading');
    try {
      setExplanation(await explainStudy(pmid!, title));
      setExplaining('done');
    } catch (e) {
      setExplanation(aiErrorMessage(e));
      setExplaining('error');
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <Pressable
        onPress={() => openLink(url)}
        style={({ pressed }) => [styles.cardBody, { opacity: pressed ? 0.7 : 1 }]}>
        <View style={styles.topLine}>
          <View style={[styles.badge, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type="small" style={{ color: theme.accent, fontWeight: '700', fontSize: 12 }}>
              {label}
            </ThemedText>
          </View>
          {meta ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.meta}>
              {meta}
            </ThemedText>
          ) : null}
        </View>
        <ThemedText type="smallBold" style={styles.title}>
          {title}
        </ThemedText>
        {detail ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>
            {detail}
          </ThemedText>
        ) : null}
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {source}
        </ThemedText>
        {mentions && mentions.length > 0 ? (
          <ThemedText type="small" style={{ color: theme.accent, fontWeight: '600' }}>
            ★ Related to you: {mentions.join(', ')}
          </ThemedText>
        ) : null}
      </Pressable>

      {explaining === 'loading' && (
        <View style={styles.explainRow}>
          <ActivityIndicator size="small" />
          <ThemedText type="small" themeColor="textSecondary">
            Reading the study…
          </ThemedText>
        </View>
      )}
      {(explaining === 'done' || explaining === 'error') && (
        <View style={[styles.explain, { borderColor: theme.backgroundSelected }]}>
          <ThemedText type="small" selectable style={explaining === 'error' ? { color: theme.sunAlert } : undefined}>
            {explanation}
          </ThemedText>
          {explaining === 'done' && (
            <ThemedText type="small" themeColor="textSecondary">
              AI summary of the abstract. It can miss details, so check the study and talk with your doctor.
            </ThemedText>
          )}
        </View>
      )}

      <View style={styles.actions}>
        <PillButton label="Open" onPress={() => openLink(url)} />
        {canExplain && (
          <PillButton label={explaining === 'done' ? 'Hide summary' : 'Explain this study'} onPress={explain} />
        )}
        <PillButton label={saved ? '★ Saved' : '☆ Save'} onPress={onToggleSave} active={saved} />
      </View>
    </View>
  );
}

/** "More filters · Last year · Newest ▾": shows or hides the less-used filters. */
export function FilterToggle({ open, summary, onPress }: { open: boolean; summary: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => {
        select();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      hitSlop={6}
      style={styles.toggle}>
      <ThemedText type="small" style={{ color: theme.accent, fontWeight: '700', flexShrink: 0 }}>
        {open ? 'Fewer filters ▴' : 'More filters ▾'}
      </ThemedText>
      {!open && (
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.toggleSummary}>
          {summary}
        </ThemedText>
      )}
    </Pressable>
  );
}

export function SectionHeading({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeading}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {title.toUpperCase()}
      </ThemedText>
      {action}
    </View>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.notice, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="small" themeColor="textSecondary">
        {children}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  chipBlock: { gap: Spacing.one },
  chipLabel: { fontWeight: '600' },
  chipRow: { gap: Spacing.two, paddingRight: Spacing.three },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    paddingVertical: Spacing.one + 3,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    borderWidth: 1,
  },
  pill: {
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.three - 2,
    borderRadius: 999,
  },
  card: { borderRadius: 18, padding: Spacing.three, gap: Spacing.two },
  cardBody: { gap: Spacing.one + 2 },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  badge: {
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: Spacing.two,
  },
  meta: { flexShrink: 1, textAlign: 'right' },
  title: { fontSize: 16, lineHeight: 22 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  explainRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  explain: { borderTopWidth: 1, paddingTop: Spacing.two, gap: Spacing.two },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
  },
  notice: { borderRadius: 14, padding: Spacing.three },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: 2,
  },
  toggleSummary: { flexShrink: 1 },
});
