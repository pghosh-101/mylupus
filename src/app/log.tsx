import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CardHeader } from '@/components/card-header';
import { CheckinCard } from '@/components/log/checkin-cards';
import { DaySheet } from '@/components/log/day-sheet';
import { flareDates, MonthCalendar } from '@/components/log/month-calendar';
import { HistoryEditor, type HistoryEditing } from '@/components/log/history-editor';
import { flareWhen, HistoryTimeline, SEVERITY_LABEL, formatStart } from '@/components/log/history-timeline';
import { ActionButton } from '@/components/meds/controls';
import { Card, Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  EMPTY_HISTORY,
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

export default function LogScreen() {
  const theme = useTheme();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [flares, setFlares] = useState<Flare[]>([]);
  const [history, setHistory] = useState<MedicalHistory>(EMPTY_HISTORY);
  const [sleep, setSleep] = useState<Record<string, SleepEntry>>({});
  const [evening, setEvening] = useState<Record<string, EveningEntry>>({});
  const [editing, setEditing] = useState<HistoryEditing | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [pickedDay, setPickedDay] = useState<string | null>(null);

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
    setEditing(null);
    setFlares(next);
    await saveFlares(next);
  };
  const deleteFlare = async (id: string) => {
    const next = flares.filter((f) => f.id !== id);
    setEditing(null);
    setFlares(next);
    await saveFlares(next);
  };
  const saveBackground = async (h: MedicalHistory) => {
    setEditing(null);
    setHistory(h);
    await saveHistory(h);
  };

  const ongoing = flares.filter((f) => f.ongoing).sort((a, b) => b.start.localeCompare(a.start));
  const past = flares.filter((f) => !f.ongoing).sort((a, b) => b.start.localeCompare(a.start));
  const summary = [
    flares.length ? `${flares.length} flare${flares.length === 1 ? '' : 's'} logged` : '',
    past[0] ? `last one ${formatStart(past[0].start)}` : '',
    history.diagnosed ? `diagnosed ${formatStart(history.diagnosed)}` : '',
  ].filter(Boolean);

  return (
    <Screen title="Daily log">
      <CheckinCard onSaved={reload} />

      <MonthCalendar sleep={sleep} evening={evening} flares={flares} onPickDay={setPickedDay} />

      <InsightsCard insights={insights} />

      <Card>
        <CardHeader icon="clock.arrow.circlepath" title="MY HISTORY" />
        {ongoing.map((f) => (
          <Pressable
            key={f.id}
            onPress={() => setEditing({ kind: 'flare', flare: f })}
            style={[styles.ongoing, { borderColor: theme.sunAlert }]}>
            <View style={styles.flex}>
              <ThemedText type="smallBold" style={{ color: theme.sunAlert }}>
                Ongoing flare · {SEVERITY_LABEL[f.severity]}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {flareWhen(f)}
                {f.symptoms.length ? ` · ${f.symptoms.slice(0, 3).join(', ')}` : ''}
              </ThemedText>
            </View>
            <ThemedText type="small" style={{ color: theme.accent }}>
              Update
            </ThemedText>
          </Pressable>
        ))}
        <ThemedText type="small" themeColor="textSecondary">
          {summary.length
            ? `${summary.join(' · ').replace(/^./, (c) => c.toUpperCase())}.`
            : 'Log flares (now or in the past) and your health background. They show up in a timeline, and the assistant uses them to spot patterns.'}
        </ThemedText>
        <View style={styles.buttons}>
          <View style={styles.flex}>
            <ActionButton label="Update history" onPress={() => setEditing({ kind: 'new' })} />
          </View>
          <View style={styles.flex}>
            <ActionButton label="View history" kind="secondary" onPress={() => setTimelineOpen(true)} />
          </View>
        </View>
      </Card>

      <HistoryEditor
        editing={editing}
        history={history}
        onSaveFlare={saveFlare}
        onDeleteFlare={deleteFlare}
        onSaveHistory={saveBackground}
        onClose={() => setEditing(null)}
      />
      <HistoryTimeline
        visible={timelineOpen}
        flares={flares}
        history={history}
        onSaveFlare={saveFlare}
        onDeleteFlare={deleteFlare}
        onSaveHistory={saveBackground}
        onClose={() => setTimelineOpen(false)}
      />
      <DaySheet
        date={pickedDay}
        sleep={pickedDay ? sleep[pickedDay] : undefined}
        evening={pickedDay ? evening[pickedDay] : undefined}
        inFlare={pickedDay ? flareDates(flares).has(pickedDay) : false}
        onChanged={reload}
        onClose={() => setPickedDay(null)}
      />
    </Screen>
  );
}

function InsightsCard({ insights }: { insights: Insight[] }) {
  const theme = useTheme();
  const color = { focus: theme.sunAlert, good: theme.accent, info: theme.textSecondary };
  return (
    <Card>
      <CardHeader icon="sparkles" title="THIS WEEK" />
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

const styles = StyleSheet.create({
  ongoing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderLeftWidth: 3,
    paddingLeft: Spacing.three,
    paddingVertical: Spacing.one,
  },
  buttons: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1, gap: Spacing.half },
  insight: { borderLeftWidth: 3, paddingLeft: Spacing.three, gap: Spacing.half },
  footnote: { marginTop: Spacing.one },
});
