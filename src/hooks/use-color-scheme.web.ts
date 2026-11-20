import { useEffect, useState } from 'react';
import { useColorScheme as useDeviceColorScheme } from 'react-native';

import { useAppearanceSetting } from '@/lib/settings';

/**
 * 'light' or 'dark': the Appearance setting if chosen, otherwise the browser setting.
 * The browser setting is only read after hydration, to support static rendering.
 */
export function useColorScheme(): 'light' | 'dark' {
  const [hasHydrated, setHasHydrated] = useState(false);
  useEffect(() => setHasHydrated(true), []);
  const device = useDeviceColorScheme();
  const setting = useAppearanceSetting();
  if (setting !== 'system') return setting;
  return hasHydrated && device === 'dark' ? 'dark' : 'light';
}
