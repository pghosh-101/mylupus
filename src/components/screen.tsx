import type { ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Standard scrollable page with a large title. */
export function Screen({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.inner}>
          <View>
            {subtitle ? (
              <ThemedText type="small" themeColor="textSecondary">
                {subtitle}
              </ThemedText>
            ) : null}
            <ThemedText type="subtitle">{title}</ThemedText>
          </View>
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Rounded content card. */
export function Card({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>{children}</View>;
}

/** Placeholder for features coming in a later phase. */
export function ComingSoon({ phase, items }: { phase: string; items: string[] }) {
  return (
    <Card>
      <ThemedText type="smallBold" themeColor="textSecondary">
        COMING IN {phase.toUpperCase()}
      </ThemedText>
      {items.map((item) => (
        <ThemedText key={item}>• {item}</ThemedText>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    paddingHorizontal: Spacing.three,
    // The web tab bar floats over the top of the page.
    paddingTop: Platform.OS === 'web' ? 80 : Spacing.three,
    paddingBottom: BottomTabInset + Spacing.five,
    alignItems: 'center',
  },
  inner: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three },
  card: { borderRadius: 20, padding: Spacing.three, gap: Spacing.two },
});
