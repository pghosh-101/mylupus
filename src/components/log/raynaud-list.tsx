import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { removeRaynaud, type RaynaudEvent } from '@/lib/daily';
import { formatTime } from '@/lib/uv';

/** A day's Raynaud's episodes, each with a Remove button for ones logged by mistake. */
export function RaynaudList({ episodes, onChanged }: { episodes: RaynaudEvent[]; onChanged: () => void }) {
  const theme = useTheme();
  if (episodes.length === 0) return null;

  const remove = (e: RaynaudEvent) => {
    const go = async () => {
      await removeRaynaud(e.at);
      onChanged();
    };
    if (Platform.OS === 'web') return go();
    Alert.alert(`Remove the ${formatTime(new Date(e.at))} episode?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: go },
    ]);
  };

  return (
    <View style={styles.list}>
      {[...episodes]
        .sort((a, b) => a.at - b.at)
        .map((e) => (
          <View key={e.at} style={styles.item}>
            <ThemedText type="small" style={styles.flex}>
              {formatTime(new Date(e.at))}
              {e.tempF !== null ? ` · ${Math.round(e.tempF)}°F outside` : ''}
            </ThemedText>
            <Pressable
              onPress={() => remove(e)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Remove the ${formatTime(new Date(e.at))} Raynaud's episode`}>
              <ThemedText type="small" style={{ color: theme.sunAlert, fontWeight: '600' }}>
                Remove
              </ThemedText>
            </Pressable>
          </View>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  flex: { flex: 1 },
});
