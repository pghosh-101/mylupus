import { useState } from 'react';
import { LayoutAnimation, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HistoryEditor, type HistoryEditing } from '@/components/log/history-editor';
import { ActionButton, Segmented } from '@/components/meds/controls';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { DURATION_APPROX_LABEL, flareLength, type Flare, type MedicalHistory } from '@/lib/daily';
import { tap } from '@/lib/haptics';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const SEVERITY_LABEL = ['', 'Mild', 'Moderate', 'Severe'];

/** "Nov 3, 2026" or "Nov 2026" from "2026-11-03" / "2026-11". */
export function formatStart(start: string, withYear = true) {
  const [y, m, d] = start.split('-').map(Number);
  const base = d ? `${MONTHS[m - 1]} ${d}` : MONTHS[m - 1];
  return withYear ? `${base}${d ? ',' : ''} ${y}` : base;
}

/** When a flare happened, e.g. "Nov 3 – 9, 2026", "Since Nov 3", or "Mar 2025 · about 10 days". */
export function flareWhen(f: Flare) {
  if (f.ongoing) return `Since ${formatStart(f.start)}`;
  if (f.start.length === 7 || !f.durationDays) {
    if (f.durationDays)
      return `${formatStart(f.start)} · about ${f.durationDays} day${f.durationDays === 1 ? '' : 's'}`;
    const rough =
      f.durationApprox && f.durationApprox !== 'unknown' ? ` · ${DURATION_APPROX_LABEL[f.durationApprox]}` : '';
    return `${formatStart(f.start)}${rough}`;
  }
  const [y, m, d] = f.start.split('-').map(Number);
  const end = new Date(y, m - 1, d + f.durationDays - 1);
  if (f.durationDays === 1) return formatStart(f.start);
  const sameMonth = end.getMonth() === m - 1 && end.getFullYear() === y;
  const endText = sameMonth ? `${end.getDate()}` : `${MONTHS[end.getMonth()]} ${end.getDate()}`;
  return `${MONTHS[m - 1]} ${d} – ${endText}, ${end.getFullYear()}`;
}

/** Sort key that places month-only dates mid-month. */
const sortKey = (start: string) => (start.length === 7 ? `${start}-15` : start);

type Entry =
  | { kind: 'flare'; key: string; date: string; flare: Flare }
  | { kind: 'diagnosis'; key: string; date: string };

/** Full-screen timeline of flares and milestones, newest first. Tap a box to see everything. */
export function HistoryTimeline({
  visible,
  flares,
  history,
  onSaveFlare,
  onDeleteFlare,
  onSaveHistory,
  onClose,
}: {
  visible: boolean;
  flares: Flare[];
  history: MedicalHistory;
  onSaveFlare: (f: Flare) => void;
  onDeleteFlare: (id: string) => void;
  onSaveHistory: (h: MedicalHistory) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'flares'>('all');
  const [editing, setEditing] = useState<HistoryEditing | null>(null);

  const toggle = (key: string) => {
    tap();
    if (Platform.OS !== 'web') LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const entries: Entry[] = [
    ...flares.map((f): Entry => ({ kind: 'flare', key: `flare-${f.id}`, date: sortKey(f.start), flare: f })),
    ...(history.diagnosed && filter === 'all'
      ? [{ kind: 'diagnosis' as const, key: 'diagnosis', date: sortKey(history.diagnosed) }]
      : []),
  ].sort((a, b) => {
    // Ongoing flares stay at the top.
    const ao = a.kind === 'flare' && a.flare.ongoing ? 1 : 0;
    const bo = b.kind === 'flare' && b.flare.ongoing ? 1 : 0;
    return bo - ao || b.date.localeCompare(a.date);
  });

  const backgroundItems = [
    ['Diagnosed', history.diagnosed ? formatStart(history.diagnosed) : ''],
    ['Past medications', history.pastMeds],
    ['Other conditions', history.otherConditions],
    ['Allergies', history.allergies],
    ['Notes', history.notes],
  ].filter(([, v]) => v);

  const severityColor = (s: number) => (s === 3 ? theme.sunAlert : s === 2 ? theme.accent : theme.textSecondary);
  const years = entries.map((e) => (e.kind === 'flare' && e.flare.ongoing ? 'Now' : e.date.slice(0, 4)));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView edges={['top', 'bottom']} style={[styles.flex, { backgroundColor: theme.background }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12}>
            <ThemedText style={{ color: theme.accent }}>Done</ThemedText>
          </Pressable>
          <ThemedText type="smallBold">Your history</ThemedText>
          <Pressable onPress={() => setEditing({ kind: 'new' })} hitSlop={12}>
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              + Add
            </ThemedText>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.inner}>
            {/* Health background: things without a single date. */}
            {filter === 'all' && (
              <Pressable
                onPress={() => toggle('background')}
                style={[styles.box, { backgroundColor: theme.backgroundElement }]}
                accessibilityRole="button"
                accessibilityState={{ expanded: open.has('background') }}>
                <View style={styles.boxTop}>
                  <ThemedText type="smallBold">Health background</ThemedText>
                  <ThemedText type="small" style={{ color: theme.accent }}>
                    {open.has('background') ? 'Hide ▴' : 'Show ▾'}
                  </ThemedText>
                </View>
                {backgroundItems.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    Add your diagnosis, past medications, other conditions, and allergies.
                  </ThemedText>
                ) : !open.has('background') ? (
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {backgroundItems.map(([k, v]) => (k === 'Diagnosed' ? `Diagnosed ${v}` : v)).join(' · ')}
                  </ThemedText>
                ) : (
                  backgroundItems.map(([k, v]) => <Detail key={k} label={k} value={v} />)
                )}
                {(open.has('background') || backgroundItems.length === 0) && (
                  <ActionButton
                    label={backgroundItems.length ? 'Edit background' : 'Add background'}
                    kind="secondary"
                    onPress={() => setEditing({ kind: 'background' })}
                  />
                )}
              </Pressable>
            )}

            <Segmented
              options={[
                { value: 'all', label: 'Everything' },
                { value: 'flares', label: `Flares (${flares.length})` },
              ]}
              value={filter}
              onChange={setFilter}
            />

            {entries.length === 0 && (
              <View style={[styles.box, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="smallBold">No flares logged yet</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Add flares as they happen, and past ones you remember. An approximate month is fine.
                </ThemedText>
                <ActionButton label="Update history" onPress={() => setEditing({ kind: 'new' })} />
              </View>
            )}

            <View>
              {entries.map((e, i) => {
                const year = years[i];
                const showYear = i === 0 || year !== years[i - 1];
                const isOpen = open.has(e.key);
                const isLast = i === entries.length - 1;
                const dotColor =
                  e.kind === 'diagnosis'
                    ? theme.accent
                    : e.flare.ongoing
                      ? theme.sunAlert
                      : severityColor(e.flare.severity);
                return (
                  <View key={e.key}>
                    {showYear && (
                      <View style={styles.yearRow}>
                        <View style={styles.rail}>
                          <View style={[styles.line, { backgroundColor: theme.backgroundSelected }]} />
                        </View>
                        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.year}>
                          {year}
                        </ThemedText>
                      </View>
                    )}
                    <View style={styles.entryRow}>
                      <View style={styles.rail}>
                        <View
                          style={[styles.line, { backgroundColor: theme.backgroundSelected }, isLast && styles.lineEnd]}
                        />
                        <View
                          style={[
                            styles.dot,
                            { backgroundColor: dotColor, borderColor: theme.background },
                            e.kind === 'flare' && e.flare.ongoing && styles.dotBig,
                          ]}
                        />
                      </View>
                      {e.kind === 'diagnosis' ? (
                        <Pressable
                          onPress={() => toggle(e.key)}
                          style={[styles.box, styles.entryBox, { backgroundColor: theme.backgroundElement }]}>
                          <ThemedText type="small" themeColor="textSecondary">
                            {formatStart(history.diagnosed)}
                          </ThemedText>
                          <ThemedText type="smallBold">Diagnosed with lupus</ThemedText>
                          {isOpen && (
                            <>
                              {history.pastMeds ? <Detail label="Past medications" value={history.pastMeds} /> : null}
                              <ActionButton
                                label="Edit background"
                                kind="secondary"
                                onPress={() => setEditing({ kind: 'background' })}
                              />
                            </>
                          )}
                        </Pressable>
                      ) : (
                        <FlareBox
                          flare={e.flare}
                          open={isOpen}
                          color={dotColor}
                          onToggle={() => toggle(e.key)}
                          onEdit={() => setEditing({ kind: 'flare', flare: e.flare })}
                        />
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        </ScrollView>

        {/* Rendered inside this sheet so it opens on top of the timeline. */}
        <HistoryEditor
          editing={editing}
          history={history}
          onClose={() => setEditing(null)}
          onSaveFlare={(f) => {
            setEditing(null);
            onSaveFlare(f);
          }}
          onDeleteFlare={(id) => {
            setEditing(null);
            onDeleteFlare(id);
          }}
          onSaveHistory={(h) => {
            setEditing(null);
            onSaveHistory(h);
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

function FlareBox({
  flare,
  open,
  color,
  onToggle,
  onEdit,
}: {
  flare: Flare;
  open: boolean;
  color: string;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      style={[
        styles.box,
        styles.entryBox,
        { backgroundColor: theme.backgroundElement },
        flare.ongoing && { borderWidth: 1, borderColor: theme.sunAlert },
      ]}>
      <View style={styles.boxTop}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
          {flareWhen(flare)}
        </ThemedText>
        {flare.ongoing && (
          <View style={[styles.pill, { backgroundColor: theme.sunAlert }]}>
            <ThemedText type="small" style={styles.pillText}>
              Ongoing
            </ThemedText>
          </View>
        )}
      </View>
      <View style={styles.boxTop}>
        <ThemedText type="smallBold" style={styles.flex}>
          <ThemedText type="smallBold" style={{ color }}>
            ●{' '}
          </ThemedText>
          {SEVERITY_LABEL[flare.severity]} flare
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.accent }}>
          {open ? '▴' : '▾'}
        </ThemedText>
      </View>
      {!open && flare.symptoms.length > 0 && (
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {flare.symptoms.join(', ')}
        </ThemedText>
      )}
      {open && (
        <>
          <Detail
            label="How long"
            value={flare.ongoing ? `Ongoing since ${formatStart(flare.start)}` : flareLength(flare)}
          />
          {flare.symptoms.length > 0 && <Chips label="Symptoms" items={flare.symptoms} />}
          {flare.triggers.length > 0 && <Chips label="Possible triggers" items={flare.triggers} />}
          {flare.treatment ? <Detail label="Treatment" value={flare.treatment} /> : null}
          {flare.notes ? <Detail label="Notes" value={flare.notes} /> : null}
          <ActionButton
            label={flare.ongoing ? 'Update or mark as ended' : 'Edit flare'}
            kind="secondary"
            onPress={onEdit}
          />
        </>
      )}
    </Pressable>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.detailLabel}>
        {label.toUpperCase()}
      </ThemedText>
      <ThemedText type="small" selectable>
        {value}
      </ThemedText>
    </View>
  );
}

function Chips({ label, items }: { label: string; items: string[] }) {
  const theme = useTheme();
  return (
    <View style={styles.detail}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.detailLabel}>
        {label.toUpperCase()}
      </ThemedText>
      <View style={styles.chips}>
        {items.map((s) => (
          <View key={s} style={[styles.chip, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type="small">{s}</ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

const RAIL = 28;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  scroll: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.six, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three },
  box: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  boxTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  entryRow: { flexDirection: 'row', alignItems: 'stretch' },
  entryBox: { flex: 1, marginBottom: Spacing.three },
  yearRow: { flexDirection: 'row', alignItems: 'center', minHeight: 32 },
  year: { paddingBottom: Spacing.two, paddingTop: Spacing.one },
  rail: { width: RAIL, alignItems: 'center' },
  line: { position: 'absolute', top: 0, bottom: 0, width: 2 },
  lineEnd: { bottom: '80%' },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 3, marginTop: Spacing.three + 2 },
  dotBig: { width: 18, height: 18, borderRadius: 9, marginTop: Spacing.three },
  pill: { borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 1 },
  pillText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  detail: { gap: 2 },
  detailLabel: { fontWeight: '700', fontSize: 11, letterSpacing: 0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one + 2 },
  chip: { borderRadius: 999, paddingHorizontal: Spacing.two + 2, paddingVertical: 3 },
});
