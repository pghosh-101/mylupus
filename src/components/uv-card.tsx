import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Card } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  distanceKm,
  getDevicePlace,
  loadSavedPlace,
  savePlace,
  searchCities,
  type CityResult,
  type Place,
} from '@/lib/location';
import { Settings } from '@/lib/settings';
import { fetchUvForecast, formatHour, uvCategory, type UvForecast } from '@/lib/uv';

type State =
  | { status: 'loading'; step: string }
  | { status: 'error'; message: string }
  | { status: 'ready'; forecast: UvForecast; place: Place };

export function UvCard() {
  const theme = useTheme();
  const threshold = Settings.uvThreshold;
  const [state, setState] = useState<State>({ status: 'loading', step: 'Loading…' });
  const [picking, setPicking] = useState(false);

  const showUvFor = useCallback(
    async (place: Place) => {
      const forecast = await fetchUvForecast(place.latitude, place.longitude, threshold);
      setState({ status: 'ready', forecast, place });
    },
    [threshold],
  );

  const load = useCallback(async () => {
    try {
      const saved = await loadSavedPlace();

      if (saved) {
        // Show UV for the last place right away; no waiting on location.
        setState({ status: 'loading', step: "Getting today's UV forecast…" });
        await showUvFor(saved);

        // Then quietly check whether the phone has moved somewhere else.
        if (saved.source === 'device') {
          getDevicePlace(false)
            .then(async (here) => {
              if (distanceKm(saved, here) > 10 || (!saved.name && here.name)) {
                await savePlace(here);
                await showUvFor(here);
              }
            })
            .catch(() => {});
        }
        return;
      }

      // First launch: we need a location before we can show anything.
      setState({ status: 'loading', step: 'Finding your location…' });
      const here = await getDevicePlace(true);
      await savePlace(here);
      setState({ status: 'loading', step: "Getting today's UV forecast…" });
      await showUvFor(here);
    } catch (e) {
      setState({ status: 'error', message: e instanceof Error ? e.message : 'Something went wrong.' });
    }
  }, [showUvFor]);

  useEffect(() => {
    load();
  }, [load]);

  const choosePlace = async (place: Place | 'device') => {
    setPicking(false);
    try {
      setState({
        status: 'loading',
        step: place === 'device' ? 'Finding your location…' : "Getting today's UV forecast…",
      });
      const chosen = place === 'device' ? await getDevicePlace(true) : place;
      await savePlace(chosen);
      await showUvFor(chosen);
    } catch (e) {
      setState({ status: 'error', message: e instanceof Error ? e.message : 'Something went wrong.' });
    }
  };

  if (picking) {
    return (
      <CityPicker
        onPick={(city) => choosePlace(city)}
        onUseDevice={() => choosePlace('device')}
        onCancel={() => setPicking(false)}
      />
    );
  }

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
        <View style={styles.buttonRow}>
          <Button label="Try again" onPress={load} />
          <Button label="Pick a city" onPress={() => setPicking(true)} secondary />
        </View>
      </Card>
    );
  }

  const { forecast, place } = state;
  const needsProtection = forecast.current > threshold;
  const placeLabel = place.name ?? (place.source === 'device' ? 'Your location' : 'Selected city');

  return (
    <Card>
      <View style={styles.headerRow}>
        <Pressable onPress={() => setPicking(true)} hitSlop={12} style={styles.placeButton}>
          <ThemedText type="smallBold" themeColor="textSecondary" numberOfLines={1}>
            UV INDEX · {placeLabel.toUpperCase()}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.accent }}>
            Change
          </ThemedText>
        </Pressable>
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

function CityPicker({
  onPick,
  onUseDevice,
  onCancel,
}: {
  onPick: (city: CityResult) => void;
  onUseDevice: () => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CityResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    if (query.trim().length < 2) return;
    setSearching(true);
    setError(null);
    try {
      setResults(await searchCities(query));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed.');
    } finally {
      setSearching(false);
    }
  };

  return (
    <Card>
      <View style={styles.headerRow}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          CHOOSE A PLACE
        </ThemedText>
        <Pressable onPress={onCancel} hitSlop={12}>
          <ThemedText type="small" style={{ color: theme.accent }}>
            Cancel
          </ThemedText>
        </Pressable>
      </View>

      <Pressable onPress={onUseDevice} style={[styles.option, { backgroundColor: theme.backgroundSelected }]}>
        <ThemedText type="smallBold">Use my current location</ThemedText>
      </Pressable>

      <TextInput
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={search}
        placeholder="Search for a city"
        placeholderTextColor={theme.textSecondary}
        returnKeyType="search"
        autoCorrect={false}
        style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
      />

      {searching && <ActivityIndicator />}
      {error && <ThemedText themeColor="textSecondary">{error}</ThemedText>}
      {results?.length === 0 && <ThemedText themeColor="textSecondary">No cities found.</ThemedText>}
      {results?.map((city) => (
        <Pressable
          key={`${city.latitude},${city.longitude}`}
          onPress={() => onPick(city)}
          style={[styles.option, { backgroundColor: theme.backgroundSelected }]}>
          <ThemedText>{city.label}</ThemedText>
        </Pressable>
      ))}
    </Card>
  );
}

function Button({
  label,
  onPress,
  secondary,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.button, { backgroundColor: secondary ? theme.backgroundSelected : theme.accent }]}>
      <ThemedText type="smallBold" style={{ color: secondary ? theme.text : '#fff' }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  placeButton: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexShrink: 1 },
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
  buttonRow: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  button: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 12,
  },
  option: { padding: Spacing.three, borderRadius: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
  },
});
