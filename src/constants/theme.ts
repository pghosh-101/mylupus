import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0A1A12',
    background: '#F6F8F6',
    backgroundElement: '#E9EFEA',
    backgroundSelected: '#DAE5DD',
    textSecondary: '#4E6056',
    /** Brand accent: emerald. */
    accent: '#0B7A48',
    /** Text and icons drawn on top of the accent color. */
    onAccent: '#FFFFFF',
    /** UV above your threshold, and out-of-range results. */
    sunAlert: '#B03A1E',
    /** UV at or below your threshold. */
    sunCalm: '#C9D4CC',
  },
  dark: {
    text: '#F3F6F4',
    background: '#000000',
    backgroundElement: '#0E1411',
    backgroundSelected: '#18221C',
    textSecondary: '#A0ADA5',
    accent: '#22C57A',
    onAccent: '#00140A',
    sunAlert: '#FF8D5C',
    sunCalm: '#232E28',
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

/**
 * Plus Jakarta Sans for headings, medication names, big numbers, and buttons.
 * Body text keeps the system font. (Don't combine with fontWeight: each weight is its own font.)
 */
export const HeadingFont = {
  bold: 'PlusJakartaSans_700Bold',
  semibold: 'PlusJakartaSans_600SemiBold',
} as const;

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
