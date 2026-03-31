import type { Stop } from '../types/trip';
import { buildPlanStopRows } from './planSummaryExport';

export type StopPresentationPayload = {
  stopId: string;
  routeIndex: number;
  title: string;
  dayLabel: string;
  arrival?: string;
  departure?: string;
  stopRestDisplay: string;
  legKm?: number;
  legMin?: number;
  extrasSummary: string;
  stopTotalTl: number;
  placeRating?: number;
  placeUserRatingsTotal?: number;
  coords?: { latitude: number; longitude: number };
  /** Bacak için gösterim etiketi */
  legModeLabel: string;
  /** Wikipedia / OSM — durak başlığına göre özet. */
  summaryBullets: string[];
  summarySourceLine: string;
  summarySourceUrl?: string;
  summaryWikipediaPageTitle?: string;
  /** Google Places örnek yorumlar (puanı olan duraklarda). */
  reviewBullets: string[];
  reviewSourceLine: string;
  heroImageUrl?: string;
  /** Yorum metinleri Google’dan geldiyse. */
  webFromGooglePlaces?: boolean;
  webLoading: boolean;
};

export function buildStopPresentationPayloads(
  tripStartDate: string,
  routeOrderedStops: Stop[]
): StopPresentationPayload[] {
  const rows = buildPlanStopRows(tripStartDate, routeOrderedStops);
  return routeOrderedStops.map((s, i) => {
    const row = rows[i]!;
    const leg = s.legFromPrevious;
    const basis = leg?.distanceBasis;
    const legModeLabel = basis === 'straight_line' ? 'Kuş uçuşu' : 'Araç rotası';
    return {
      stopId: s.stopId,
      routeIndex: row.routeIndex,
      title: row.name,
      dayLabel: row.dayLabel,
      arrival: row.arrival,
      departure: row.departure,
      stopRestDisplay: row.stopRestDisplay,
      legKm: row.legKm,
      legMin: row.legMin,
      extrasSummary: row.extrasSummary,
      stopTotalTl: row.stopTotalTl,
      placeRating: s.placeRating,
      placeUserRatingsTotal: s.placeUserRatingsTotal,
      coords: s.coords,
      legModeLabel,
      summaryBullets: [],
      summarySourceLine: '',
      summarySourceUrl: undefined,
      summaryWikipediaPageTitle: undefined,
      reviewBullets: [],
      reviewSourceLine: '',
      heroImageUrl: undefined,
      webFromGooglePlaces: false,
      webLoading: true,
    };
  });
}
