import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { createMessage, SCAN_MODEL } from '@/lib/ai';
import { loadHistory } from '@/lib/daily';
import { DEMO } from '@/lib/demo';
import { loadSavedPlace } from '@/lib/location';
import { loadMeds, shortName } from '@/lib/meds';

/**
 * News and Library: live lupus research (PubMed, with Europe PMC for citation counts), news from the Lupus
 * Research Alliance, recruiting trials from ClinicalTrials.gov, and a hand-picked library of
 * articles from established medical sources. All free, no API keys.
 */

// ---------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------

export type TopicId =
  | 'treatments'
  | 'meds'
  | 'basics'
  | 'labs'
  | 'kidney'
  | 'skin'
  | 'heart'
  | 'diet'
  | 'daily'
  | 'mental'
  | 'pregnancy'
  | 'related';

export type Topic = {
  id: TopicId;
  label: string;
  /** Words searched in study titles and keywords. Empty: not a News topic. */
  terms: string[];
  /** Extra search words for ClinicalTrials.gov, if the topic narrows trials. */
  trialTerm?: string;
  /** Shown in the Library. */
  library: boolean;
};

export const TOPICS: Topic[] = [
  {
    id: 'treatments',
    label: 'New treatments',
    terms: [
      'trial',
      'efficacy',
      'therapy',
      'CAR-T',
      'CAR T',
      'belimumab',
      'anifrolumab',
      'voclosporin',
      'obinutuzumab',
      'approval',
    ],
    library: false,
  },
  {
    id: 'meds',
    label: 'Medications',
    terms: ['hydroxychloroquine', 'mycophenolate', 'glucocorticoid', 'prednisone', 'steroid', 'immunosuppressant'],
    library: true,
  },
  { id: 'basics', label: 'Lupus basics', terms: [], library: true },
  { id: 'labs', label: 'Lab tests', terms: [], library: true },
  {
    id: 'kidney',
    label: 'Kidneys',
    terms: ['nephritis', 'kidney', 'renal'],
    trialTerm: 'nephritis',
    library: true,
  },
  {
    id: 'skin',
    label: 'Skin and sun',
    terms: ['skin', 'cutaneous', 'rash', 'photosensitivity', 'ultraviolet'],
    trialTerm: 'cutaneous',
    library: true,
  },
  {
    id: 'heart',
    label: 'Heart and blood vessels',
    terms: ['cardiovascular', 'heart', 'myocardial', 'atherosclerosis', 'hypertension'],
    library: true,
  },
  {
    id: 'diet',
    label: 'Food and nutrition',
    terms: ['diet', 'nutrition', 'vitamin D', 'obesity', 'exercise', 'physical activity'],
    library: true,
  },
  {
    id: 'daily',
    label: 'Fatigue and daily life',
    terms: ['fatigue', 'sleep', 'pain', 'quality of life', 'work'],
    library: true,
  },
  {
    id: 'mental',
    label: 'Mental health',
    terms: ['depression', 'anxiety', 'mental health', 'cognitive', 'psychiatric'],
    library: true,
  },
  {
    id: 'pregnancy',
    label: 'Pregnancy',
    terms: ['pregnancy', 'pregnant', 'fertility', 'contraception'],
    trialTerm: 'pregnancy',
    library: true,
  },
  {
    id: 'related',
    label: 'Related conditions',
    terms: ['Raynaud', 'Sjogren', 'Sjögren', 'antiphospholipid', 'fibromyalgia', 'thyroid'],
    library: true,
  },
];

export const topicLabel = (id: TopicId) => TOPICS.find((t) => t.id === id)?.label ?? id;
export const NEWS_TOPICS = TOPICS.filter((t) => t.terms.length > 0);
export const LIBRARY_TOPICS = TOPICS.filter((t) => t.library);

// ---------------------------------------------------------------------------
// Preferences (asked the first time you open News or Library)
// ---------------------------------------------------------------------------

export type FeedKind = 'studies' | 'news' | 'trials';

export type LearnSection = 'news' | 'library';

export type LearnPrefs = {
  /** Whether each section's first-time setup is done. */
  newsSetUp: boolean;
  librarySetUp: boolean;
  /** Shared by both: "My topics" in News and "For you" in Library. */
  topics: TopicId[];
  // News only

  kinds: FeedKind[];
  /** 'patient': studies about people with lupus (trials, reviews, guidelines). 'all' adds lab research. */
  depth: 'patient' | 'all';
  /** Show trials within about 150 miles first. */
  trialsNearMe: boolean;
  // Library only
  /** The Library's starting length filter. */
  libraryLength: 'any' | 'quick' | 'long';
};

const PREFS_KEY = 'mylupus.learnPrefs';
const DEFAULT_PREFS: LearnPrefs = {
  newsSetUp: false,
  librarySetUp: false,
  topics: [],
  kinds: ['studies', 'news', 'trials'],
  depth: 'patient',
  trialsNearMe: true,
  libraryLength: 'any',
};

export async function loadPrefs(): Promise<LearnPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    const saved: Partial<LearnPrefs> & { setUp?: boolean } = raw ? JSON.parse(raw) : {};
    // Earlier versions had one setup for both sections.
    if (saved.setUp && saved.newsSetUp === undefined) {
      saved.newsSetUp = true;
      saved.librarySetUp = true;
    }
    delete saved.setUp;
    return { ...DEFAULT_PREFS, ...saved };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function savePrefs(prefs: LearnPrefs) {
  try {
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Not fatal.
  }
}

// ---------------------------------------------------------------------------
// "Related to you": your medications and other conditions
// ---------------------------------------------------------------------------

export type Personal = {
  /** Every search word: brand and generic names of your meds, and your other conditions. */
  terms: string[];
  /** The same words grouped per medication or condition, so "Plaquenil" and "hydroxychloroquine" count once. */
  groups: string[][];
  suggestedTopics: TopicId[];
};

export const EMPTY_PERSONAL: Personal = {
  terms: [],
  groups: [],
  suggestedTopics: [],
};

/** Words from your medication list and health history, to tag and find items related to you. */
export async function loadPersonal(): Promise<Personal> {
  const [meds, history] = await Promise.all([loadMeds(), loadHistory()]);
  const groups: string[][] = [];
  for (const m of meds) {
    const generic = m.name.match(/\(([^)]+)\)/)?.[1]?.split(' ')[0];
    groups.push([shortName(m.name), ...(generic ? [generic] : [])].filter((t) => t.length > 2));
  }
  const other = history.otherConditions ?? '';
  const conditions: string[][] = [
    ['Raynaud'],
    ['Sjögren', 'Sjogren'],
    ['antiphospholipid'],
    ['fibromyalgia'],
    ['thyroid'],
    ['nephritis'],
  ];
  for (const words of conditions) {
    if (words.some((w) => other.toLowerCase().includes(w.toLowerCase()))) groups.push(words);
  }
  const suggested: TopicId[] = ['treatments'];
  if (meds.length) suggested.push('meds');
  if (/raynaud|sj[oö]gren|antiphospholipid|fibromyalgia|thyroid/i.test(other)) suggested.push('related');
  if (/nephritis|kidney/i.test(other)) suggested.push('kidney');
  const kept = groups.filter((g) => g.length > 0);
  return {
    terms: [...new Set(kept.flat())],
    groups: kept,
    suggestedTopics: suggested,
  };
}

/** Which of your terms appear in some text. */
function matches(text: string, terms: string[]): string[] {
  const lower = text.toLowerCase();
  return terms.filter((t) => lower.includes(t.toLowerCase()));
}

/** Which of your medications or conditions an item mentions, one name each (e.g. ["Plaquenil"]). */
export function mentions(text: string, personal: Personal): string[] {
  return personal.groups.filter((g) => matches(text, g).length > 0).map((g) => g[0]);
}

// ---------------------------------------------------------------------------
// Feed items
// ---------------------------------------------------------------------------

export type FeedItem = {
  id: string;
  kind: FeedKind;
  title: string;
  url: string;
  source: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** e.g. "Clinical trial", "Review", "Recruiting · Phase 2". */
  label: string;
  /** Times other papers cited this one (studies only). */
  cited?: number;
  /** One line under the title, e.g. the nearest trial site. */
  detail?: string;
  /** PubMed ID, for "Explain this study". */
  pmid?: string;
};

export type TimeRange = 'month' | 'year' | 'all';
export type SortBy = 'newest' | 'popular' | 'relevant';

export type NewsQuery = {
  /** A topic id, 'mine' (your topics), 'related' (your meds and conditions), or 'all'. */
  topic: TopicId | 'mine' | 'personal' | 'all';
  time: TimeRange;
  sort: SortBy;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
function since(range: TimeRange): string | null {
  if (range === 'all') return null;
  const d = new Date();
  if (range === 'month') d.setMonth(d.getMonth() - 1);
  else d.setFullYear(d.getFullYear() - 1);
  return iso(d);
}

const cleanTitle = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#8217;|&rsquo;/g, '’')
    .replace(/&#8216;|&lsquo;/g, '‘')
    .replace(/&#8220;|&ldquo;/g, '“')
    .replace(/&#8221;|&rdquo;/g, '”')
    .replace(/&#8211;|&ndash;/g, '–')
    .replace(/&#8212;|&mdash;/g, '—')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\.$/, '')
    .trim();

/** Terms for the query's topic; null means all of lupus. */
function topicTerms(q: NewsQuery, prefs: LearnPrefs, personal: Personal): string[] | null {
  if (q.topic === 'all') return null;
  if (q.topic === 'personal') return personal.terms.length ? personal.terms : null;
  if (q.topic === 'mine') {
    const terms = prefs.topics.flatMap((id) => TOPICS.find((t) => t.id === id)?.terms ?? []);
    return terms.length ? terms : null;
  }
  return TOPICS.find((t) => t.id === q.topic)?.terms ?? null;
}

const quote = (t: string) => `"${t.replace(/"/g, '')}"`;

async function getJSON<T>(url: string, timeoutMs = 20000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res = await fetch(url, { signal: controller.signal });
    // PubMed allows about 3 requests a second; wait a moment and try once more.
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1200));
      res = await fetch(url, { signal: controller.signal });
    }
    if (!res.ok) throw new Error(`The source returned an error (${res.status}).`);
    return (await res.json()) as T;
  } catch (e) {
    if (controller.signal.aborted) throw new Error('The source took too long to answer. Try again.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// --- Studies (PubMed, and Europe PMC for citation counts) --------------------

const STUDY_TYPES: [RegExp, string][] = [
  [/practice guideline|^guideline/, 'Guideline'],
  [/meta-analysis/, 'Meta-analysis'],
  [/randomized controlled trial/, 'Randomized trial'],
  [/clinical trial, phase iii/, 'Phase 3 trial'],
  [/clinical trial, phase ii\b/, 'Phase 2 trial'],
  [/clinical trial/, 'Clinical trial'],
  [/systematic review/, 'Systematic review'],
  [/review/, 'Review'],
  [/multicenter study|cohort/, 'Large study'],
];

function studyLabel(pubTypes: string): string {
  const types = pubTypes
    .toLowerCase()
    .split(';')
    .map((s) => s.trim());
  for (const [re, label] of STUDY_TYPES) if (types.some((t) => re.test(t))) return label;
  return 'Study';
}

export type StudyResults = {
  items: FeedItem[];
  total: number;
  /** Set when "Most cited" was asked for but Europe PMC was down, so PubMed answered by best match. */
  backup?: boolean;
};

/**
 * Studies come from PubMed (US National Library of Medicine), the most dependable source. Only
 * "Most cited" uses Europe PMC, the one free source with citation counts; if it's down, PubMed
 * answers by best match instead. Each source backs up the other.
 */
export async function fetchStudies(
  q: NewsQuery,
  prefs: LearnPrefs,
  personal: Personal,
  pageSize = 25,
): Promise<StudyResults> {
  if (q.sort === 'popular') {
    try {
      return await fetchStudiesEuropePmc(q, prefs, personal, pageSize);
    } catch {
      return { ...(await fetchStudiesPubMed(q, prefs, personal, pageSize)), backup: true };
    }
  }
  try {
    return await fetchStudiesPubMed(q, prefs, personal, pageSize);
  } catch {
    return fetchStudiesEuropePmc(q, prefs, personal, pageSize);
  }
}

async function fetchStudiesPubMed(
  q: NewsQuery,
  prefs: LearnPrefs,
  personal: Personal,
  pageSize: number,
): Promise<StudyResults> {
  const parts = [
    '(lupus[ti] OR SLE[ti])',
    'NOT (mice[ti] OR murine[ti] OR mouse[ti] OR rats[ti] OR "in vitro"[ti] OR "experimental lupus"[ti] OR zebrafish[ti])',
    'NOT ("case reports"[pt] OR letter[pt] OR comment[pt] OR "published erratum"[pt])',
  ];
  if (prefs.depth === 'patient') {
    parts.push(
      '("clinical trial"[pt] OR "randomized controlled trial"[pt] OR "meta-analysis"[pt] OR "systematic review"[pt] OR "practice guideline"[pt] OR guideline[pt] OR patients[ti] OR "people with"[ti] OR "women with"[ti] OR cohort[ti])',
    );
  }
  const terms = topicTerms(q, prefs, personal);
  if (terms) parts.push(`(${terms.flatMap((t) => [`${quote(t)}[ti]`, `${quote(t)}[ot]`]).join(' OR ')})`);
  const search = new URLSearchParams({
    db: 'pubmed',
    term: parts.join(' AND ').replace(/ AND NOT /g, ' NOT '),
    retmode: 'json',
    retmax: String(pageSize),
  });
  // Newest: PubMed's default order (most recently added). Otherwise best match.
  if (q.sort !== 'newest') search.set('sort', 'relevance');
  if (q.time !== 'all') {
    search.set('datetype', 'edat');
    search.set('reldate', q.time === 'month' ? '31' : '365');
  }
  const found = await getJSON<{ esearchresult: { count: string; idlist: string[] } }>(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${search}`,
  );
  const ids = found.esearchresult.idlist;
  if (ids.length === 0) return { items: [], total: 0 };
  type Summary = {
    uid: string;
    title: string;
    source: string;
    fulljournalname?: string;
    pubdate: string;
    epubdate?: string;
    pubtype: string[];
  };
  const summary = await getJSON<{ result: Record<string, Summary> & { uids: string[] } }>(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`,
  );
  const items = summary.result.uids.map((uid): FeedItem => {
    const r = summary.result[uid] as unknown as Summary;
    return {
      id: `study-${uid}`,
      kind: 'studies',
      title: cleanTitle(r.title),
      url: `https://pubmed.ncbi.nlm.nih.gov/${uid}/`,
      source: r.fulljournalname || r.source || 'PubMed',
      date: pubmedDate(r.epubdate || r.pubdate),
      label: studyLabel(r.pubtype.join(';')),
      pmid: uid,
    };
  });
  // PubMed's "newest" means most recently added; show them by publication date.
  if (q.sort === 'newest') items.sort((a, b) => b.date.localeCompare(a.date));
  return { items, total: Number(found.esearchresult.count) };
}

const MONTH_NUMBERS: Record<string, string> = {
  Jan: '01',
  Feb: '02',
  Mar: '03',
  Apr: '04',
  May: '05',
  Jun: '06',
  Jul: '07',
  Aug: '08',
  Sep: '09',
  Oct: '10',
  Nov: '11',
  Dec: '12',
};

/** "2026 Nov 14" or "2026 Dec" -> "2026-11-14" / "2026-12-01". */
function pubmedDate(s: string): string {
  const [y, m, d] = s.split(' ');
  if (!y) return '';
  return `${y}-${MONTH_NUMBERS[m?.slice(0, 3)] ?? '01'}-${(d ?? '1').padStart(2, '0')}`;
}

async function fetchStudiesEuropePmc(
  q: NewsQuery,
  prefs: LearnPrefs,
  personal: Personal,
  pageSize: number,
): Promise<StudyResults> {
  const parts = [
    '(TITLE:"lupus" OR TITLE:"SLE")',
    'SRC:MED',
    'NOT (TITLE:"mice" OR TITLE:"murine" OR TITLE:"mouse" OR TITLE:"rats" OR TITLE:"in vitro" OR TITLE:"experimental lupus" OR TITLE:"zebrafish")',
    'NOT (PUB_TYPE:"case reports" OR PUB_TYPE:"case-report" OR PUB_TYPE:"case-study" OR PUB_TYPE:"letter" OR PUB_TYPE:"comment" OR PUB_TYPE:"erratum")',
  ];
  if (prefs.depth === 'patient') {
    parts.push(
      '(PUB_TYPE:"clinical trial" OR PUB_TYPE:"randomized controlled trial" OR PUB_TYPE:"meta-analysis" OR PUB_TYPE:"systematic review" OR PUB_TYPE:"practice guideline" OR PUB_TYPE:"guideline" OR TITLE:"patients" OR TITLE:"people with" OR TITLE:"women with" OR TITLE:"cohort")',
    );
  }
  const terms = topicTerms(q, prefs, personal);
  if (terms) parts.push(`(${terms.flatMap((t) => [`TITLE:${quote(t)}`, `KW:${quote(t)}`]).join(' OR ')})`);
  const from = since(q.time);
  if (from) parts.push(`FIRST_PDATE:[${from} TO ${iso(new Date())}]`);

  const params = new URLSearchParams({
    query: parts.join(' AND ').replace(/ AND NOT /g, ' NOT '),
    format: 'json',
    pageSize: String(pageSize),
    resultType: 'lite',
  });
  if (q.sort === 'newest') params.set('sort', 'FIRST_PDATE_D desc');
  if (q.sort === 'popular') params.set('sort', 'CITED desc');

  type Result = {
    id: string;
    pmid?: string;
    doi?: string;
    title: string;
    journalTitle?: string;
    firstPublicationDate?: string;
    citedByCount?: number;
    pubType?: string;
  };
  const data = await getJSON<{
    hitCount: number;
    resultList: { result: Result[] };
  }>(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?${params}`);
  const items = data.resultList.result.map(
    (r): FeedItem => ({
      id: `study-${r.id}`,
      kind: 'studies',
      title: cleanTitle(r.title),
      url: r.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/` : `https://europepmc.org/article/MED/${r.id}`,
      source: r.journalTitle ?? 'PubMed',
      date: r.firstPublicationDate ?? '',
      label: studyLabel(r.pubType ?? ''),
      cited: r.citedByCount ?? 0,
      pmid: r.pmid,
    }),
  );
  return { items, total: data.hitCount };
}

// --- News (Lupus Research Alliance) ----------------------------------------

/** The Lupus Research Alliance's news feed. Phone only: their site doesn't allow browser requests. */
export const NEWS_AVAILABLE = Platform.OS !== 'web';

export async function fetchNews(q: NewsQuery, prefs: LearnPrefs, personal: Personal): Promise<FeedItem[]> {
  if (!NEWS_AVAILABLE) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let xml: string;
  try {
    const res = await fetch('https://www.lupusresearch.org/feed/', {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`The news source returned an error (${res.status}).`);
    xml = await res.text();
  } finally {
    clearTimeout(timer);
  }
  const from = since(q.time);
  const terms = topicTerms(q, prefs, personal);
  const items: FeedItem[] = [];
  for (const block of xml.split('<item>').slice(1)) {
    const tag = (name: string) =>
      block.match(new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`))?.[1]?.trim() ?? '';
    const categories = [...block.matchAll(/<category>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/category>/g)].map(
      (m) => m[1],
    );
    // Skip fundraising events (galas, races); keep research news, press releases, and stories.
    if (categories.includes('Event') && !categories.includes('Research News')) continue;
    const title = cleanTitle(tag('title'));
    const description = cleanTitle(tag('description'));
    const date = iso(new Date(tag('pubDate')));
    if (from && date < from) continue;
    if (terms && !matches(`${title} ${description}`, terms).length) continue;
    items.push({
      id: `news-${tag('link')}`,
      kind: 'news',
      title,
      url: tag('link'),
      source: 'Lupus Research Alliance',
      date,
      label: categories.includes('Research News')
        ? 'Research news'
        : categories.includes('Story')
          ? 'Patient story'
          : 'News',
      detail: description.replace(/The post .*$/, '').slice(0, 160),
    });
  }
  return items;
}

// --- Trials (ClinicalTrials.gov) -------------------------------------------

export async function fetchTrials(
  q: NewsQuery,
  prefs: LearnPrefs,
  personal: Personal,
  nearMe: boolean,
): Promise<{ items: FeedItem[]; near: string | null }> {
  const params = new URLSearchParams({
    'query.cond': 'lupus',
    'filter.overallStatus': 'RECRUITING',
    pageSize: '20',
    sort: q.sort === 'newest' ? 'StudyFirstPostDate:desc' : 'LastUpdatePostDate:desc',
    fields:
      'NCTId,BriefTitle,Phase,LeadSponsorName,StudyFirstPostDate,LocationCity,LocationState,LocationCountry,LocationGeoPoint',
  });
  const topic =
    q.topic !== 'all' && q.topic !== 'mine' && q.topic !== 'personal' ? TOPICS.find((t) => t.id === q.topic) : null;
  if (topic?.trialTerm) params.set('query.term', topic.trialTerm);
  if (q.topic === 'personal' && personal.terms.length)
    params.set('query.intr', personal.terms.slice(0, 4).join(' OR '));
  const from = since(q.time);
  if (from) params.set('filter.advanced', `AREA[StudyFirstPostDate]RANGE[${from},MAX]`);
  const place = nearMe ? await loadSavedPlace() : null;
  if (place) params.set('filter.geo', `distance(${place.latitude.toFixed(3)},${place.longitude.toFixed(3)},150mi)`);

  type Loc = {
    city?: string;
    state?: string;
    country?: string;
    geoPoint?: { lat: number; lon: number };
  };
  type Study = {
    protocolSection: {
      identificationModule: { nctId: string; briefTitle: string };
      statusModule: { studyFirstPostDateStruct?: { date: string } };
      designModule?: { phases?: string[] };
      sponsorCollaboratorsModule?: { leadSponsor?: { name: string } };
      contactsLocationsModule?: { locations?: Loc[] };
    };
  };
  const data = await getJSON<{ studies: Study[] }>(`https://clinicaltrials.gov/api/v2/studies?${params}`);
  const distance = (l: Loc) => {
    if (!place || !l.geoPoint) return Infinity;
    const rad = (d: number) => (d * Math.PI) / 180;
    const dLat = rad(l.geoPoint.lat - place.latitude);
    const dLon = rad(l.geoPoint.lon - place.longitude);
    const h =
      Math.sin(dLat / 2) ** 2 + Math.cos(rad(place.latitude)) * Math.cos(rad(l.geoPoint.lat)) * Math.sin(dLon / 2) ** 2;
    return 3959 * 2 * Math.asin(Math.sqrt(h));
  };
  const items = data.studies.map((s): FeedItem => {
    const p = s.protocolSection;
    const locations = p.contactsLocationsModule?.locations ?? [];
    const nearest = [...locations].sort((a, b) => distance(a) - distance(b))[0];
    const miles = nearest ? distance(nearest) : Infinity;
    const where = nearest
      ? `${[nearest.city, nearest.state ?? nearest.country].filter(Boolean).join(', ')}${Number.isFinite(miles) ? ` (${Math.round(miles)} mi)` : ''}${locations.length > 1 ? ` + ${locations.length - 1} more sites` : ''}`
      : 'Location not listed';
    const phase = (p.designModule?.phases ?? [])
      .filter((ph) => ph !== 'NA')
      .map((ph) => ph.replace('EARLY_PHASE1', 'Early phase 1').replace(/PHASE(\d)/, 'Phase $1'))
      .join('/');
    return {
      id: `trial-${p.identificationModule.nctId}`,
      kind: 'trials',
      title: cleanTitle(p.identificationModule.briefTitle),
      url: `https://clinicaltrials.gov/study/${p.identificationModule.nctId}`,
      source: p.sponsorCollaboratorsModule?.leadSponsor?.name ?? 'ClinicalTrials.gov',
      date: p.statusModule.studyFirstPostDateStruct?.date ?? '',
      label: ['Recruiting', phase].filter(Boolean).join(' · '),
      detail: where,
    };
  });
  return { items, near: place ? (place.name ?? 'you') : null };
}

// ---------------------------------------------------------------------------
// Cache: show the last results right away, refresh in the background
// ---------------------------------------------------------------------------

const CACHE_KEY = 'mylupus.learnCache';
type CacheEntry = { at: number; value: unknown };

export async function readCache<T>(key: string): Promise<{ at: number; value: T } | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    const all: Record<string, CacheEntry> = raw ? JSON.parse(raw) : {};
    return (all[key] as { at: number; value: T }) ?? null;
  } catch {
    return null;
  }
}

export async function writeCache(key: string, value: unknown) {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    const all: Record<string, CacheEntry> = raw ? JSON.parse(raw) : {};
    all[key] = { at: Date.now(), value };
    // Keep the 20 most recent queries.
    const kept = Object.entries(all)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, 20);
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Caching is a bonus.
  }
}

// ---------------------------------------------------------------------------
// Saved items (studies, news, trials, and library articles)
// ---------------------------------------------------------------------------

export type SavedItem = {
  id: string;
  title: string;
  url: string;
  source: string;
  label: string;
  savedAt: number;
};
const SAVED_KEY = 'mylupus.learnSaved';

export async function loadSaved(): Promise<SavedItem[]> {
  try {
    const raw = await AsyncStorage.getItem(SAVED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function toggleSaved(item: Omit<SavedItem, 'savedAt'>): Promise<SavedItem[]> {
  const saved = await loadSaved();
  const next = saved.some((s) => s.id === item.id)
    ? saved.filter((s) => s.id !== item.id)
    : [{ ...item, savedAt: Date.now() }, ...saved];
  try {
    await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(next));
  } catch {
    // Not fatal.
  }
  return next;
}

// ---------------------------------------------------------------------------
// "Explain this study" (Claude Haiku, on request)
// ---------------------------------------------------------------------------

const EXPLAIN_KEY = 'mylupus.studyExplanations';

/** A study's abstract, from PubMed or (if it's down) Europe PMC. */
async function fetchAbstract(pmid: string): Promise<string> {
  // PubMed first: the abstract's labeled sections (Background, Methods, Results...) as plain text.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml`,
      { signal: controller.signal },
    );
    if (res.ok) {
      const xml = await res.text();
      const parts = [...xml.matchAll(/<AbstractText([^>]*)>([\s\S]*?)<\/AbstractText>/g)].map(([, attrs, text]) => {
        const label = attrs.match(/Label="([^"]+)"/)?.[1];
        return `${label ? `${label}: ` : ''}${cleanTitle(text)}`;
      });
      if (parts.length) return parts.join('\n');
    }
  } catch {
    // Try Europe PMC.
  } finally {
    clearTimeout(timer);
  }
  try {
    const data = await getJSON<{ resultList: { result: { abstractText?: string }[] } }>(
      `https://www.ebi.ac.uk/europepmc/webservices/rest/search?${new URLSearchParams({
        query: `EXT_ID:${pmid} AND SRC:MED`,
        format: 'json',
        resultType: 'core',
      })}`,
    );
    return cleanTitle(data.resultList.result[0]?.abstractText ?? '');
  } catch {
    return '';
  }
}

export async function explainStudy(pmid: string, title: string): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem(EXPLAIN_KEY);
    const cached: Record<string, string> = raw ? JSON.parse(raw) : {};
    if (cached[pmid]) return cached[pmid];
  } catch {
    // Fall through and ask.
  }
  if (DEMO) {
    return 'In the full app, Claude reads the study’s abstract and explains in plain English what was studied, what was found, who it applies to, and how strong the evidence is.';
  }
  const abstract = await fetchAbstract(pmid);
  if (!abstract) throw new Error('This study has no abstract to explain. Open it to read more.');

  const response = await createMessage({
    model: SCAN_MODEL,
    max_tokens: 500,
    system:
      'You explain medical research to a college student who has lupus. Use plain, warm language and short sentences. ' +
      'Write four short labeled parts: "What they studied", "What they found", "Who it applies to", and "How strong is this" ' +
      '(study type and size; early, small, or lab results are preliminary). Then one line: "Worth asking your rheumatologist about" ' +
      'with a question, if relevant. Never give personal medical advice or suggest changing treatment. Under 170 words. No markdown symbols.',
    messages: [{ role: 'user', content: `Title: ${title}\n\nAbstract: ${abstract}` }],
  });
  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
    .trim();
  try {
    const raw = await AsyncStorage.getItem(EXPLAIN_KEY);
    const cached: Record<string, string> = raw ? JSON.parse(raw) : {};
    cached[pmid] = text;
    await AsyncStorage.setItem(EXPLAIN_KEY, JSON.stringify(cached));
  } catch {
    // Not fatal.
  }
  return text;
}
