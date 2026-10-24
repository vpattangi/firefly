/**
 * Design tokens. Screens read colors through `useTheme()` / `ThemedText themeColor=`; don't hardcode them.
 */

import '@/global.css';

import { Platform } from 'react-native';

// Firefly palette (from the Figma export), with every blue replaced by navy.
export const Colors = {
  light: {
    text: '#172B40',
    background: '#F5F7FA',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E8EDF3',
    textSecondary: '#647487',
    border: '#DFE6ED',
    accent: '#073767',
    onAccent: '#FFFFFF',
    navy: '#073767',
    amber: '#E5A823',
    amberSoft: '#FFF3D7',
    success: '#23725C',
    warning: '#94621B',
    danger: '#C62828',
  },
  dark: {
    text: '#F2F5F8',
    background: '#0B1622',
    backgroundElement: '#14212F',
    backgroundSelected: '#1B2633',
    textSecondary: '#9FB0C2',
    border: '#26384B',
    accent: '#A9B8CC',
    onAccent: '#073767',
    navy: '#073767',
    amber: '#E5A823',
    amberSoft: '#3A2E12',
    success: '#4CC38A',
    warning: '#F0B54A',
    danger: '#FF6B6B',
  },
} as const;

/** SJSU UPD Evening Guide / SafeWalk escort line — confirm the number before demoing. */
export const SafeWalkPhone = '4089242222';
export const EmergencyPhone = '911';

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
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

export const Radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/** The JS tab bar sits in the layout, so screens don't need extra bottom padding for it. */
export const BottomTabInset = 0;
export const MaxContentWidth = 800;
