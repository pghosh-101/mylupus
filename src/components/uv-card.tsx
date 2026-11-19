import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { tap } from '@/lib/haptics';
import { CardHeader } from '@/components/card-header';
import { Card } from '@/components/screen';
import { SunscreenRow } from '@/components/sunscreen-row';
import { ThemedText } from '@/components/themed-text';
import { HeadingFont, Spacing } from '@/constants/theme';
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
import { recordTodayWeather } from '@/lib/daily';
import { scheduleMorningAlerts } from '@/lib/notifications';
import { Settings } from '@/lib/settings';
import {
  fetchCurrentUv,
  fetchUvForecast,
  formatHour,
  formatTime,
  hasWeatherApiKey,
  uvCategory,
  type CurrentUv,
  type UvForecast,
} from '@/lib/uv';

/** How often to refresh the reading while the app is open. */
const REFRESH_MS = 15 * 60 * 1000;

type State =
  | { status: 'loading'; step: string }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      now: CurrentUv;
      /** Today's hourly forecast, if Open-Meteo answered. */
      forecast: UvForecast | null;
      /** Set when the live source failed and we fell back to the forecast. */
      fallbackReason: string | null;
      place: Place;
    };

export function UvCard() {
  const theme = useTheme();
  const threshold = Settings.uvThreshold;
  const [state, setState] = useState<State>({ status: 'loading', step: 'Loading…' });
  const [picking, setPicking] = useState(false);
  const [showForecast, setShowForecast] = useState(false);
  const placeRef = useRef<Place | null>(null);

  const showUvFor = useCallback(
    async (place: Place) => {
      placeRef.current = place;
      const [live, daily] = await Promise.allSettled([
        hasWeatherApiKey
          ? fetchCurrentUv(place.latitude, place.longitude)
          : Promise.reject(new Error('no key')),
        fetchUvForecast(place.latitude, place.longitude, threshold),
      ]);
      const forecast = daily.status === 'fulfilled' ? daily.value : null;
      // Keep the next few morning notifications up to date (at most once an hour).
      scheduleMorningAlerts(place).catch(() => {});
      // Save today's weather for pattern-finding (at most once an hour).
      recordTodayWeather(place);

      if (live.status === 'fulfilled') {
        setState({ status: 'ready', now: live.value, forecast, place, fallbackReason: null });
        return;
      }
      if (!forecast) throw daily.status === 'rejected' ? daily.reason : live.reason;

      setState({
        status: 'ready',
        now: { uv: forecast.current, source: 'Open-Meteo forecast', updatedAt: new Date(), condition: null },
        forecast,
        place,
        fallbackReason: hasWeatherApiKey
          ? live.reason instanceof Error
            ? live.reason.message
            : 'WeatherAPI.com is unavailable.'
          : null,
      });
    },
    [threshold],
  );

  /** Re-check UV for the current place without showing a loading screen. */
  const refreshQuietly = useCallback(() => {
    if (placeRef.current) showUvFor(placeRef.current).catch(() => {});
  }, [showUvFor]);

  // Keep the reading fresh: every 15 minutes, and whenever you come back to the app.
  useEffect(() => {
    const timer = setInterval(refreshQuietly, REFRESH_MS);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') refreshQuietly();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [refreshQuietly]);

  const load = useCallback(async () => {
    try {
      const saved = await loadSavedPlace();

      if (saved) {
        // Show UV for the last place right away; no waiting on location.
        setState({ status: 'loading', step: 'Checking the UV right now…' });
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
      setState({ status: 'loading', step: 'Checking the UV right now…' });
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
        step: place === 'device' ? 'Finding your location…' : 'Checking the UV right now…',
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

  const { now, forecast, place, fallbackReason } = state;
  const needsProtection = now.uv > threshold;
  const placeLabel = place.name ?? (place.source === 'device' ? 'Your location' : 'Selected city');
  const sourceLine = [`Updated ${formatTime(now.updatedAt)}`, now.source, now.condition]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card>
      <View style={styles.headerRow}>
        <View style={styles.placeName}>
          <CardHeader icon="sun.max.fill" title="UV RIGHT NOW" />
        </View>
        <View style={styles.pillRow}>
          <Pill label="Change" onPress={() => setPicking(true)} />
          <Pill label="Refresh" onPress={load} />
        </View>
      </View>
      {/* The place gets its own full-width line so long city names are never cut off. */}
      <ThemedText type="smallBold">{placeLabel}</ThemedText>

      <View style={styles.nowRow}>
        <ThemedText style={[styles.bigNumber, { color: needsProtection ? theme.sunAlert : theme.text }]}>
          {now.uv.toFixed(1)}
        </ThemedText>
        <View style={styles.nowText}>
          <ThemedText type="smallBold">
            {needsProtection ? 'Above your limit' : 'Within your limit'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {needsProtection
              ? 'Sunscreen, hat, and shade before heading out.'
              : `At or below your limit of ${threshold}.`}{' '}
            ({uvCategory(now.uv)} on the standard UV scale.)
          </ThemedText>
        </View>
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        {sourceLine}
      </ThemedText>
      {fallbackReason && (
        <ThemedText type="small" themeColor="textSecondary">
          Live reading unavailable ({fallbackReason}), so this is an estimate from the forecast.
        </ThemedText>
      )}

      <SunscreenRow place={place} needsProtection={needsProtection} />

      {forecast && (
        <>
          <Pressable onPress={() => setShowForecast((v) => !v)} hitSlop={8}>
            <ThemedText type="small" style={{ color: theme.accent }}>
              {showForecast ? "Hide today's forecast" : "Show today's forecast"}
            </ThemedText>
          </Pressable>
          {showForecast && (
            <>
              <ThemedText>
                {forecast.window
                  ? `Forecast: UV above ${threshold} from about ${formatHour(forecast.window.start)} to ${formatHour(
                      forecast.window.end,
                    )}, peaking at ${forecast.max.toFixed(1)} around ${formatHour(forecast.peakHour)}.`
                  : `Forecast: UV stays at or below ${threshold} all day (peak ${forecast.max.toFixed(1)}).`}
              </ThemedText>
              <UvChart forecast={forecast} threshold={threshold} />
            </>
          )}
        </>
      )}
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
        <CardHeader icon="mappin.and.ellipse" title="CHOOSE A PLACE" />
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

/** Small rounded text button with a comfortable tap area. */
function Pill({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: theme.backgroundSelected, opacity: pressed ? 0.6 : 1 },
      ]}>
      <ThemedText type="button" style={{ color: theme.accent }}>
        {label}
      </ThemedText>
    </Pressable>
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
      onPress={() => {
        tap();
        onPress();
      }}
      style={[styles.button, { backgroundColor: secondary ? theme.backgroundSelected : theme.accent }]}>
      <ThemedText type="button" style={{ color: secondary ? theme.text : theme.onAccent }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  pillRow: { flexDirection: 'row', gap: Spacing.three },
  placeName: { flex: 1 },
  pill: { paddingVertical: Spacing.one + 2, paddingHorizontal: Spacing.three, borderRadius: 999 },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  bigNumber: { fontSize: 56, lineHeight: 66, fontFamily: HeadingFont.bold },
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
