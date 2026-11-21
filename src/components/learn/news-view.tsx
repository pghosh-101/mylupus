import { useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import {
  ChipRow,
  FilterToggle,
  formatDay,
  ItemCard,
  Notice,
  PillButton,
  SectionHeading,
} from '@/components/learn/parts';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  fetchNews,
  fetchStudies,
  fetchTrials,
  mentions,
  NEWS_AVAILABLE,
  NEWS_TOPICS,
  readCache,
  writeCache,
  type FeedItem,
  type FeedKind,
  type LearnPrefs,
  type NewsQuery,
  type Personal,
  type SavedItem,
  type SortBy,
  type TimeRange,
} from '@/lib/learn';

type Kind = 'all' | FeedKind;
type Section =
  | { status: 'loading'; items?: FeedItem[] }
  | {
      status: 'ready';
      items: FeedItem[];
      total?: number;
      near?: string | null;
      backup?: boolean;
      at: number;
    }
  | { status: 'error'; message: string; items?: FeedItem[] };

type Loaded = { items: FeedItem[]; total?: number; near?: string | null; backup?: boolean };

/** Results are refreshed in the background when older than this. */
const FRESH_MS = 30 * 60 * 1000;
/** How many of each kind the "All" view shows before "See all". */
const PREVIEW: Record<FeedKind, number> = { studies: 6, news: 3, trials: 3 };

const TIME_LABEL: Record<TimeRange, string> = {
  month: 'Last month',
  year: 'Last year',
  all: 'All time',
};
const KIND_LABEL: Record<FeedKind, string> = {
  studies: 'New studies',
  news: 'Research news',
  trials: 'Recruiting trials',
};

export function NewsView({
  prefs,
  personal,
  saved,
  onToggleSave,
  onEditPrefs,
}: {
  prefs: LearnPrefs;
  personal: Personal;
  saved: SavedItem[];
  onToggleSave: (item: FeedItem) => void;
  onEditPrefs: () => void;
}) {
  const theme = useTheme();
  const [kind, setKind] = useState<Kind>('all');
  const [topic, setTopic] = useState<NewsQuery['topic']>(prefs.topics.length ? 'mine' : 'all');
  const [time, setTime] = useState<TimeRange>('year');
  const [sort, setSort] = useState<SortBy>('newest');
  const [trialsAnywhere, setTrialsAnywhere] = useState(false);
  const [moreFilters, setMoreFilters] = useState(false);
  const [sections, setSections] = useState<Partial<Record<FeedKind, Section>>>({});
  const [refreshTick, setRefreshTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Sort options depend on what's shown: news is always newest first, trials can't be "most cited".
  const effectiveSort: SortBy = kind === 'news' ? 'newest' : kind === 'trials' && sort === 'popular' ? 'newest' : sort;
  const kinds: FeedKind[] = kind === 'all' ? prefs.kinds.filter((k) => k !== 'news' || NEWS_AVAILABLE) : [kind];
  const nearMe = prefs.trialsNearMe && !trialsAnywhere;
  const kindsKey = kinds.join(',');
  const topicsKey = prefs.topics.join('+');
  const termsKey = personal.terms.join('+');

  useEffect(() => {
    let alive = true;
    const query: NewsQuery = { topic, time, sort: effectiveSort };
    const force = refreshTick > 0;
    const list = kindsKey.split(',').filter(Boolean) as FeedKind[];

    const load = async (k: FeedKind): Promise<Loaded> => {
      if (k === 'studies') return fetchStudies(query, prefs, personal, kind === 'all' ? PREVIEW.studies : 25);
      if (k === 'news') return { items: await fetchNews(query, prefs, personal) };
      return fetchTrials(query, prefs, personal, nearMe);
    };

    const run = async (k: FeedKind) => {
      const key = [
        k,
        topic,
        time,
        effectiveSort,
        prefs.depth,
        k === 'trials' ? String(nearMe) : '',
        kind === 'all' ? 'preview' : 'full',
        topicsKey,
        termsKey,
      ].join('|');
      const cached = await readCache<Loaded>(key);
      if (!alive) return;
      if (cached)
        setSections((s) => ({
          ...s,
          [k]: { status: 'ready', ...cached.value, at: cached.at },
        }));
      else
        setSections((s) => ({
          ...s,
          [k]: { status: 'loading', items: s[k]?.items },
        }));
      if (cached && !force && Date.now() - cached.at < FRESH_MS) return;
      try {
        const fresh = await load(k);
        if (!alive) return;
        setSections((s) => ({
          ...s,
          [k]: { status: 'ready', ...fresh, at: Date.now() },
        }));
        writeCache(key, fresh);
      } catch (e) {
        if (!alive) return;
        const message = e instanceof Error ? e.message : 'Something went wrong.';
        // Keep showing cached results if the refresh fails (for example, offline).
        if (!cached) setSections((s) => ({ ...s, [k]: { status: 'error', message } }));
      }
    };

    Promise.all(list.map(run)).finally(() => {
      if (alive) setRefreshing(false);
    });
    return () => {
      alive = false;
    };
    // personal and prefs objects change identity on reload; their contents are covered by the keys below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kindsKey, kind, topic, time, effectiveSort, prefs.depth, topicsKey, nearMe, refreshTick, termsKey]);

  const savedIds = new Set(saved.map((s) => s.id));

  const topicOptions: { value: NewsQuery['topic']; label: string }[] = [
    ...(prefs.topics.length ? [{ value: 'mine' as const, label: 'My topics' }] : []),
    ...(personal.terms.length ? [{ value: 'personal' as const, label: 'Related to me' }] : []),
    { value: 'all', label: 'All lupus' },
    ...NEWS_TOPICS.map((t) => ({ value: t.id, label: t.label })),
  ];
  const sortOptions: { value: SortBy; label: string }[] =
    kind === 'trials'
      ? [
          { value: 'newest', label: 'Newest' },
          { value: 'relevant', label: 'Recently updated' },
        ]
      : [
          { value: 'newest', label: 'Newest' },
          { value: 'popular', label: 'Most cited' },
          { value: 'relevant', label: 'Best match' },
        ];

  const renderItems = (k: FeedKind, items: FeedItem[]) =>
    items.map((item) => (
      <ItemCard
        key={item.id}
        label={item.label}
        meta={
          k === 'studies'
            ? `${formatDay(item.date)}${item.cited ? ` · cited ${item.cited}×` : ''}`
            : k === 'trials'
              ? `Posted ${formatDay(item.date)}`
              : formatDay(item.date)
        }
        title={item.title}
        source={item.source}
        detail={item.detail}
        mentions={mentions(`${item.title} ${item.detail ?? ''}`, personal)}
        url={item.url}
        saved={savedIds.has(item.id)}
        onToggleSave={() => onToggleSave(item)}
        pmid={item.pmid}
      />
    ));

  const renderSection = (k: FeedKind) => {
    const section = sections[k];
    const preview = kind === 'all';
    const items = section?.items ?? [];
    const shown = preview ? items.slice(0, PREVIEW[k]) : items;
    return (
      <View key={k} style={styles.section}>
        {preview && (
          <SectionHeading
            title={KIND_LABEL[k]}
            action={items.length > 0 ? <PillButton label="See all ›" onPress={() => setKind(k)} /> : undefined}
          />
        )}
        {k === 'trials' && section?.status === 'ready' && (
          <ThemedText type="small" themeColor="textSecondary">
            {section.near ? `Recruiting within about 150 miles of ${section.near}.` : 'Recruiting now, anywhere.'}
          </ThemedText>
        )}
        {k === 'studies' && section?.status === 'ready' && !preview && section.total !== undefined && (
          <ThemedText type="small" themeColor="textSecondary">
            {section.total.toLocaleString()} matching {section.total === 1 ? 'study' : 'studies'}
            {section.total > items.length ? `, showing the top ${items.length}` : ''}.
          </ThemedText>
        )}
        {k === 'studies' && section?.status === 'ready' && section.backup && (
          <ThemedText type="small" themeColor="textSecondary">
            Citation counts are briefly unavailable, so these are sorted by best match instead.
          </ThemedText>
        )}
        {section?.status === 'loading' && items.length === 0 && (
          <View style={styles.loading}>
            <ActivityIndicator />
            <ThemedText type="small" themeColor="textSecondary">
              Checking{' '}
              {k === 'studies' ? 'PubMed' : k === 'news' ? 'the Lupus Research Alliance' : 'ClinicalTrials.gov'}…
            </ThemedText>
          </View>
        )}
        {section?.status === 'error' && (
          <Notice>
            Couldn&apos;t load {KIND_LABEL[k].toLowerCase()}: {section.message} Pull down to try again.
          </Notice>
        )}
        {section?.status === 'ready' && items.length === 0 && (
          <Notice>
            {k === 'trials' && section.near
              ? 'No recruiting lupus trials match within about 150 miles.'
              : `Nothing matches these filters${time === 'month' ? ' in the last month' : ''}. Try a longer time range or another topic.`}
          </Notice>
        )}
        {k === 'trials' && section?.status === 'ready' && section.near && items.length === 0 && (
          <PillButton label="Show trials anywhere" onPress={() => setTrialsAnywhere(true)} />
        )}
        {renderItems(k, shown)}
      </View>
    );
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            setRefreshTick((t) => t + 1);
          }}
          tintColor={theme.accent}
        />
      }>
      <View style={styles.inner}>
        <View style={styles.header}>
          <View style={styles.flex}>
            <ThemedText type="subtitle">News</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Live from PubMed, the Lupus Research Alliance, and ClinicalTrials.gov
            </ThemedText>
          </View>
          <PillButton label="Preferences" onPress={onEditPrefs} />
        </View>

        <View style={styles.filters}>
          <ChipRow<Kind>
            label="Show"
            options={[
              { value: 'all', label: 'All' },
              { value: 'studies', label: 'Studies' },
              ...(NEWS_AVAILABLE ? [{ value: 'news' as const, label: 'News' }] : []),
              { value: 'trials', label: 'Trials' },
            ]}
            value={kind}
            onChange={setKind}
          />
          <ChipRow label="Topic" options={topicOptions} value={topic} onChange={setTopic} />
          <FilterToggle
            open={moreFilters}
            onPress={() => setMoreFilters((v) => !v)}
            summary={[
              TIME_LABEL[time],
              kind === 'news' ? null : sortOptions.find((o) => o.value === effectiveSort)?.label,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
          {moreFilters && (
            <ChipRow<TimeRange>
              label={kind === 'trials' ? 'Posted' : 'Published'}
              options={[
                { value: 'month', label: 'Last month' },
                { value: 'year', label: 'Last year' },
                { value: 'all', label: 'All time' },
              ]}
              value={time}
              onChange={setTime}
            />
          )}
          {moreFilters && kind !== 'news' && (
            <ChipRow label="Sort" options={sortOptions} value={effectiveSort} onChange={setSort} />
          )}
          {effectiveSort === 'popular' && time === 'month' && (
            <ThemedText type="small" themeColor="textSecondary">
              Brand-new studies haven&apos;t been cited yet, so Most cited works best with Last year or All time.
            </ThemedText>
          )}
          {effectiveSort === 'popular' && kind === 'all' && (
            <ThemedText type="small" themeColor="textSecondary">
              Most cited sorts studies. News and trials stay newest first.
            </ThemedText>
          )}
        </View>

        {!NEWS_AVAILABLE && kind === 'all' && (
          <Notice>Research news from the Lupus Research Alliance shows in the phone app.</Notice>
        )}
        {kinds.map(renderSection)}

        <Notice>
          New research isn&apos;t a change in treatment. Early and small studies often don&apos;t hold up. Bring
          questions to your rheumatologist.
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
  section: { gap: Spacing.two + 2 },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
});
