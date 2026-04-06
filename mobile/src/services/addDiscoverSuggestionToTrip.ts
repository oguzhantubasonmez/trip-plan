import type { DiscoverPlaceSuggestion } from './tripStopsDiscover';
import type { Trip } from '../types/trip';
import {
  addStop,
  getStopsForTrip,
  getTrip,
  recalculateLegsForTrip,
  reorderStops,
} from './trips';
import { sortStopsByRoute } from '../utils/tripSchedule';

export function canUserAddStopToTrip(trip: Trip, uid: string): boolean {
  if (trip.adminId === uid) return true;
  return trip.attendees.some((a) => a.uid === uid && a.role === 'editor');
}

export async function addDiscoverSuggestionToTrip(params: {
  tripId: string;
  uid: string;
  stopDateYmd: string;
  suggestion: DiscoverPlaceSuggestion;
}): Promise<void> {
  const freshTrip = await getTrip(params.tripId);
  if (!freshTrip) {
    throw new Error('Rota bulunamadı.');
  }
  if (!canUserAddStopToTrip(freshTrip, params.uid)) {
    throw new Error('Bu rotaya durak ekleyemezsiniz.');
  }
  const stops = await getStopsForTrip(params.tripId);
  const s = params.suggestion;
  const isAdmin = freshTrip.adminId === params.uid;
  await addStop({
    tripId: params.tripId,
    locationName: s.name,
    createdBy: params.uid,
    status: isAdmin ? 'approved' : 'pending',
    coords: { latitude: s.latitude, longitude: s.longitude },
    order: stops.length,
    stopDate: params.stopDateYmd,
    ...(s.rating != null && s.rating > 0 ? { placeRating: s.rating } : {}),
    ...(s.userRatingsTotal != null && s.userRatingsTotal > 0
      ? { placeUserRatingsTotal: s.userRatingsTotal }
      : {}),
    googlePlaceId: s.placeId,
  });
  const merged = await getStopsForTrip(params.tripId);
  const sorted = sortStopsByRoute(merged, freshTrip.startDate ?? '');
  await reorderStops(params.tripId, sorted.map((x) => x.stopId), params.uid);
  try {
    await recalculateLegsForTrip(params.tripId);
  } catch {
    /* mesafe güncellenmese de durak eklendi */
  }
}
