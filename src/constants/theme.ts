import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#170A2B',
    background: '#F8F6FB',
    backgroundElement: '#EEE9F5',
    backgroundSelected: '#E2DAEE',
    textSecondary: '#5B5170',
    /** Accent for text, icons, and lines: lupus-butterfly purple. */
    accent: '#38057B',
    /** Fill for primary buttons, selected chips, and your chat bubbles: the butterfly's wing purple. */
    accentFill: '#38057B',
    /** Text and icons drawn on top of accentFill. */
    onAccent: '#FFFFFF',
    /** UV above your threshold, and out-of-range results. */
    sunAlert: '#B03A1E',
    /** UV at or below your threshold. */
    sunCalm: '#D7CFE2',
  },
  dark: {
    text: '#F4F1F8',
    background: '#000000',
    backgroundElement: '#110D17',
    backgroundSelected: '#1F1829',
    textSecondary: '#ABA2B8',
    // The wing purple is too dark to read as text on black, so text/icons use a lighter tint of it.
    accent: '#B795F0',
    accentFill: '#38057B',
    onAccent: '#FFFFFF',
    sunAlert: '#FF8D5C',
    sunCalm: '#2A2333',
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
