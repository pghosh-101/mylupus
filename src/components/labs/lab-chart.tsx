import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { Segmented } from '@/components/meds/controls';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { FLAG_LABEL, flagFor, formatValue, type LabResult } from '@/lib/labs';
import { formatDate, parseDate } from '@/lib/meds';

const H = 190;
const PAD = { left: 44, right: 14, top: 16, bottom: 26 };

/** One test over time: line + points, with the reference range shaded. Tap a point for its value. */
export function LabChart({ results: allResults, accepted }: { results: LabResult[]; accepted?: boolean }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [range, setRange] = useState<'all' | 5 | 3>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (allResults.length === 0) return null;

  const results = range === 'all' ? allResults : allResults.slice(-range);
  const found = results.findIndex((r) => r.id === selectedId);
  const selected = found >= 0 ? found : results.length - 1;
  const setSelected = (i: number) => setSelectedId(results[i].id);

  // Use the most recent result's range for the band.
  const latest = results[results.length - 1];
  const { low, high, unit } = latest;

  const values = results.map((r) => r.value);
  // Keep both edges of the normal range in view so the band never draws off the chart.
  const edges = [low, high].filter((v): v is number => v !== null);
  let yMin = Math.min(...values, ...edges);
  let yMax = Math.max(...values, ...edges);
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  // Round the axis out to "nice" numbers (steps of 1, 2, or 5 × a power of ten).
  const rawStep = (yMax - yMin) / 3;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= rawStep) ?? 10 * mag;
  yMin = Math.max(0, Math.floor((yMin - step * 0.25) / step) * step);
  yMax = Math.ceil((yMax + step * 0.25) / step) * step;

  const times = results.map((r) => parseDate(r.date).getTime());
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const plotH = H - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + (tMax === tMin ? plotW / 2 : ((t - tMin) / (tMax - tMin)) * plotW);
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  const ticks: number[] = [];
  for (let t = yMin; t <= yMax + step / 2; t += step) ticks.push(Math.round(t * 1000) / 1000);
  const path = results.map((r, i) => `${i ? 'L' : 'M'}${x(times[i])},${y(r.value)}`).join(' ');
  const bandTop = y(high ?? yMax);
  const bandBottom = y(low ?? yMin);
  const sel = results[selected] ?? latest;
  // Show years on the axis when the chart spans more than one year.
  const multiYear = new Date(tMin).getFullYear() !== new Date(tMax).getFullYear();
  const axisDate = (t: number) =>
    multiYear
      ? new Date(t).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
      : formatDate(new Date(t));
  const selFlag = flagFor(sel);

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={`Chart of ${results.length} results. Latest ${formatValue(latest.value)} ${unit} on ${formatDate(parseDate(latest.date))}.`}>
      {allResults.length > 3 && (
        <View style={styles.filter}>
          <Segmented
            options={[
              { value: 'all', label: 'All time' },
              ...(allResults.length > 5 ? [{ value: 5 as const, label: 'Last 5' }] : []),
              { value: 3, label: 'Last 3' },
            ]}
            value={range}
            onChange={setRange}
          />
        </View>
      )}
      <View style={styles.readout}>
        <ThemedText type="smallBold">
          {formatValue(sel.value)} {sel.unit}
          {FLAG_LABEL[selFlag] ? ` · ${FLAG_LABEL[selFlag]}` : ''}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatDate(parseDate(sel.date))}, {parseDate(sel.date).getFullYear()}
        </ThemedText>
      </View>

      {width > 0 && (
        <Svg width={width} height={H}>
          {/* Reference range band */}
          {(low !== null || high !== null) && (
            <Rect
              x={PAD.left}
              y={bandTop}
              width={plotW}
              height={Math.max(0, bandBottom - bandTop)}
              fill={theme.accent}
              opacity={0.1}
            />
          )}
          {/* Grid + y labels */}
          {ticks.map((t, i) => (
            <G key={i}>
              <Line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} stroke={theme.backgroundSelected} strokeWidth={1} />
              <SvgText x={PAD.left - 6} y={y(t) + 4} fontSize={11} fill={theme.textSecondary} textAnchor="end">
                {formatValue(t)}
              </SvgText>
            </G>
          ))}
          {/* Range edges */}
          {[low, high].map((v, i) =>
            v === null ? null : (
              <Line
                key={`r${i}`}
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={y(v)}
                y2={y(v)}
                stroke={theme.accent}
                strokeWidth={1}
                strokeDasharray="4 4"
                opacity={0.6}
              />
            ),
          )}
          {/* Line */}
          {results.length > 1 && <Path d={path} stroke={theme.accent} strokeWidth={2} fill="none" />}
          {/* Points (big invisible hit targets) */}
          {results.map((r, i) => {
            const out = !accepted && (flagFor(r) === 'low' || flagFor(r) === 'high');
            return (
              <G key={r.id} onPress={() => setSelected(i)}>
                <Circle cx={x(times[i])} cy={y(r.value)} r={16} fill="transparent" />
                <Circle
                  cx={x(times[i])}
                  cy={y(r.value)}
                  r={i === selected ? 7 : 5}
                  fill={out ? theme.sunAlert : theme.accent}
                  stroke={theme.backgroundElement}
                  strokeWidth={2}
                />
              </G>
            );
          })}
          {/* X labels: first and last date */}
          <SvgText x={PAD.left} y={H - 6} fontSize={11} fill={theme.textSecondary} textAnchor="start">
            {axisDate(tMin)}
          </SvgText>
          {tMax !== tMin && (
            <SvgText x={PAD.left + plotW} y={H - 6} fontSize={11} fill={theme.textSecondary} textAnchor="end">
              {axisDate(tMax)}
            </SvgText>
          )}
        </Svg>
      )}
      <ThemedText type="small" themeColor="textSecondary">
        {accepted
          ? "Shaded band = normal range. Your doctor said your level is OK, so points outside it aren't highlighted. Tap a point to see it."
          : 'Shaded band = normal range from your latest result. Orange points are out of range. Tap a point to see it.'}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  filter: { marginBottom: Spacing.two },
  readout: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: Spacing.one },
});
