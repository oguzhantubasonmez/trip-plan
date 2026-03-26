import type { TripPlanStatus } from '../types/trip';

export const TRIP_PLAN_STATUS_ORDER: TripPlanStatus[] = ['planned', 'in_progress', 'completed'];

export const TRIP_PLAN_STATUS_LABEL_TR: Record<TripPlanStatus, string> = {
  planned: 'Planlandı',
  in_progress: 'Devam ediyor',
  completed: 'Tamamlandı',
};

export function parseTripPlanStatus(v: unknown): TripPlanStatus {
  if (v === 'in_progress' || v === 'completed' || v === 'planned') return v;
  return 'planned';
}

export function nextTripPlanStatus(s: TripPlanStatus): TripPlanStatus {
  const i = TRIP_PLAN_STATUS_ORDER.indexOf(s);
  const next = (i + 1) % TRIP_PLAN_STATUS_ORDER.length;
  return TRIP_PLAN_STATUS_ORDER[next]!;
}
