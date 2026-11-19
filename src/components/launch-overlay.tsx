import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { HeadingFont, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { randomEncouragement } from '@/lib/encouragement';

/** How long the message stays before fading, in ms. Long enough to read a short line. */
const HOLD_MS = 2200;
const FADE_MS = 450;

/** Launch screen: the MyLupus name and a short encouraging message, then a fade into the app. */
export function LaunchOverlay() {
  const theme = useTheme();
  const [message] = useState(randomEncouragement);
  const [visible, setVisible] = useState(true);
  const opacity = useRef(new Animated.Value(1)).current;
  const textIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(textIn, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    const t = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() => setVisible(false));
    }, HOLD_MS);
    return () => clearTimeout(t);
  }, [opacity, textIn]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.overlay, { backgroundColor: theme.background, opacity }]}
      onLayout={() => SplashScreen.hideAsync().catch(() => {})}>
      <Animated.View
        style={[
          styles.content,
          { opacity: textIn, transform: [{ translateY: textIn.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] },
        ]}>
        <View style={styles.brandRow}>
          <View style={[styles.dot, { backgroundColor: theme.accent }]} />
          <ThemedText style={styles.brand}>MyLupus</ThemedText>
        </View>
        <ThemedText style={[styles.message, { color: theme.textSecondary }]}>{message}</ThemedText>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, alignItems: 'center', justifyContent: 'center' },
  content: { alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.five, maxWidth: 420 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 12, height: 12, borderRadius: 6 },
  brand: { fontSize: 30, lineHeight: 38, fontFamily: HeadingFont.bold, letterSpacing: -0.5 },
  message: { fontSize: 17, lineHeight: 25, textAlign: 'center' },
});
