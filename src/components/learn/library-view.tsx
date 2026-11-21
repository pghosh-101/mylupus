import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ChipRow, FilterToggle, ItemCard, Notice, PillButton } from '@/components/learn/parts';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  LIBRARY_TOPICS,
  mentions,
  topicLabel,
  type LearnPrefs,
  type Personal,
  type SavedItem,
  type TopicId,
} from '@/lib/learn';
import { LIBRARY, LIBRARY_SOURCES, type LibraryArticle } from '@/lib/library';

type TopicFilter = 'foryou' | 'saved' | 'all' | TopicId;
type Sort = 'recommended' | 'shortest' | 'az';
type Length = 'any' | 'quick' | 'long';

export function LibraryView({
  prefs,
  personal,
  saved,
  onToggleSave,
  onEditPrefs,
}: {
  prefs: LearnPrefs;
  personal: Personal;
  saved: SavedItem[];
  onToggleSave: (item: Omit<SavedItem, 'savedAt'>) => void;
  onEditPrefs: () => void;
}) {
  const theme = useTheme();
  const hasForYou = prefs.topics.length > 0 || personal.terms.length > 0;
  const [topic, setTopic] = useState<TopicFilter>(hasForYou ? 'foryou' : 'all');
  const [source, setSource] = useState<string>('all');
  const [length, setLength] = useState<Length>('any');
  const [sort, setSort] = useState<Sort>('recommended');
  const [search, setSearch] = useState('');
  const [moreFilters, setMoreFilters] = useState(false);

  const savedIds = new Set(saved.map((s) => s.id));
  const related = (a: LibraryArticle) => mentions(`${a.title} ${a.tags.join(' ')}`, personal);
  const score = (a: LibraryArticle) => related(a).length * 2 + (prefs.topics.includes(a.topic) ? 1 : 0);

  const q = search.trim().toLowerCase();
  let articles = LIBRARY.filter((a) => {
    if (topic === 'foryou' && !(prefs.topics.includes(a.topic) || related(a).length > 0)) return false;
    if (topic !== 'foryou' && topic !== 'all' && topic !== 'saved' && a.topic !== topic) return false;
    if (source !== 'all' && a.source !== source) return false;
    if (length === 'quick' && a.minutes > 4) return false;
    if (length === 'long' && a.minutes <= 4) return false;
    if (q && !`${a.title} ${a.summary} ${a.source} ${topicLabel(a.topic)}`.toLowerCase().includes(q)) return false;
    return true;
  });
  if (sort === 'recommended') articles = [...articles].sort((a, b) => score(b) - score(a));
  if (sort === 'shortest') articles = [...articles].sort((a, b) => a.minutes - b.minutes);
  if (sort === 'az') articles = [...articles].sort((a, b) => a.title.localeCompare(b.title));

  const savedShown = saved.filter((s) => !q || `${s.title} ${s.source}`.toLowerCase().includes(q));

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <View style={styles.inner}>
        <View style={styles.header}>
          <View style={styles.flex}>
            <ThemedText type="subtitle">Library</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Hand-picked articles from Johns Hopkins, HSS, the American College of Rheumatology, and more
            </ThemedText>
          </View>
          <PillButton label="Preferences" onPress={onEditPrefs} />
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search the library"
          placeholderTextColor={theme.textSecondary}
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={[styles.search, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />

        <View style={styles.filters}>
          <ChipRow<TopicFilter>
            label="Topic"
            options={[
              ...(hasForYou ? [{ value: 'foryou' as const, label: 'For you' }] : []),
              {
                value: 'saved',
                label: `Saved${saved.length ? ` (${saved.length})` : ''}`,
              },
              { value: 'all', label: 'All topics' },
              ...LIBRARY_TOPICS.map((t) => ({ value: t.id, label: t.label })),
            ]}
            value={topic}
            onChange={setTopic}
          />
          {topic !== 'saved' && (
            <FilterToggle
              open={moreFilters}
              onPress={() => setMoreFilters((v) => !v)}
              summary={[
                source === 'all' ? 'All sources' : source,
                { any: 'Any length', quick: 'Quick reads', long: 'In depth' }[length],
                {
                  recommended: 'Recommended',
                  shortest: 'Shortest first',
                  az: 'A to Z',
                }[sort],
              ].join(' · ')}
            />
          )}
          {topic !== 'saved' && moreFilters && (
            <>
              <ChipRow
                label="Source"
                options={[
                  { value: 'all', label: 'All sources' },
                  ...LIBRARY_SOURCES.map((s) => ({ value: s, label: s })),
                ]}
                value={source}
                onChange={setSource}
              />
              <ChipRow<Length>
                label="Length"
                options={[
                  { value: 'any', label: 'Any length' },
                  { value: 'quick', label: 'Quick reads (≤ 4 min)' },
                  { value: 'long', label: 'In depth' },
                ]}
                value={length}
                onChange={setLength}
              />
              <ChipRow<Sort>
                label="Sort"
                options={[
                  { value: 'recommended', label: 'Recommended' },
                  { value: 'shortest', label: 'Shortest first' },
                  { value: 'az', label: 'A to Z' },
                ]}
                value={sort}
                onChange={setSort}
              />
            </>
          )}
        </View>

        {topic === 'saved' ? (
          <>
            {savedShown.length === 0 && (
              <Notice>Tap ☆ Save on any article, study, or trial to keep it here for your next appointment.</Notice>
            )}
            {savedShown.map((s) => (
              <ItemCard
                key={s.id}
                label={s.label}
                title={s.title}
                source={s.source}
                url={s.url}
                saved
                onToggleSave={() => onToggleSave(s)}
              />
            ))}
          </>
        ) : (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              {articles.length} {articles.length === 1 ? 'article' : 'articles'}
            </ThemedText>
            {articles.length === 0 && <Notice>No articles match. Try another topic, source, or search.</Notice>}
            {articles.map((a) => (
              <ItemCard
                key={a.id}
                label={topicLabel(a.topic)}
                meta={`${a.minutes} min read`}
                title={a.title}
                source={a.source}
                detail={a.summary}
                mentions={related(a)}
                url={a.url}
                saved={savedIds.has(a.id)}
                onToggleSave={() =>
                  onToggleSave({
                    id: a.id,
                    title: a.title,
                    url: a.url,
                    source: a.source,
                    label: topicLabel(a.topic),
                  })
                }
              />
            ))}
          </>
        )}

        <Notice>
          Articles open on the source&apos;s own website. They&apos;re general information, so check with your care team
          about what applies to you.
        </Notice>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.five,
    alignItems: 'center',
  },
  inner: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  flex: { flex: 1, gap: 2 },
  filters: { gap: Spacing.two },
  search: {
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
  },
});
