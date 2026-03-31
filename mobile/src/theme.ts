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

/** Okyanus — derin camgöbeği */
export const oceanTheme: AppTheme = {
  color: {
    bg: '#0C1929',
    bgAlt: '#0F2942',
    surface: '#152B45',
    card: '#152B45',
    text: '#E0F2FE',
    textSecondary: '#BAE6FD',
    muted: '#7DD3FC',
    subtle: 'rgba(224, 242, 254, 0.08)',
    primary: '#22D3EE',
    primaryDark: '#06B6D4',
    primarySoft: 'rgba(34, 211, 238, 0.2)',
    accent: '#38BDF8',
    accentSoft: 'rgba(56, 189, 248, 0.22)',
    accentPink: '#67E8F9',
    accentTeal: '#2DD4BF',
    accentPurple: '#818CF8',
    ocean: '#06B6D4',
    sand: '#164E63',
    success: '#34D399',
    danger: '#FB7185',
    border: 'rgba(224, 242, 254, 0.14)',
    inputBg: '#1E3A5F',
    overlayDark: 'rgba(0, 0, 0, 0.65)',
    cardBorderPrimary: 'rgba(34, 211, 238, 0.35)',
    cardBorderAccent: 'rgba(56, 189, 248, 0.4)',
    sectionBorder: 'rgba(34, 211, 238, 0.28)',
    mapDashBorder: 'rgba(34, 211, 238, 0.45)',
  },
  tripStripes,
  radius,
  space,
  font,
  screenGradient: ['#0E7490', '#155E75', '#164E63'],
  primaryButtonGradient: ['#06B6D4', '#0891B2'],
  accentButtonGradient: ['#22D3EE', '#0E7490'],
  shadowCard: shadowCardDark,
  shadowSoft: shadowSoftDark,
};

/** Gün batımı — sıcak mor & mercan */
export const sunsetTheme: AppTheme = {
  color: {
    bg: '#1A0F1F',
    bgAlt: '#2D1528',
    surface: '#35203D',
    card: '#35203D',
    text: '#FCE7F3',
    textSecondary: '#FBCFE8',
    muted: '#F9A8D4',
    subtle: 'rgba(252, 231, 243, 0.08)',
    primary: '#F472B6',
    primaryDark: '#EC4899',
    primarySoft: 'rgba(244, 114, 182, 0.22)',
    accent: '#FB923C',
    accentSoft: 'rgba(251, 146, 60, 0.22)',
    accentPink: '#FB7185',
    accentTeal: '#FBBF24',
    accentPurple: '#C084FC',
    ocean: '#E879F9',
    sand: '#4C1D95',
    success: '#4ADE80',
    danger: '#F87171',
    border: 'rgba(252, 231, 243, 0.12)',
    inputBg: '#422848',
    overlayDark: 'rgba(0, 0, 0, 0.65)',
    cardBorderPrimary: 'rgba(244, 114, 182, 0.4)',
    cardBorderAccent: 'rgba(251, 146, 60, 0.45)',
    sectionBorder: 'rgba(244, 114, 182, 0.3)',
    mapDashBorder: 'rgba(244, 114, 182, 0.45)',
  },
  tripStripes,
  radius,
  space,
  font,
  screenGradient: ['#9D174D', '#7C2D12', '#581C87'],
  primaryButtonGradient: ['#EC4899', '#DB2777'],
  accentButtonGradient: ['#FB923C', '#EA580C'],
  shadowCard: shadowCardDark,
  shadowSoft: shadowSoftDark,
};

/** Orman — zümrüt & koyu yeşil */
export const forestTheme: AppTheme = {
  color: {
    bg: '#0C1A12',
    bgAlt: '#132A1A',
    surface: '#1A2E22',
    card: '#1A2E22',
    text: '#ECFDF5',
    textSecondary: '#D1FAE5',
    muted: '#6EE7B7',
    subtle: 'rgba(236, 253, 245, 0.08)',
    primary: '#34D399',
    primaryDark: '#10B981',
    primarySoft: 'rgba(52, 211, 153, 0.2)',
    accent: '#A3E635',
    accentSoft: 'rgba(163, 230, 53, 0.2)',
    accentPink: '#4ADE80',
    accentTeal: '#2DD4BF',
    accentPurple: '#86EFAC',
    ocean: '#14B8A6',
    sand: '#365314',
    success: '#4ADE80',
    danger: '#F87171',
    border: 'rgba(236, 253, 245, 0.12)',
    inputBg: '#234830',
    overlayDark: 'rgba(0, 0, 0, 0.65)',
    cardBorderPrimary: 'rgba(52, 211, 153, 0.35)',
    cardBorderAccent: 'rgba(163, 230, 53, 0.4)',
    sectionBorder: 'rgba(52, 211, 153, 0.28)',
    mapDashBorder: 'rgba(52, 211, 153, 0.45)',
  },
  tripStripes,
  radius,
  space,
  font,
  screenGradient: ['#14532D', '#166534', '#365314'],
  primaryButtonGradient: ['#10B981', '#047857'],
  accentButtonGradient: ['#84CC16', '#4D7C0F'],
  shadowCard: shadowCardDark,
  shadowSoft: shadowSoftDark,
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
