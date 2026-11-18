import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1B1530',
    background: '#FBFAFE',
    backgroundElement: '#F1EEF8',
    backgroundSelected: '#E4DFF2',
    textSecondary: '#625C73',
    /** Brand accent (butterfly purple, the lupus awareness color). */
    accent: '#6B4FBB',
    /** UV above your threshold. */
    sunAlert: '#D9622B',
    /** UV at or below your threshold. */
    sunCalm: '#C9C3D6',
  },
  dark: {
    text: '#F4F1FA',
    background: '#0F0C17',
    backgroundElement: '#1E1A29',
    backgroundSelected: '#2B2639',
    textSecondary: '#B3ACC4',
    accent: '#A890F0',
    sunAlert: '#F2884F',
    sunCalm: '#4A4459',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
