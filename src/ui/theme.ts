/**
 * App theme: light + dark palettes that follow the system setting
 * (app.json `userInterfaceStyle: "automatic"`), plus spacing/radius/type tokens.
 * The floating overlay over WhatsApp stays dark glass regardless (native).
 */

import { useColorScheme } from 'react-native';

export interface Palette {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  primarySoft: string;
  onPrimary: string;
  accent: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
}

const dark: Palette = {
  bg: '#0B1020',
  surface: '#141A2E',
  surfaceAlt: '#1B2340',
  border: '#232C4A',
  text: '#F1F5F9',
  textMuted: '#A3AEC2',
  textFaint: '#6B7690',
  primary: '#6366F1',
  primarySoft: '#262A5C',
  onPrimary: '#FFFFFF',
  accent: '#22D3EE',
  success: '#22C55E',
  successSoft: '#123326',
  warning: '#F59E0B',
  warningSoft: '#3A2A0E',
  danger: '#F87171',
  dangerSoft: '#3B1717',
};

const light: Palette = {
  bg: '#F4F6FB',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF1FB',
  border: '#E3E7F0',
  text: '#0F172A',
  textMuted: '#475569',
  textFaint: '#8A94A6',
  primary: '#4F46E5',
  primarySoft: '#E7E8FD',
  onPrimary: '#FFFFFF',
  accent: '#0891B2',
  success: '#16A34A',
  successSoft: '#E3F6EA',
  warning: '#B45309',
  warningSoft: '#FDF1DC',
  danger: '#DC2626',
  dangerSoft: '#FDE8E8',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 14, lg: 20, pill: 999 } as const;
export const font = {
  title: { fontSize: 24, fontWeight: '800' as const, letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: '700' as const },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 17 },
  label: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const },
};

export function useTheme() {
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';
  return { c: isDark ? dark : light, isDark };
}
