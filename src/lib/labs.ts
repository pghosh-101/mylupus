import AsyncStorage from '@react-native-async-storage/async-storage';

import { newId } from '@/lib/meds';

/**
 * Common lupus labs with typical adult reference ranges. Ranges vary by lab and assay,
 * so every result stores its own range, pre-filled from here and editable.
 */
export type LabTest = {
  key: string;
  name: string;
  unit: string;
  low: number | null;
  high: number | null;
  /** Plain-language context. Careful wording: these are signals to discuss, not diagnoses. */
  about: string;
  group: 'Lupus activity' | 'Blood counts' | 'Kidneys' | 'Liver' | 'Other';
};

export const LAB_TESTS: LabTest[] = [
  {
    key: 'c3',
    name: 'C3',
    unit: 'mg/dL',
    low: 90,
    high: 180,
    group: 'Lupus activity',
    about: 'A complement protein. Low C3 can mean lupus is more active, because complement gets used up during inflammation.',
  },
  {
    key: 'c4',
    name: 'C4',
    unit: 'mg/dL',
    low: 10,
    high: 40,
    group: 'Lupus activity',
    about: 'Another complement protein. Like C3, falling levels can go along with more lupus activity.',
  },
  {
    key: 'dsdna',
    name: 'Anti-dsDNA',
    unit: 'IU/mL',
    low: null,
    high: 30,
    group: 'Lupus activity',
    about: 'An antibody fairly specific to lupus. Rising levels can come before or during flares, especially kidney involvement. Ranges differ a lot between labs.',
  },
  {
    key: 'esr',
    name: 'ESR (sed rate)',
    unit: 'mm/hr',
    low: null,
    high: 20,
    group: 'Lupus activity',
    about: 'A general marker of inflammation. It can rise with lupus activity, infection, or other causes.',
  },
  {
    key: 'crp',
    name: 'CRP',
    unit: 'mg/L',
    low: null,
    high: 10,
    group: 'Lupus activity',
    about: 'Another inflammation marker. In lupus it often stays fairly normal, so a high CRP can point to infection instead.',
  },
  {
    key: 'wbc',
    name: 'White blood cells',
    unit: 'K/µL',
    low: 4.5,
    high: 11,
    group: 'Blood counts',
    about: 'Lupus and medications like CellCept can lower white cells, which affects how well you fight infections.',
  },
  {
    key: 'lymph',
    name: 'Lymphocytes',
    unit: 'K/µL',
    low: 1.0,
    high: 4.8,
    group: 'Blood counts',
    about: 'A type of white blood cell that is often low in lupus.',
  },
  {
    key: 'hgb',
    name: 'Hemoglobin',
    unit: 'g/dL',
    low: 12,
    high: 17.5,
    group: 'Blood counts',
    about: 'Carries oxygen. Low hemoglobin (anemia) can cause fatigue and is common in lupus.',
  },
  {
    key: 'plt',
    name: 'Platelets',
    unit: 'K/µL',
    low: 150,
    high: 400,
    group: 'Blood counts',
    about: 'Help blood clot. Lupus can sometimes lower platelets.',
  },
  {
    key: 'upcr',
    name: 'Urine protein/creatinine',
    unit: 'g/g',
    low: null,
    high: 0.2,
    group: 'Kidneys',
    about: 'Protein in the urine. Rising levels can be an early sign of lupus affecting the kidneys.',
  },
  {
    key: 'creat',
    name: 'Creatinine',
    unit: 'mg/dL',
    low: 0.6,
    high: 1.3,
    group: 'Kidneys',
    about: 'A waste product filtered by the kidneys. Rising creatinine can mean the kidneys are filtering less well.',
  },
  {
    key: 'egfr',
    name: 'eGFR',
    unit: 'mL/min',
    low: 60,
    high: null,
    group: 'Kidneys',
    about: 'An estimate of kidney filtering. Higher is better; a drop is worth discussing.',
  },
  {
    key: 'alt',
    name: 'ALT',
    unit: 'U/L',
    low: 7,
    high: 56,
    group: 'Liver',
    about: 'A liver enzyme, often checked to monitor medication side effects.',
  },
  {
    key: 'ast',
    name: 'AST',
    unit: 'U/L',
    low: 10,
    high: 40,
    group: 'Liver',
    about: 'Another liver enzyme checked to monitor medications.',
  },
  {
    key: 'vitd',
    name: 'Vitamin D',
    unit: 'ng/mL',
    low: 30,
    high: 100,
    group: 'Other',
    about: 'Often low in people with lupus, partly from avoiding the sun.',
  },
];

export const testFor = (key: string) => LAB_TESTS.find((t) => t.key === key);

export type LabResult = {
  id: string;
  /** A LAB_TESTS key, or "custom:<name>" for tests not in the list. */
  test: string;
  date: string;
  value: number;
  unit: string;
  low: number | null;
  high: number | null;
  note: string;
};

/** Display name for a test: your rename if you set one, otherwise the built-in name. */
export const labName = (test: string, names: Record<string, string> = nameOverrides) =>
  names[test] ?? defaultLabName(test);

const KEY = 'mylupus.labs';

export async function loadLabs(): Promise<LabResult[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LabResult[]) : [];
  } catch {
    return [];
  }
}

export async function saveLabs(labs: LabResult[]) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(labs));
  } catch {
    // Not fatal.
  }
}

export const newLabId = newId;

export type Flag = 'low' | 'high' | 'normal' | 'unknown';

export function flagFor(r: Pick<LabResult, 'value' | 'low' | 'high'>): Flag {
  if (r.low === null && r.high === null) return 'unknown';
  if (r.low !== null && r.value < r.low) return 'low';
  if (r.high !== null && r.value > r.high) return 'high';
  return 'normal';
}

export const FLAG_LABEL: Record<Flag, string> = { low: 'Low', high: 'High', normal: 'In range', unknown: '' };

/** Results grouped by test, oldest first within each. */
export function byTest(labs: LabResult[]): Map<string, LabResult[]> {
  const map = new Map<string, LabResult[]>();
  for (const r of [...labs].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!map.has(r.test)) map.set(r.test, []);
    map.get(r.test)!.push(r);
  }
  return map;
}

export function formatRange(low: number | null, high: number | null, unit: string): string {
  if (low !== null && high !== null) return `${low}–${high} ${unit}`;
  if (high !== null) return `under ${high} ${unit}`;
  if (low !== null) return `over ${low} ${unit}`;
  return 'no range set';
}

export function formatValue(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

// ---------------------------------------------------------------------------
// Doctor's notes per test
// ---------------------------------------------------------------------------

export type TestNote = {
  note: string;
  /** Your doctor has said the current level is acceptable, so don't flag it as a warning. */
  okForMe: boolean;
  /** When the note was last updated, "YYYY-MM-DD". */
  updated: string;
};

const NOTES_KEY = 'mylupus.labNotes';

export async function loadTestNotes(): Promise<Record<string, TestNote>> {
  try {
    const raw = await AsyncStorage.getItem(NOTES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function saveTestNote(test: string, note: TestNote | null) {
  const all = await loadTestNotes();
  if (note && (note.note.trim() || note.okForMe)) all[test] = note;
  else delete all[test];
  try {
    await AsyncStorage.setItem(NOTES_KEY, JSON.stringify(all));
  } catch {
    // Not fatal.
  }
}

/** A change of more than this (further out of range) is flagged even when the doctor said OK. */
const RISE_ALERT = 0.2;

/**
 * How to present a test's latest result, taking the doctor's note into account.
 * `tone`: 'alert' (orange), 'ok' (out of range but accepted), 'normal'.
 */
export function displayStatus(results: LabResult[], note?: TestNote) {
  const latest = results[results.length - 1];
  const prev = results[results.length - 2];
  const flag = flagFor(latest);
  const out = flag === 'low' || flag === 'high';

  // "Worsening" means moving further out of range in the direction it's already out.
  let worsening = false;
  if (prev && prev.value !== 0) {
    const change = (latest.value - prev.value) / Math.abs(prev.value);
    worsening = (flag === 'high' && change > RISE_ALERT) || (flag === 'low' && change < -RISE_ALERT);
  }

  // How to describe a worsening change: low values dropping, or high values rising.
  const trend = flag === 'low' ? 'Dropping since last test' : 'Rising since last test';
  if (!out) return { label: FLAG_LABEL[flag], tone: 'normal' as const, worsening: false, trend };
  if (note?.okForMe) {
    return {
      label: `${flag === 'high' ? 'Above' : 'Below'} range · Doctor says OK`,
      tone: worsening ? ('alert' as const) : ('ok' as const),
      worsening,
      trend,
    };
  }
  return { label: FLAG_LABEL[flag], tone: 'alert' as const, worsening, trend };
}

// ---------------------------------------------------------------------------
// Custom display names (rename any test)
// ---------------------------------------------------------------------------

const NAMES_KEY = 'mylupus.labNames';
let nameOverrides: Record<string, string> = {};

/** Load renamed tests; call before rendering lab names. */
export async function loadLabNames(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(NAMES_KEY);
    nameOverrides = raw ? JSON.parse(raw) : {};
  } catch {
    nameOverrides = {};
  }
  return nameOverrides;
}

export async function setLabName(test: string, name: string | null): Promise<Record<string, string>> {
  const next = { ...nameOverrides };
  if (name && name.trim() && name.trim() !== defaultLabName(test)) next[test] = name.trim();
  else delete next[test];
  nameOverrides = next;
  try {
    await AsyncStorage.setItem(NAMES_KEY, JSON.stringify(next));
  } catch {
    // Not fatal.
  }
  return next;
}

/** The built-in name, ignoring any rename. */
export const defaultLabName = (test: string) => testFor(test)?.name ?? test.replace(/^custom:/, '');

/** "Above range" / "Within range" / "Below range" (empty when no range is set). */
export function rangeLabel(r: Pick<LabResult, 'value' | 'low' | 'high'>): string {
  const flag = flagFor(r);
  return flag === 'high' ? 'Above range' : flag === 'low' ? 'Below range' : flag === 'normal' ? 'Within range' : '';
}

/** e.g. "↓ 27% since Aug 17", comparing the latest result with the one before it. */
export function changeSinceLast(results: LabResult[]): string | null {
  const latest = results[results.length - 1];
  const prev = results[results.length - 2];
  if (!latest || !prev || prev.value === 0) return null;
  const pct = Math.round(((latest.value - prev.value) / Math.abs(prev.value)) * 100);
  const [y, m, d] = prev.date.split('-').map(Number);
  const prevDate = new Date(y, m - 1, d);
  const since = prevDate.toLocaleDateString(
    undefined,
    y === new Date().getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' },
  );
  return pct === 0 ? `No change since ${since}` : `${pct > 0 ? '↑' : '↓'} ${Math.abs(pct)}% since ${since}`;
}
