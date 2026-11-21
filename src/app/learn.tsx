import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AskView } from '@/components/learn/ask-view';
import { LibraryView } from '@/components/learn/library-view';
import { NewsView } from '@/components/learn/news-view';
import { LearnSetup, PreferencesSheet } from '@/components/learn/preferences';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { select } from '@/lib/haptics';
import {
  EMPTY_PERSONAL,
  loadPersonal,
  loadPrefs,
  loadSaved,
  savePrefs,
  toggleSaved,
  type LearnPrefs,
  type Personal,
  type SavedItem,
} from '@/lib/learn';

type Section = 'ask' | 'news' | 'library';
const SECTIONS: { value: Section; label: string }[] = [
  { value: 'ask', label: 'Ask' },
  { value: 'news', label: 'News' },
  { value: 'library', label: 'Library' },
];
const SECTION_KEY = 'mylupus.learnSection';

/** Learn tab: Ask (chat over your data), News (live research), and Library (trusted articles). */
export default function LearnScreen() {
  const theme = useTheme();
  const [section, setSection] = useState<Section>('ask');
  const [prefs, setPrefs] = useState<LearnPrefs | null>(null);
  const [personal, setPersonal] = useState<Personal>(EMPTY_PERSONAL);
  const [saved, setSaved] = useState<SavedItem[]>([]);
  const [editing, setEditing] = useState(false);

  // Reopen on the section you used last.
  useEffect(() => {
    AsyncStorage.getItem(SECTION_KEY)
      .then((s) => {
        if (s === 'ask' || s === 'news' || s === 'library') setSection(s);
      })
      .catch(() => {});
  }, []);

  // Medications and saved items can change on other tabs, so refresh them when you come back.
  useFocusEffect(
    useCallback(() => {
      loadPrefs().then(setPrefs);
      loadPersonal()
        .then(setPersonal)
        .catch(() => {});
      loadSaved().then(setSaved);
    }, []),
  );

  const choose = (s: Section) => {
    select();
    setSection(s);
    AsyncStorage.setItem(SECTION_KEY, s).catch(() => {});
  };
  const updatePrefs = async (p: LearnPrefs) => {
    setPrefs(p);
    setEditing(false);
    await savePrefs(p);
  };
  const onToggleSave = async (item: Omit<SavedItem, 'savedAt'>) => setSaved(await toggleSaved(item));

  const body = () => {
    if (section === 'ask') return <AskView />;
    if (!prefs) return <ActivityIndicator style={styles.spinner} />;
    const done = section === 'news' ? prefs.newsSetUp : prefs.librarySetUp;
    if (!done)
      return <LearnSetup key={section} section={section} initial={prefs} personal={personal} onDone={updatePrefs} />;
    const common = {
      prefs,
      personal,
      saved,
      onEditPrefs: () => setEditing(true),
    };
    return section === 'news' ? (
      <NewsView
        {...common}
        onToggleSave={(item) =>
          onToggleSave({
            id: item.id,
            title: item.title,
            url: item.url,
            source: item.source,
            label: item.label,
          })
        }
      />
    ) : (
      <LibraryView {...common} onToggleSave={onToggleSave} />
    );
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.switcherWrap, Platform.OS === 'web' && styles.webTop]}>
        <View style={[styles.switcher, { backgroundColor: theme.backgroundElement }]} accessibilityRole="tablist">
          {SECTIONS.map((s) => {
            const on = s.value === section;
            return (
              <Pressable
                key={s.value}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => choose(s.value)}
                style={[styles.segment, on && { backgroundColor: theme.accentFill }]}>
                <ThemedText type="smallBold" style={{ color: on ? theme.onAccent : theme.textSecondary }}>
                  {s.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={styles.flex}>{body()}</View>
      {prefs && (
        <PreferencesSheet
          section={section === 'library' ? 'library' : 'news'}
          visible={editing}
          prefs={prefs}
          onClose={() => setEditing(false)}
          onSave={updatePrefs}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  switcherWrap: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
    alignItems: 'center',
  },
  webTop: { paddingTop: 80 },
  switcher: {
    flexDirection: 'row',
    borderRadius: 999,
    padding: 4,
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: 999,
  },
  spinner: { marginTop: Spacing.five },
});
