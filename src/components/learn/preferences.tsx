import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ToggleChips } from '@/components/learn/parts';
import { ActionButton, Field, FormSheet, Segmented } from '@/components/meds/controls';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  LIBRARY_TOPICS,
  NEWS_TOPICS,
  type FeedKind,
  type LearnPrefs,
  type LearnSection,
  type Personal,
  type TopicId,
} from '@/lib/learn';

const setUpKey = (section: LearnSection) => (section === 'news' ? 'newsSetUp' : 'librarySetUp');

/**
 * The preference fields for one section. Topics are shared (changing them here changes them for
 * both sections); the rest only affect the section they're shown in.
 */
function PrefsFields({
  section,
  prefs,
  onChange,
}: {
  section: LearnSection;
  prefs: LearnPrefs;
  onChange: (p: LearnPrefs) => void;
}) {
  // Only topics that do something in this section: News has no "Lab tests" feed, the Library no "New treatments".
  const shown = section === 'news' ? NEWS_TOPICS : LIBRARY_TOPICS;
  const shownIds = shown.map((t) => t.id);
  return (
    <>
      <Field
        label="Topics you care about"
        hint={
          section === 'news'
            ? 'Shown under My topics. These are shared with the Library (For you). You can still browse everything.'
            : 'Shown under For you. These are shared with News (My topics). You can still browse everything.'
        }>
        <ToggleChips<TopicId>
          options={shown.map((t) => ({ value: t.id, label: t.label }))}
          value={prefs.topics.filter((id) => shownIds.includes(id))}
          // Keep picks for topics only the other section uses.
          onChange={(topics) =>
            onChange({ ...prefs, topics: [...prefs.topics.filter((id) => !shownIds.includes(id)), ...topics] })
          }
        />
      </Field>
      {section === 'library' && (
        <Field
          label="Reading length"
          hint="Where the Library's length filter starts. You can switch it any time under More filters.">
          <Segmented
            options={[
              { value: 'any', label: 'Any length' },
              { value: 'quick', label: 'Quick reads' },
              { value: 'long', label: 'In depth' },
            ]}
            value={prefs.libraryLength}
            onChange={(libraryLength) => onChange({ ...prefs, libraryLength })}
          />
        </Field>
      )}
      {section === 'news' && (
        <>
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
      )}
    </>
  );
}

/** Shown the first time News or Library opens. */
export function LearnSetup({
  section,
  initial,
  personal,
  onDone,
}: {
  section: LearnSection;
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
            {section === 'news' ? 'What would you like in your news feed?' : 'What would you like to read about?'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {section === 'news'
              ? 'News brings in new lupus studies, research news, and recruiting clinical trials from trusted sources.'
              : 'The Library is a hand-picked set of articles from places like Johns Hopkins and the American College of Rheumatology.'}{' '}
            {initial.topics.length
              ? 'Your topics are filled in from before; adjust them if you like.'
              : 'Pick what matters to you.'}{' '}
            You can change this any time under Preferences.
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
        <PrefsFields section={section} prefs={prefs} onChange={setPrefs} />
        <ActionButton
          label={section === 'news' ? 'Show my feed' : 'Show my library'}
          onPress={() => onDone({ ...prefs, [setUpKey(section)]: true })}
        />
        <ActionButton
          label="Skip for now (show everything)"
          kind="secondary"
          onPress={() => onDone({ ...initial, [setUpKey(section)]: true })}
        />
      </View>
    </ScrollView>
  );
}

/** Edit preferences later. */
export function PreferencesSheet({
  section,
  visible,
  prefs,
  onClose,
  onSave,
}: {
  section: LearnSection;
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
      title={section === 'news' ? 'News preferences' : 'Library preferences'}
      saveLabel="Save preferences"
      onClose={onClose}
      onSave={() => onSave({ ...draft, [setUpKey(section)]: true })}>
      <PrefsFields section={section} prefs={draft} onChange={setDraft} />
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
