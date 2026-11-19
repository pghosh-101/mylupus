import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#10241B',
    background: '#F7F4EC',
    backgroundElement: '#EDE8DA',
    backgroundSelected: '#E1DAC6',
    textSecondary: '#56665C',
    /** Brand accent: deep evergreen in light mode, gold in dark mode. */
    accent: '#1E5C44',
    /** Text and icons drawn on top of the accent color. */
    onAccent: '#F7E7B8',
    /** UV above your threshold, and out-of-range results. */
    sunAlert: '#A93424',
    /** UV at or below your threshold. */
    sunCalm: '#CFC8B4',
  },
  dark: {
    text: '#EEF3EF',
    background: '#07120E',
    backgroundElement: '#0F1F18',
    backgroundSelected: '#1A3026',
    textSecondary: '#A3B6AA',
    accent: '#D9B45F',
    onAccent: '#1A1405',
    sunAlert: '#F26B5B',
    sunCalm: '#213529',
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
