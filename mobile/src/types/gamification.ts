/** Gezi Skoru rozet eşikleri (Keşfet ekranı). */

export type BadgeTierId = 'explorer' | 'traveler' | 'legend';

export const BADGE_TIER_LABELS: Record<BadgeTierId, string> = {
  explorer: 'Kaşif',
  traveler: 'Gezgin',
  legend: 'Efsane Gezgin',
};

/** Gezi puanına göre rozet kademesi. */
export const DISCOVER_SCORE_TRAVELER_MIN = 280;
export const DISCOVER_SCORE_LEGEND_MIN = 900;

export function badgeTierFromDiscoverScore(score: number): BadgeTierId {
  if (score >= DISCOVER_SCORE_LEGEND_MIN) return 'legend';
  if (score >= DISCOVER_SCORE_TRAVELER_MIN) return 'traveler';
  return 'explorer';
}
