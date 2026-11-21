import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ToggleChips } from '@/components/learn/parts';
import { ActionButton, Field, FormSheet, Segmented } from '@/components/meds/controls';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { TOPICS, type FeedKind, type LearnPrefs, type Personal, type TopicId } from '@/lib/learn';

/** The preference fields, shared by first-time setup and the Preferences sheet. */
function PrefsFields({ prefs, onChange }: { prefs: LearnPrefs; onChange: (p: LearnPrefs) => void }) {
  return (
    <>
      <Field label="Topics you care about" hint="These shape News and Library. You can still browse everything.">
        <ToggleChips<TopicId>
          options={TOPICS.map((t) => ({ value: t.id, label: t.label }))}
          value={prefs.topics}
          onChange={(topics) => onChange({ ...prefs, topics })}
        />
      </Field>
      <Field label="In your news feed">
        <ToggleChips<FeedKind>
          options={[
            { value: 'studies', label: 'New studies' },
            { value: 'news', label: 'Research news' },
            { value: 'trials', label: 'Clinical trials' },
          ]}
          value={prefs.kinds}
          onChange={(kinds) => onChange({ ...prefs, kinds: kinds.length ? kinds : prefs.kinds })}
        />
      </Field>
      <Field
        label="Studies to show"
        hint={
          prefs.depth === 'patient'
            ? 'Trials, reviews, guidelines, and studies of people with lupus. Skips lab and animal research.'
            : 'Also includes lab research on how lupus works (more technical).'
        }>
        <Segmented
          options={[
            { value: 'patient', label: 'About patients' },
            { value: 'all', label: 'Include lab research' },
          ]}
          value={prefs.depth}
          onChange={(depth) => onChange({ ...prefs, depth })}
        />
      </Field>
      <Field label="Clinical trials" hint="Near you uses the place on your UV card (within about 150 miles).">
        <Segmented
          options={[
            { value: 'near', label: 'Near me' },
            { value: 'any', label: 'Anywhere' },
          ]}
          value={prefs.trialsNearMe ? 'near' : 'any'}
          onChange={(v) => onChange({ ...prefs, trialsNearMe: v === 'near' })}
        />
      </Field>
    </>
  );
}

/** Shown the first time News or Library opens. */
export function LearnSetup({
  initial,
  personal,
  onDone,
}: {
  initial: LearnPrefs;
  personal: Personal;
  onDone: (p: LearnPrefs) => void;
}) {
  const theme = useTheme();
  const [prefs, setPrefs] = useState<LearnPrefs>(() => ({
    ...initial,
    topics: initial.topics.length ? initial.topics : personal.suggestedTopics,
  }));
  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={styles.inner}>
        <View style={[styles.intro, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold" style={styles.introTitle}>
            What would you like to see?
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            News brings in new lupus research, news, and recruiting clinical trials from trusted sources. Library is a
            hand-picked set of articles from places like Johns Hopkins and the American College of Rheumatology. Pick
            what matters to you. You can change this any time.
          </ThemedText>
          {personal.terms.length > 0 && (
            <ThemedText type="small" style={{ color: theme.accent }}>
              ★ Items that mention{' '}
              {personal.groups
                .map((g) => g[0])
                .slice(0, 3)
                .join(', ')}{' '}
              will be marked as related to you.
            </ThemedText>
          )}
        </View>
        <PrefsFields prefs={prefs} onChange={setPrefs} />
        <ActionButton label="Show my feed" onPress={() => onDone({ ...prefs, setUp: true })} />
        <ActionButton
          label="Skip for now (show everything)"
          kind="secondary"
          onPress={() => onDone({ ...prefs, topics: [], setUp: true })}
        />
      </View>
    </ScrollView>
  );
}

/** Edit preferences later. */
export function PreferencesSheet({
  visible,
  prefs,
  onClose,
  onSave,
}: {
  visible: boolean;
  prefs: LearnPrefs;
  onClose: () => void;
  onSave: (p: LearnPrefs) => void;
}) {
  const [draft, setDraft] = useState(prefs);
  useEffect(() => {
    if (visible) setDraft(prefs);
  }, [visible, prefs]);
  return (
    <FormSheet
      visible={visible}
      title="News & Library preferences"
      saveLabel="Save preferences"
      onClose={onClose}
      onSave={() => onSave({ ...draft, setUp: true })}>
      <PrefsFields prefs={draft} onChange={setDraft} />
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.five,
    alignItems: 'center',
  },
  inner: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.four },
  intro: { borderRadius: 20, padding: Spacing.three, gap: Spacing.two },
  introTitle: { fontSize: 18, lineHeight: 24 },
});
