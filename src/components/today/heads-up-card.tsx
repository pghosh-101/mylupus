import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CardHeader } from '@/components/card-header';
import { Card } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { loadFlares } from '@/lib/daily';
import { byTest, displayStatus, labName, loadLabNames, loadLabs, loadTestNotes, rangeLabel } from '@/lib/labs';
import { formatDate, loadMeds, shortName, supplyInfo } from '@/lib/meds';

type Item = { key: string; title: string; detail: string; route: '/meds' | '/labs' | '/log' };

/** Things that need attention: refills, ongoing flares, labs out of range. Hidden when there's nothing. */
export function HeadsUpCard() {
  const theme = useTheme();
  const [items, setItems] = useState<Item[]>([]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [meds, flares, labs, notes] = await Promise.all([loadMeds(), loadFlares(), loadLabs(), loadTestNotes()]);
        await loadLabNames();
        const out: Item[] = [];

        for (const m of meds) {
          const s = supplyInfo(m);
          if (s && s.daysLeft <= 7) {
            out.push({
              key: `refill-${m.id}`,
              title: `${shortName(m.name)} refill`,
              detail: s.daysLeft <= 0 ? 'May have run out. Order a refill.' : `About ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'} left (runs out ${formatDate(s.runOut)}).`,
              route: '/meds',
            });
          }
        }

        for (const f of flares.filter((f) => f.ongoing)) {
          out.push({
            key: `flare-${f.id}`,
            title: 'Flare in progress',
            detail: `Logged as ${['', 'mild', 'moderate', 'severe'][f.severity]}. Mark it ended in the Log tab when it's over.`,
            route: '/log',
          });
        }

        for (const [test, results] of byTest(labs)) {
          const status = displayStatus(results, notes[test]);
          if (status.tone !== 'alert') continue;
          const latest = results[results.length - 1];
          out.push({
            key: `lab-${test}`,
            title: labName(test),
            detail: status.worsening ? status.trend : `${rangeLabel(latest)} on your latest test.`,
            route: '/labs',
          });
        }
        setItems(out);
      })();
    }, []),
  );

  if (!items.length) return null;

  return (
    <Card>
      <CardHeader icon="exclamationmark.circle.fill" title="HEADS UP" />
      {items.map((i) => (
        <Pressable
          key={i.key}
          onPress={() => router.navigate(i.route)}
          style={({ pressed }) => [styles.row, { borderColor: theme.backgroundSelected, opacity: pressed ? 0.6 : 1 }]}>
          <View style={[styles.bar, { backgroundColor: theme.sunAlert }]} />
          <View style={styles.flex}>
            <ThemedText type="smallBold">{i.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {i.detail}
            </ThemedText>
          </View>
          <ThemedText themeColor="textSecondary">›</ThemedText>
        </Pressable>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderTopWidth: 1, paddingTop: Spacing.two },
  bar: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  flex: { flex: 1, gap: 2 },
});
