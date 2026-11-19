import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Card heading: a small accent-colored icon (iPhone) and an uppercase label, with optional content on the right. */
export function CardHeader({ icon, title, right }: { icon: SFSymbol; title: string; right?: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <SymbolView name={{ ios: icon }} size={15} tintColor={theme.accent} fallback={null} style={styles.icon} />
        <ThemedText type="smallBold" themeColor="textSecondary">
          {title}
        </ThemedText>
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  left: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexShrink: 1 },
  icon: { width: 17, height: 17 },
});
