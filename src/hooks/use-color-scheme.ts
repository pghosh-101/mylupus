import { useColorScheme as useDeviceColorScheme } from 'react-native';

import { useAppearanceSetting } from '@/lib/settings';

/** 'light' or 'dark': the Appearance setting if chosen, otherwise the device setting. */
export function useColorScheme(): 'light' | 'dark' {
  const device = useDeviceColorScheme();
  const setting = useAppearanceSetting();
  if (setting !== 'system') return setting;
  return device === 'dark' ? 'dark' : 'light';
}
