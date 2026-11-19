import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CheckinCard } from '@/components/log/checkin-cards';
import { FlareForm } from '@/components/log/flare-form';
import { HistoryForm } from '@/components/log/history-form';
import { ActionButton } from '@/components/meds/controls';
import { Card, Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  EMPTY_HISTORY,
  lastDates,
  loadEvening,
  loadFlares,
  loadHistory,
  loadSleep,
  saveFlares,
  saveHistory,
  weeklyInsights,
  type EveningEntry,
  type Flare,
  type Insight,
  type MedicalHistory,
  type SleepEntry,
} from '@/lib/daily';
import { parseDate } from '@/lib/meds';

const SEVERITY = ['', 'Mild', 'Moderate', 'Severe'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function flareDate(start: string) {
  const [y, m, d] = start.split('-').map(Number);
  return d ? `${MONTHS[m - 1]} ${d}, ${y}` : `${MONTHS[m - 1]} ${y}`;
}

export default function LogScreen() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [flares, setFlares] = useState<Flare[]>([]);
  const [history, setHistory] = useState<MedicalHistory>(EMPTY_HISTORY);
  const [sleep, setSleep] = useState<Record<string, SleepEntry>>({});
  const [evening, setEvening] = useState<Record<string, EveningEntry>>({});
  const [editingFlare, setEditingFlare] = useState<Flare | 'new' | null>(null);
  const [editingHistory, setEditingHistory] = useState(false);

  const reload = useCallback(async () => {
    const [i, f, h, s, e] = await Promise.all([
      weeklyInsights(),
      loadFlares(),
      loadHistory(),
      loadSleep(),
      loadEvening(),
    ]);
    setInsights(i);
    setFlares(f);
    setHistory(h);
    setSleep(s);
    setEvening(e);
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const saveFlare = async (flare: Flare) => {
    const next = flares.some((f) => f.id === flare.id)
      ? flares.map((f) => (f.id === flare.id ? flare : f))
      : [...flares, flare];
    setEditingFlare(null);
    setFlares(next);
    await saveFlares(next);
  };

  const sortedFlares = [...flares].sort((a, b) => b.start.localeCompare(a.start));
  const historyFilled = Object.values(history).some(Boolean);

  return (
    <Screen title="Daily log">
      <CheckinCard onSaved={reload} />

      <InsightsCard insights={insights} />

      <Card>
        <ThemedText type="smallBold" themeColor="textSecondary">
          FLARES
        </ThemedText>
        {sortedFlares.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            Log current flares as they happen, and add past ones to give the patterns more history.
          </ThemedText>
        )}
        {sortedFlares.map((f) => (
          <FlareRow key={f.id} flare={f} onPress={() => setEditingFlare(f)} />
        ))}
        <ActionButton label="Log a flare" onPress={() => setEditingFlare('new')} />
      </Card>

      <RecentDays sleep={sleep} evening={evening} flares={flares} />

      <Card>
        <ThemedText type="smallBold" themeColor="textSecondary">
          MY HISTORY
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {historyFilled
            ? 'Diagnosis, past medications, and other notes saved.'
            : 'Add your diagnosis date, past medications, and other notes. The AI assistant will use these later.'}
        </ThemedText>
        <ActionButton label={historyFilled ? 'Edit history' : 'Add history'} kind="secondary" onPress={() => setEditingHistory(true)} />
      </Card>

      <FlareForm
        visible={editingFlare !== null}
        flare={editingFlare === 'new' ? null : editingFlare}
        onSave={saveFlare}
        onDelete={async (id) => {
          const next = flares.filter((f) => f.id !== id);
          setEditingFlare(null);
          setFlares(next);
          await saveFlares(next);
        }}
        onClose={() => setEditingFlare(null)}
      />
      <HistoryForm
        visible={editingHistory}
        history={history}
        onClose={() => setEditingHistory(false)}
        onSave={async (h) => {
          setEditingHistory(false);
          setHistory(h);
          await saveHistory(h);
        }}
      />
    </Screen>
  );
}

function InsightsCard({ insights }: { insights: Insight[] }) {
  const theme = useTheme();
  const color = { focus: theme.sunAlert, good: theme.accent, info: theme.textSecondary };
  return (
    <Card>
      <ThemedText type="smallBold" themeColor="textSecondary">
        THIS WEEK
      </ThemedText>
      {insights.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Patterns show up here after a few days of check-ins.
        </ThemedText>
      ) : (
        insights.map((i) => (
          <View key={i.title} style={[styles.insight, { borderLeftColor: color[i.tone] }]}>
            <ThemedText type="smallBold">{i.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {i.detail}
            </ThemedText>
          </View>
        ))
      )}
      <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
        Patterns, not a diagnosis. Bring anything that concerns you to your care team.
      </ThemedText>
    </Card>
  );
}

function FlareRow({ flare, onPress }: { flare: Flare; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.row, { borderColor: theme.backgroundSelected }]}>
      <View style={styles.flex}>
        <ThemedText type="smallBold">
          {flareDate(flare.start)} · {SEVERITY[flare.severity]}
        </ThemedText>
        <ThemedText type="small" style={{ color: flare.ongoing ? theme.sunAlert : theme.textSecondary }}>
          {flare.ongoing ? 'Ongoing' : flare.durationDays ? `Lasted ${flare.durationDays} days` : 'Ended'}
          {flare.symptoms.length ? ` · ${flare.symptoms.slice(0, 3).join(', ')}` : ''}
        </ThemedText>
      </View>
      <ThemedText type="small" style={{ color: theme.accent }}>
        Edit
      </ThemedText>
    </Pressable>
  );
}

/** One line per day for the last two weeks. */
function RecentDays({
  sleep,
  evening,
  flares,
}: {
  sleep: Record<string, SleepEntry>;
  evening: Record<string, EveningEntry>;
  flares: Flare[];
}) {
  const theme = useTheme();
  const days = lastDates(14).reverse();
  if (!days.some((d) => sleep[d] || evening[d])) return null;

  const inFlare = (date: string) =>
    flares.some((f) => {
      if (f.start.length < 10) return false;
      const start = parseDate(f.start).getTime();
      const end = f.ongoing ? Date.now() : start + ((f.durationDays ?? 1) - 1) * 86400000;
      const t = parseDate(date).getTime();
      return t >= start && t <= end;
    });

  return (
    <Card>
      <ThemedText type="smallBold" themeColor="textSecondary">
        LAST 2 WEEKS
      </ThemedText>
      {days.map((d) => {
        const s = sleep[d];
        const e = evening[d];
        if (!s && !e) return null;
        const notable = e
          ? Object.entries(e.symptoms)
              .filter(([, v]) => (v ?? 0) >= 2)
              .map(([k]) => k)
          : [];
        const label = parseDate(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        return (
          <View key={d} style={[styles.row, { borderColor: theme.backgroundSelected }]}>
            <View style={styles.flex}>
              <ThemedText type="smallBold">
                {label}
                {inFlare(d) ? ' · Flare' : ''}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {[
                  s ? `${s.hours}h sleep` : null,
                  e ? `stress ${['none', 'mild', 'mod', 'severe'][e.stress]}` : null,
                  e ? `${e.homeMeals} home / ${e.outMeals} out` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </ThemedText>
              {notable.length > 0 && (
                <ThemedText type="small" style={{ color: theme.sunAlert }}>
                  {notable.join(', ')}
                </ThemedText>
              )}
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderTopWidth: 1, paddingTop: Spacing.two },
  flex: { flex: 1, gap: Spacing.half },
  insight: { borderLeftWidth: 3, paddingLeft: Spacing.three, gap: Spacing.half },
  footnote: { marginTop: Spacing.one },
});
