/**
 * ConvoAI theme — implements DESIGN.md (gnani-pro Design System):
 *   Rose colour direction · Poppins · 4/8/12 radius · 4–48 spacing · Bento layout.
 *
 * Light palette = DESIGN.md tokens. Dark palette = the same rose hues re-balanced
 * for dark surfaces (the app follows the system theme). Every text/background
 * pair below was chosen to meet WCAG AA (4.5:1 for body text).
 */

import { useColorScheme } from 'react-native';

export interface Palette {
  /** Page background */
  bg: string;
  /** Card surface */
  surface: string;
  /** Muted surface (chips, inset areas) */
  surfaceAlt: string;
  /** Hairline borders */
  border: string;
  /** Strong borders: selected / focus */
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  primaryStrong: string;
  primarySoft: string;
  onPrimary: string;
  /** Muted text on the primary (hero) surface */
  onPrimaryMuted: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
}

const light: Palette = {
  bg: '#FFF1F2', // surface
  surface: '#FFFFFF',
  surfaceAlt: '#FFE4E8',
  border: '#9F123926', // border @ 15% for hairlines
  borderStrong: '#9F1239', // border
  text: '#4C0519', // text
  textMuted: '#831843', // primaryStrong
  textFaint: '#9F1239', // border (7:1 on white)
  // DESIGN primary #E11D48 gives only 4.28:1 under light text; deepened to #C8143F (5.27:1) per the
  // design system's own rule "choose the more accessible option". Same rose hue.
  primary: '#C8143F',
  primaryStrong: '#831843',
  primarySoft: '#FECDD3', // primarySoft
  onPrimary: '#FFF1F2',
  onPrimaryMuted: '#FFE4E8',
  success: '#15803D', // DESIGN #16A34A is 3.0:1 on its soft surface; deepened for AA
  successSoft: '#DCFCE7',
  warning: '#B45309', // DESIGN warning #D97706 darkened for AA text contrast
  warningSoft: '#FEF3C7',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
};

const dark: Palette = {
  bg: '#14070C',
  surface: '#1F0B13',
  surfaceAlt: '#2C0F1C',
  border: '#FECDD31F',
  borderStrong: '#FB7185',
  text: '#FFF1F2',
  textMuted: '#F5C2CB',
  textFaint: '#D98A9A',
  primary: '#C8143F',
  primaryStrong: '#FDA4AF',
  primarySoft: '#3D0C1E',
  onPrimary: '#FFF1F2',
  onPrimaryMuted: '#FFE4E8',
  success: '#4ADE80',
  successSoft: '#0F2A1A',
  warning: '#FBBF24',
  warningSoft: '#3A260A',
  danger: '#F87171',
  dangerSoft: '#3B1414',
};

/** DESIGN.md spacing scale: 4/8/12/16/24/32/48 */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, section: 48 } as const;

/** DESIGN.md radius: 4 compact controls · 8 cards/inputs · 12 large feature surfaces */
export const radius = { sm: 4, md: 8, lg: 12 } as const;

/** DESIGN.md motion durations (ms) */
export const motion = { fast: 120, normal: 180, slow: 260 } as const;

/** Poppins families (loaded in app/_layout.tsx): rounded geometric sans, also covers Devanagari. */
export const fonts = {
  light: 'Poppins_300Light',
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

/**
 * Type scale. Poppins has tall ascenders/descenders, so line heights are ~1.45×.
 * Large text gets slight negative tracking for a tighter, modern look; labels get positive tracking.
 */
export const font = {
  display: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 32, letterSpacing: -0.4 },
  title: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 28, letterSpacing: -0.3 },
  heading: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 23, letterSpacing: -0.1 },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 21 },
  small: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  smallStrong: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  label: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 16, letterSpacing: 0.6, textTransform: 'uppercase' as const },
};

export function useTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return { c: isDark ? dark : light, isDark };
}
