import Constants from 'expo-constants';

/** Play / App Store abonelik veya ürün sayfası (yayından sonra doldur). */
export function getProSubscriptionUrl(): string {
  const extra = Constants.expoConfig?.extra as { proSubscriptionUrl?: string } | undefined;
  const fromExtra = String(extra?.proSubscriptionUrl ?? '').trim();
  if (fromExtra) return fromExtra;
  if (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_PRO_SUBSCRIPTION_URL) {
    return String(process.env.EXPO_PUBLIC_PRO_SUBSCRIPTION_URL).trim();
  }
  return '';
}

export type SponsoredVenue = {
  id: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  /** İşletme / kampanya hedef URL (sponsorluk anlaşması). */
  targetUrl: string;
};

/** Örnek sponsorlu öneriler — anlaşmalı mekanlarla `targetUrl` güncellenir. */
export const SPONSORED_VENUES: SponsoredVenue[] = [
  {
    id: 'sp_1',
    title: 'Örnek butik otel',
    subtitle: 'Sponsorlu · şehir merkezine yakın konaklama',
    ctaLabel: 'Detay',
    targetUrl: 'https://example.com/sponsor/hotel',
  },
  {
    id: 'sp_2',
    title: 'Örnek restoran',
    subtitle: 'Sponsorlu · grup menüleri',
    ctaLabel: 'Menü',
    targetUrl: 'https://example.com/sponsor/restaurant',
  },
];
