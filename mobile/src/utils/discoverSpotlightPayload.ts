import type { PlaceDetails } from '../services/places';
import type { StopPresentationPayload } from './presentationModel';
import type { StopPresentationWebBlock } from './stopWebEnrichment';

/** Yer keşfet spotlight kartı — rota sunumu alanlarıyla uyumlu. */
export function buildDiscoverSpotlightPayload(
  details: PlaceDetails,
  placeId: string | undefined,
  web: StopPresentationWebBlock
): StopPresentationPayload {
  const rating = details.rating != null && details.rating > 0 ? details.rating : undefined;
  const total =
    details.userRatingsTotal != null && details.userRatingsTotal > 0
      ? details.userRatingsTotal
      : undefined;
  const pid = placeId?.trim() || '';
  return {
    stopId: pid || 'spotlight',
    routeIndex: 1,
    title: details.name,
    dayLabel: '',
    stopRestDisplay: '—',
    legKm: undefined,
    legMin: undefined,
    extrasSummary: '—',
    stopTotalTl: 0,
    placeRating: rating,
    placeUserRatingsTotal: total,
    coords: { latitude: details.latitude, longitude: details.longitude },
    legModeLabel: 'Keşif',
    summaryBullets: web.summaryBullets,
    summarySourceLine: web.summarySourceLine,
    summarySourceUrl: web.summarySourceUrl,
    summaryWikipediaPageTitle: web.summaryWikipediaPageTitle,
    reviewBullets: web.reviewBullets,
    reviewSourceLine: web.reviewSourceLine,
    heroImageUrl: web.heroImageUrl,
    webFromGooglePlaces: web.fromGooglePlaces ?? false,
    webLoading: false,
  };
}
