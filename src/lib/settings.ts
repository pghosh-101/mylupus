import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEMO } from '@/lib/demo';

/** Personal settings, chosen in the welcome screens and editable in Settings. Stored on the device. */
export type AppSettings = {
  /** Used in greetings. Empty means no name. */
  name: string;
  /** Sun protection is needed when the UV index is ABOVE this number. */
  uvThreshold: number;
  /** Time of the morning UV notification (24-hour clock, phone's time zone). */
  morningAlert: { hour: number; minute: number };
  /** Whether the welcome screens have been completed. */
  onboarded: boolean;
  /** Light or dark appearance, or follow the device setting. */
  appearance: 'system' | 'light' | 'dark';
  /** Which kinds of reminders to send. Each can be turned off in Settings. */
  notify: {
    /** Medication reminders, repeats for missed doses, and refill reminders. */
    meds: boolean;
    morningUv: boolean;
    sunscreen: boolean;
    evening: boolean;
  };
  /** Use the phone's location for UV. When off, UV is shown for a city you pick. */
  useLocation: boolean;
};

const DEFAULTS: AppSettings = {
  name: '',
  uvThreshold: 2,
  morningAlert: { hour: 8, minute: 0 },
  onboarded: false,
  // The public demo shows the black and purple theme unless the visitor picks otherwise.
  appearance: DEMO ? 'dark' : 'system',
  notify: { meds: true, morningUv: true, sunscreen: true, evening: true },
  useLocation: true,
};

/**
 * The current settings. Loaded once at startup (before the app renders) and updated by
 * saveSettings, so the rest of the app can read it directly.
 */
export const Settings: AppSettings = { ...DEFAULTS };

const KEY = 'mylupus.settings';

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const saved: Partial<AppSettings> = raw ? JSON.parse(raw) : {};
    // Merge nested reminder switches so settings saved before a switch existed keep its default.
    Object.assign(Settings, DEFAULTS, saved, { notify: { ...DEFAULTS.notify, ...saved.notify } });
  } catch {
    Object.assign(Settings, DEFAULTS);
  }
  return { ...Settings };
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  Object.assign(Settings, patch);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(Settings));
  } catch {
    // Not fatal; settings stay in memory for this session.
  }
  const snapshot = { ...Settings };
  listeners.forEach((fn) => fn(snapshot));
  return snapshot;
}

/** ", Name" or "" — for greetings like `Good morning${withName()}`. */
export const withName = () => (Settings.name ? `, ${Settings.name}` : '');

// ---------------------------------------------------------------------------
// Change notifications, so the app can refresh when settings change
// ---------------------------------------------------------------------------

const listeners = new Set<(s: AppSettings) => void>();

/** Call fn whenever settings are saved. Returns an unsubscribe function. */
export function onSettingsChange(fn: (s: AppSettings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The current appearance setting, as a React hook that updates when settings change. */
export function useAppearanceSetting(): AppSettings['appearance'] {
  return useSyncExternalStore(
    (onChange) => onSettingsChange(() => onChange()),
    () => Settings.appearance,
    () => Settings.appearance,
  );
}
