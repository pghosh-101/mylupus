import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { EveningEntry, Flare, SleepEntry } from '@/lib/daily';
import { parseDate, todayString } from '@/lib/meds';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** 0 good day, 1 mild, 2 moderate, 3 severe; null if no evening check-in. */
export function dayLevel(e: EveningEntry | undefined): number | null {
  if (!e) return null;
  return Math.max(0, ...Object.values(e.symptoms).map((v) => v ?? 0));
}

/** Dates covered by flares that have a known start day. */
export function flareDates(flares: Flare[]): Set<string> {
  const out = new Set<string>();
  for (const f of flares) {
    if (f.start.length < 10) continue; // month-only: can't place on a day
    const start = parseDate(f.start);
    const days = f.ongoing
      ? Math.max(1, Math.round((parseDate(todayString()).getTime() - start.getTime()) / 86400000) + 1)
      : (f.durationDays ?? 1);
    for (let i = 0; i < Math.min(days, 366); i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      out.add(todayString(d));
    }
  }
  return out;
}

/** Month grid colored by how each day went. Tap a day for details. */
export function MonthCalendar({
  sleep,
  evening,
  flares,
  onPickDay,
}: {
  sleep: Record<string, SleepEntry>;
  evening: Record<string, EveningEntry>;
  flares: Flare[];
  onPickDay: (date: string) => void;
}) {
  const theme = useTheme();
  const now = new Date();
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const today = todayString();
  const flareDays = flareDates(flares);

  // Day colors: green for good days, shading to orange as symptoms get worse.
  const LEVEL_COLORS = [theme.accent, `${theme.accent}66`, `${theme.sunAlert}88`, theme.sunAlert];
  const LEVEL_NAMES = ['Good', 'Mild', 'Moderate', 'Severe'];

  const year = month.getFullYear();
  const m = month.getMonth();
  const firstWeekday = new Date(year, m, 1).getDay();
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const isCurrentMonth = year === now.getFullYear() && m === now.getMonth();

  const shift = (delta: number) => setMonth(new Date(year, m + delta, 1));

  return (
    <Card>
      <View style={styles.header}>
        <Pressable onPress={() => shift(-1)} hitSlop={10} style={[styles.arrow, { backgroundColor: theme.backgroundSelected }]}>
          <ThemedText style={{ color: theme.accent }}>‹</ThemedText>
        </Pressable>
        <ThemedText type="smallBold">
          {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </ThemedText>
        <Pressable
          onPress={() => !isCurrentMonth && shift(1)}
          hitSlop={10}
          style={[styles.arrow, { backgroundColor: theme.backgroundSelected, opacity: isCurrentMonth ? 0.3 : 1 }]}>
          <ThemedText style={{ color: theme.accent }}>›</ThemedText>
        </Pressable>
      </View>

      <View style={styles.grid}>
        {WEEKDAYS.map((d, i) => (
          <View key={`h${i}`} style={styles.cell}>
            <ThemedText type="small" themeColor="textSecondary">
              {d}
            </ThemedText>
          </View>
        ))}
        {cells.map((day, i) => {
          if (!day) return <View key={`e${i}`} style={styles.cell} />;
          const date = `${year}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const level = dayLevel(evening[date]);
          const logged = level !== null || Boolean(sleep[date]);
          const future = date > today;
          const fill = level !== null ? LEVEL_COLORS[level] : logged ? theme.backgroundSelected : 'transparent';
          const darkText = level === 0 || level === 3;
          return (
            <View key={date} style={styles.cell}>
              <Pressable
                disabled={future}
                onPress={() => onPickDay(date)}
                accessibilityLabel={`${date}${level !== null ? `, ${LEVEL_NAMES[level]}` : logged ? ', logged' : ''}${flareDays.has(date) ? ', flare' : ''}`}
                style={({ pressed }) => [
                  styles.day,
                  {
                    backgroundColor: fill,
                    borderColor: date === today ? theme.text : 'transparent',
                    opacity: future ? 0.3 : pressed ? 0.6 : 1,
                  },
                ]}>
                <ThemedText type="small" style={{ color: darkText ? theme.onAccent : theme.text, fontWeight: '600' }}>
                  {day}
                </ThemedText>
                {flareDays.has(date) && <View style={[styles.flareDot, { backgroundColor: theme.sunAlert, borderColor: theme.backgroundElement }]} />}
              </Pressable>
            </View>
          );
        })}
      </View>

      <View style={styles.legend}>
        {LEVEL_NAMES.map((name, i) => (
          <View key={name} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: LEVEL_COLORS[i] }]} />
            <ThemedText type="small" themeColor="textSecondary">
              {name}
            </ThemedText>
          </View>
        ))}
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: theme.sunAlert }]} />
          <ThemedText type="small" themeColor="textSecondary">
            Flare
          </ThemedText>
        </View>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        Colors come from your evening check-in (your worst symptom that day). Tap a day to see it or fill it in.
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 3, alignItems: 'center', justifyContent: 'center' },
  day: { flex: 1, alignSelf: 'stretch', borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  flareDot: { position: 'absolute', top: 2, right: 2, width: 9, height: 9, borderRadius: 5, borderWidth: 1.5 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, marginTop: Spacing.one },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  swatch: { width: 14, height: 14, borderRadius: 4 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
});
