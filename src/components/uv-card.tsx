import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Settings } from '@/lib/settings';
import { fetchUvForecast, formatHour, uvCategory, type UvForecast } from '@/lib/uv';

type State =
  | { status: 'loading'; step: string }
  | { status: 'error'; message: string }
  | { status: 'ready'; forecast: UvForecast; place: string | null };

/** Rejects with `message` if `promise` takes longer than `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Fast path: a recent cached position. Otherwise ask the GPS, with a time limit. */
async function getPosition() {
  const cached = await Location.getLastKnownPositionAsync({ maxAge: 30 * 60 * 1000 });
  if (cached) return cached.coords;
  const fresh = await withTimeout(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
    15000,
    "Couldn't find your location in time. Check that Location Services are on, then try again.",
  );
  return fresh.coords;
}

export function UvCard() {
  const theme = useTheme();
  const threshold = Settings.uvThreshold;
  const [state, setState] = useState<State>({ status: 'loading', step: 'Starting…' });

  const load = useCallback(async () => {
    try {
      setState({ status: 'loading', step: 'Checking location permission…' });
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setState({
          status: 'error',
          message:
            'MyLupus needs your location to look up the UV index where you are. Turn it on in Settings > Privacy & Security > Location Services > Expo Go.',
        });
        return;
      }

      setState({ status: 'loading', step: 'Finding your location…' });
      const { latitude, longitude } = await getPosition();

      setState({ status: 'loading', step: "Getting today's UV forecast…" });
      const forecast = await fetchUvForecast(latitude, longitude, threshold);
      setState({ status: 'ready', forecast, place: null });

      // Place name is a nice-to-have: look it up after the UV is already showing.
      withTimeout(Location.reverseGeocodeAsync({ latitude, longitude }), 5000, 'timeout')
        .then(([addr]) => {
          const place = addr?.city ?? addr?.region ?? null;
          if (place) setState((s) => (s.status === 'ready' ? { ...s, place } : s));
        })
        .catch(() => {});
    } catch (e) {
      setState({ status: 'error', message: e instanceof Error ? e.message : 'Something went wrong.' });
    }
  }, [threshold]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === 'loading') {
    return (
      <Card>
        <ActivityIndicator />
        <ThemedText themeColor="textSecondary" style={styles.center}>
          {state.step}
        </ThemedText>
      </Card>
    );
  }

  if (state.status === 'error') {
    return (
      <Card>
        <ThemedText type="smallBold">Couldn&apos;t load UV</ThemedText>
        <ThemedText themeColor="textSecondary">{state.message}</ThemedText>
        <RetryButton onPress={load} />
      </Card>
    );
  }

  const { forecast, place } = state;
  const needsProtection = forecast.current > threshold;

  return (
    <Card>
      <View style={styles.headerRow}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          UV INDEX{place ? ` · ${place.toUpperCase()}` : ''}
        </ThemedText>
        <Pressable onPress={load} hitSlop={12}>
          <ThemedText type="small" style={{ color: theme.accent }}>
            Refresh
          </ThemedText>
        </Pressable>
      </View>

      <View style={styles.nowRow}>
        <ThemedText style={[styles.bigNumber, { color: needsProtection ? theme.sunAlert : theme.text }]}>
          {forecast.current.toFixed(1)}
        </ThemedText>
        <View style={styles.nowText}>
          <ThemedText type="smallBold">
            {needsProtection ? 'Above your limit right now' : 'Within your limit right now'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {needsProtection
              ? 'Sunscreen, hat, and shade before heading out.'
              : `At or below your limit of ${threshold}.`}{' '}
            ({uvCategory(forecast.current)} on the standard UV scale.)
          </ThemedText>
        </View>
      </View>

      <ThemedText>
        {forecast.window
          ? `UV is above ${threshold} from about ${formatHour(forecast.window.start)} to ${formatHour(
              forecast.window.end,
            )} today. Peak ${forecast.max.toFixed(1)} at ${formatHour(forecast.peakHour)}.`
          : `UV stays at or below ${threshold} all day (peak ${forecast.max.toFixed(1)}). Clouds don't block all UV, though.`}
      </ThemedText>

      <UvChart forecast={forecast} threshold={threshold} />
    </Card>
  );
}

/** Hourly UV bars, 6 AM to 8 PM. Bars above your limit are highlighted. */
function UvChart({ forecast, threshold }: { forecast: UvForecast; threshold: number }) {
  const theme = useTheme();
  const hours = forecast.hours.filter((h) => h.hour >= 6 && h.hour <= 20);
  const scaleMax = Math.max(forecast.max, threshold + 1, 4);
  const chartHeight = 96;
  const thresholdY = (threshold / scaleMax) * chartHeight;

  return (
    <View
      accessible
      accessibilityLabel={`Hourly UV chart. Peak ${forecast.max.toFixed(1)} at ${formatHour(forecast.peakHour)}.`}>
      <View style={[styles.chart, { height: chartHeight }]}>
        <View
          style={[styles.thresholdLine, { bottom: thresholdY, borderColor: theme.textSecondary }]}
        />
        {hours.map((h) => (
          <View key={h.hour} style={styles.barSlot}>
            <View
              style={[
                styles.bar,
                {
                  height: Math.max(2, (h.uv / scaleMax) * chartHeight),
                  backgroundColor: h.uv > threshold ? theme.sunAlert : theme.sunCalm,
                  opacity: h.hour === forecast.nowHour ? 1 : 0.85,
                },
                h.hour === forecast.nowHour && { borderWidth: 2, borderColor: theme.text },
              ]}
            />
          </View>
        ))}
      </View>
      <View style={styles.axisRow}>
        {[6, 10, 14, 18].map((hr) => (
          <ThemedText key={hr} type="small" themeColor="textSecondary">
            {formatHour(hr)}
          </ThemedText>
        ))}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        Dashed line = your limit ({threshold}). Outlined bar = now.
      </ThemedText>
    </View>
  );
}

function RetryButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.button, { backgroundColor: theme.accent }]}>
      <ThemedText type="smallBold" style={{ color: '#fff' }}>
        Try again
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  bigNumber: { fontSize: 56, lineHeight: 64, fontWeight: '700' },
  nowText: { flex: 1, gap: Spacing.half },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, marginTop: Spacing.two },
  thresholdLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
  },
  barSlot: { flex: 1, justifyContent: 'flex-end' },
  bar: { borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.one },
  button: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 12,
  },
});
