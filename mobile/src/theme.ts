import type { ViewStyle } from 'react-native';

const radius = {
  sm: 14,
  md: 18,
  lg: 24,
  xl: 28,
  pill: 999,
} as const;

const space = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 22,
  xl: 28,
  xxl: 36,
} as const;

const font = {
  hero: 34,
  h1: 28,
  h2: 20,
  body: 16,
  small: 14,
  tiny: 12,
} as const;

const tripStripes = ['#0EA5E9', '#F97316', '#14B8A6', '#8B5CF6', '#EC4899'] as const;

export type AppTheme = {
  color: {
    bg: string;
    bgAlt: string;
    surface: string;
    card: string;
    text: string;
    textSecondary: string;
    muted: string;
    subtle: string;
    primary: string;
    primaryDark: string;
    primarySoft: string;
    accent: string;
    accentSoft: string;
    accentPink: string;
    accentTeal: string;
    accentPurple: string;
    ocean: string;
    sand: string;
    success: string;
    danger: string;
    border: string;
    inputBg: string;
    overlayDark: string;
    /** Kart kenarı — gökyüzü */
    cardBorderPrimary: string;
    /** Kart kenarı — turuncu vurgu */
    cardBorderAccent: string;
    /** Bölüm kartı */
    sectionBorder: string;
    /** Harita placeholder kesik çizgi */
    mapDashBorder: string;
  };
  tripStripes: typeof tripStripes;
  radius: typeof radius;
  space: typeof space;
  font: typeof font;
  screenGradient: readonly string[];
  primaryButtonGradient: readonly string[];
  accentButtonGradient: readonly string[];
  shadowCard: ViewStyle;
  shadowSoft: ViewStyle;
};

const shadowCardLight: ViewStyle = {
  shadowColor: '#0369A1',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.12,
  shadowRadius: 16,
  elevation: 6,
};

const shadowSoftLight: ViewStyle = {
  shadowColor: '#0F172A',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 2,
};

const shadowCardDark: ViewStyle = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.35,
  shadowRadius: 20,
  elevation: 8,
};

const shadowSoftDark: ViewStyle = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.25,
  shadowRadius: 10,
  elevation: 3,
};

/** Açık tema — sıcak gezi paleti */
export const lightTheme: AppTheme = {
  color: {
    bg: '#E0F4FC',
    bgAlt: '#FFF7ED',
    surface: '#FFFFFF',
    card: '#FFFFFF',
    text: '#0F172A',
    textSecondary: '#334155',
    muted: '#64748B',
    subtle: 'rgba(15, 23, 42, 0.08)',
    primary: '#0EA5E9',
    primaryDark: '#0284C7',
    primarySoft: 'rgba(14, 165, 233, 0.15)',
    accent: '#F97316',
    accentSoft: 'rgba(249, 115, 22, 0.18)',
    accentPink: '#EC4899',
    accentTeal: '#14B8A6',
    accentPurple: '#8B5CF6',
    ocean: '#0891B2',
    sand: '#FEF3C7',
    success: '#10B981',
    danger: '#EF4444',
    border: 'rgba(15, 23, 42, 0.1)',
    inputBg: '#F8FAFC',
    overlayDark: 'rgba(15, 23, 42, 0.45)',
    cardBorderPrimary: 'rgba(14, 165, 233, 0.2)',
    cardBorderAccent: 'rgba(249, 115, 22, 0.25)',
    sectionBorder: 'rgba(14, 165, 233, 0.15)',
    mapDashBorder: 'rgba(14, 165, 233, 0.35)',
  },
  tripStripes,
  radius,
  space,
  font,
  screenGradient: ['#BAE6FD', '#E0F2FE', '#FFFBEB', '#FEF9C3'],
  primaryButtonGradient: ['#0EA5E9', '#0284C7'],
  accentButtonGradient: ['#FB923C', '#EA580C'],
  shadowCard: shadowCardLight,
  shadowSoft: shadowSoftLight,
};

/** Koyu tema — gece yolculuğu */
export const darkTheme: AppTheme = {
  color: {
    bg: '#0B1220',
    bgAlt: '#1A1520',
    surface: '#1E293B',
    card: '#1E293B',
    text: '#F1F5F9',
    textSecondary: '#CBD5E1',
    muted: '#94A3B8',
    subtle: 'rgba(248, 250, 252, 0.08)',
    primary: '#38BDF8',
    primaryDark: '#0EA5E9',
    primarySoft: 'rgba(56, 189, 248, 0.18)',
    accent: '#FB923C',
    accentSoft: 'rgba(251, 146, 60, 0.2)',
    accentPink: '#F472B6',
    accentTeal: '#2DD4BF',
    accentPurple: '#A78BFA',
    ocean: '#22D3EE',
    sand: '#422006',
    success: '#34D399',
    danger: '#F87171',
    border: 'rgba(248, 250, 252, 0.12)',
    inputBg: '#334155',
    overlayDark: 'rgba(0, 0, 0, 0.65)',
    cardBorderPrimary: 'rgba(56, 189, 248, 0.35)',
    cardBorderAccent: 'rgba(251, 146, 60, 0.4)',
    sectionBorder: 'rgba(56, 189, 248, 0.25)',
    mapDashBorder: 'rgba(56, 189, 248, 0.45)',
  },
  tripStripes,
  radius,
  space,
  font,
  screenGradient: ['#0C4A6E', '#164E63', '#1E1B4B', '#312E81'],
  primaryButtonGradient: ['#0EA5E9', '#0369A1'],
  accentButtonGradient: ['#FB923C', '#C2410C'],
  shadowCard: shadowCardDark,
  shadowSoft: shadowSoftDark,
};

/** Geriye dönük: varsayılan açık tema */
export const theme = lightTheme;

export const screenGradient = lightTheme.screenGradient;
export const primaryButtonGradient = lightTheme.primaryButtonGradient;
export const accentButtonGradient = lightTheme.accentButtonGradient;
export const shadowCard = lightTheme.shadowCard;
export const shadowSoft = lightTheme.shadowSoft;
