/**
 * ConvoAI design tokens, copied from the app (src/ui/theme.ts, light palette) and the
 * overlay's dark-rose glass (src/ui/tutorial/ToolbarDemo.tsx). Font: Poppins.
 */

export const c = {
  bg: '#FFF1F2',
  surface: '#FFFFFF',
  surfaceAlt: '#FFE4E8',
  border: '#9F123926',
  borderStrong: '#9F1239',
  text: '#4C0519',
  textMuted: '#831843',
  textFaint: '#9F1239',
  primary: '#C8143F',
  primaryBright: '#E11D48',
  primaryStrong: '#831843',
  primarySoft: '#FECDD3',
  onPrimary: '#FFF1F2',
  success: '#15803D',
  successSoft: '#DCFCE7',
  warning: '#B45309',
  warningSoft: '#FEF3C7',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
} as const;

/** The in-WhatsApp overlay: dark-rose glass. */
export const ov = {
  bar: '#1C0A12',
  barSoft: '#2A0F1B',
  border: '#FDA4AF4D',
  icon: '#FECDD3',
  text: '#FFF1F2',
  muted: '#F5C2CB',
  accent: '#FDA4AF',
  rose: '#C8143F',
} as const;

export const radius = { sm: 4, md: 8, lg: 12, xl: 20, xxl: 28 } as const;

export const spring = { type: 'spring', stiffness: 260, damping: 24 } as const;
export const softSpring = { type: 'spring', stiffness: 120, damping: 18 } as const;
