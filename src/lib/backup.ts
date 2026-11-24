import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { todayString } from '@/lib/meds';

/**
 * Export and restore: everything MyLupus stores on the phone, as one JSON file the user keeps
 * (Files, iCloud Drive, email to themselves). Nothing is uploaded unless they choose to share it.
 */

const PREFIX = 'mylupus.';
/** Temporary data that's rebuilt automatically, so it isn't worth backing up. */
const SKIP = new Set(['mylupus.learnCache', 'mylupus.demoSeeded']);

export type Backup = {
  app: 'MyLupus';
  version: 1;
  exportedAt: string;
  /** Each stored item exactly as saved (JSON strings), by key. */
  data: Record<string, string>;
};

async function collect(): Promise<Backup> {
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX) && !SKIP.has(k));
  const pairs = await AsyncStorage.multiGet(keys);
  const data: Record<string, string> = {};
  for (const [k, v] of pairs) if (v !== null) data[k] = v;
  return { app: 'MyLupus', version: 1, exportedAt: new Date().toISOString(), data };
}

/** A short count of what's in a backup, e.g. "3 medications, 41 check-ins, 2 flares". */
export function describeBackup(b: Backup): string {
  const count = (key: string) => {
    try {
      const v = JSON.parse(b.data[key] ?? 'null');
      return Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0;
    } catch {
      return 0;
    }
  };
  const parts = [
    [count('mylupus.meds'), 'medication'],
    [count('mylupus.evening'), 'check-in'],
    [count('mylupus.flares'), 'flare'],
    [count('mylupus.labs'), 'lab result'],
  ] as const;
  return (
    parts
      .filter(([n]) => n > 0)
      .map(([n, word]) => `${n} ${word}${n === 1 ? '' : 's'}`)
      .join(', ') || 'settings only'
  );
}

/**
 * Save everything to a file and open the share sheet (Save to Files, AirDrop, email...).
 * On the web, downloads the file. Returns a summary of what was exported.
 */
export async function exportData(): Promise<string> {
  const backup = await collect();
  const name = `MyLupus-backup-${todayString()}.json`;
  const json = JSON.stringify(backup, null, 2);

  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return describeBackup(backup);
  }

  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  await file.write(json);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing isn’t available on this device.');
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle: 'Save your MyLupus backup',
  });
  return describeBackup(backup);
}

/** Let the user pick a backup file and check it. Returns null if they cancel. */
export async function pickBackup(): Promise<Backup | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'public.json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const text = Platform.OS === 'web' && asset.file ? await asset.file.text() : await new File(asset.uri).text();

  let parsed: Partial<Backup>;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file isn’t a MyLupus backup.');
  }
  if (parsed.app !== 'MyLupus' || !parsed.data || typeof parsed.data !== 'object') {
    throw new Error('That file isn’t a MyLupus backup.');
  }
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (k.startsWith(PREFIX) && !SKIP.has(k) && typeof v === 'string') data[k] = v;
  }
  return { app: 'MyLupus', version: 1, exportedAt: parsed.exportedAt ?? '', data };
}

/** Replace everything stored on this phone with a backup. */
export async function restoreBackup(backup: Backup) {
  const existing = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX) && k !== 'mylupus.demoSeeded');
  await AsyncStorage.multiRemove(existing);
  await AsyncStorage.multiSet(Object.entries(backup.data));
}
