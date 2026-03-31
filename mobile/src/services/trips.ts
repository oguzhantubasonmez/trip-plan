import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  GeoPoint,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { LegFromPrevious, Stop, StopExtraExpense, Trip, TripAttendee, TripPlanStatus } from '../types/trip';
import { parseTripPlanStatus } from '../utils/tripPlanStatus';
import {
  materializeExpenseIds,
  newExpenseId,
  parseStopExtraExpensesFromFirestore,
  sanitizeExtraExpensesInput,
  stopExtraTotal,
} from '../utils/stopExpenses';
import { fetchDrivingLegs, sumLegDistanceKm } from './directions';
import { getUserProfile } from './userProfile';

const TRIPS = 'trips';
const STOPS = 'stops';
const COMMENTS_COL = 'comments';
const TRIP_PROPOSALS = 'tripProposals';
const TRIP_MEMBERSHIP_NOTIF = 'tripMembershipNotifications';

function tsMillisNotif(v: unknown): number {
  if (v == null) return 0;
  if (typeof (v as { toMillis?: () => number }).toMillis === 'function') {
    try {
      return (v as { toMillis: () => number }).toMillis();
    } catch {
      return 0;
    }
  }
  return 0;
}

export type TripMembershipNotificationKind =
  | 'added_you'
  | 'member_joined'
  | 'member_left'
  | 'removed_by_admin'
  | 'member_removed';

export type TripMembershipNotificationRow = {
  id: string;
  toUid: string;
  tripId: string;
  tripTitle: string;
  actorUid: string;
  kind: TripMembershipNotificationKind;
  preview: string;
  read: boolean;
  createdAt?: unknown;
};

async function pushTripMembershipNotification(params: {
  toUid: string;
  tripId: string;
  tripTitle: string;
  actorUid: string;
  kind: TripMembershipNotificationKind;
  preview: string;
}): Promise<void> {
  await addDoc(collection(db, TRIP_MEMBERSHIP_NOTIF), {
    ...params,
    read: false,
    createdAt: serverTimestamp(),
  });
}

export async function listUnreadTripMembershipNotifications(uid: string): Promise<TripMembershipNotificationRow[]> {
  const qy = query(collection(db, TRIP_MEMBERSHIP_NOTIF), where('toUid', '==', uid), limit(50));
  const snap = await getDocs(qy);
  const out: TripMembershipNotificationRow[] = [];
  snap.forEach((d) => {
    const v = d.data() as any;
    if (v.read === true) return;
    const kind = v.kind;
    if (
      kind !== 'added_you' &&
      kind !== 'member_joined' &&
      kind !== 'member_left' &&
      kind !== 'removed_by_admin' &&
      kind !== 'member_removed'
    ) {
      return;
    }
    out.push({
      id: d.id,
      toUid: v.toUid,
      tripId: String(v.tripId || ''),
      tripTitle: String(v.tripTitle || 'Rota'),
      actorUid: v.actorUid,
      kind,
      preview: String(v.preview || ''),
      read: Boolean(v.read),
      createdAt: v.createdAt,
    });
  });
  out.sort((a, b) => tsMillisNotif(b.createdAt) - tsMillisNotif(a.createdAt));
  return out;
}

export async function markTripMembershipNotificationRead(notifId: string): Promise<void> {
  const ref = doc(db, TRIP_MEMBERSHIP_NOTIF, notifId);
  await updateDoc(ref, { read: true, readAt: serverTimestamp() });
}

function applyLegacyCostFieldsFromExpenses(
  updates: Record<string, any>,
  cleaned: StopExtraExpense[]
): void {
  const total =
    cleaned.length === 0
      ? 0
      : Math.round(cleaned.reduce((s, e) => s + e.amount, 0) * 100) / 100;
  updates.cost = total > 0 ? total : null;
  if (cleaned.length === 1) {
    updates.extraExpenseTypeId = cleaned[0].extraExpenseTypeId ?? null;
    updates.extraExpenseTypeName = cleaned[0].extraExpenseTypeName ?? null;
  } else {
    updates.extraExpenseTypeId = null;
    updates.extraExpenseTypeName = null;
  }
}

function stampStopEditor(updates: Record<string, any>, editedByUid?: string): void {
  if (editedByUid) updates.lastEditedByUid = editedByUid;
}

function stampTripEditor(updates: Record<string, any>, editedByUid?: string): void {
  if (editedByUid) updates.lastTripEditedByUid = editedByUid;
}

/** Firestore düz nesne, GeoPoint veya nadir `lat`/`lng` kayıtları */
function normalizeStopCoords(raw: unknown): Stop['coords'] | undefined {
  if (raw == null) return undefined;
  if (raw instanceof GeoPoint) {
    return { latitude: raw.latitude, longitude: raw.longitude };
  }
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    const lat = o.latitude;
    const lon = o.longitude;
    if (typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon)) {
      return { latitude: lat, longitude: lon };
    }
    const la = o.lat;
    const ln = o.lng;
    if (typeof la === 'number' && typeof ln === 'number' && Number.isFinite(la) && Number.isFinite(ln)) {
      return { latitude: la, longitude: ln };
    }
  }
  return undefined;
}

function parseAttendees(v: any): TripAttendee[] {
  if (!Array.isArray(v)) return [];
  return v.map((a: any) =>
    typeof a === 'string' ? { uid: a, role: 'viewer' as const } : a
  );
}

export async function createTrip(params: {
  adminId: string;
  title: string;
  startDate: string;
  endDate: string;
  /** HH:mm */
  startTime?: string;
  endTime?: string;
}): Promise<string> {
  const ref = doc(collection(db, TRIPS));
  const tripId = ref.id;
  const attendees: TripAttendee[] = [{ uid: params.adminId, role: 'admin', rsvp: 'going' }];
  const attendeeIds = [params.adminId];
  const data: Record<string, any> = {
    tripId,
    adminId: params.adminId,
    title: params.title,
    startDate: params.startDate,
    endDate: params.endDate,
    totalDistance: 0,
    totalFuelCost: 0,
    attendees,
    attendeeIds,
    planStatus: 'planned' satisfies TripPlanStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (params.startTime?.trim()) data.startTime = params.startTime.trim();
  if (params.endTime?.trim()) data.endTime = params.endTime.trim();
  await setDoc(ref, data);
  return tripId;
}

/** YYYY-MM-DD arasındaki gün farkı (yerel takvim). */
function dayDeltaBetweenYmd(fromYmd: string, toYmd: string): number {
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fromYmd ?? '').trim());
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(toYmd ?? '').trim());
  if (!a || !b) return 0;
  const da = new Date(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  const db = new Date(Number(b[1]), Number(b[2]) - 1, Number(b[3]));
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

function shiftYmdByDays(ymd: string, deltaDays: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd ?? '').trim());
  if (!m) return String(ymd ?? '').trim();
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  dt.setDate(dt.getDate() + deltaDays);
  const y = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

function firestorePayloadForCopiedStop(params: {
  source: Stop;
  newTripId: string;
  newStopId: string;
  actorUid: string;
  shiftedStopDate: string | undefined;
}): Record<string, any> {
  const { source: s, newTripId, newStopId, actorUid, shiftedStopDate } = params;
  const data: Record<string, any> = {
    stopId: newStopId,
    tripId: newTripId,
    locationName: s.locationName,
    status: s.status,
    order: s.order ?? 0,
    createdBy: actorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (s.coords) data.coords = s.coords;
  if (shiftedStopDate?.trim()) data.stopDate = shiftedStopDate.trim();
  if (s.arrivalTime) data.arrivalTime = s.arrivalTime;
  if (s.departureTime) data.departureTime = s.departureTime;
  if (s.legFromPrevious) data.legFromPrevious = s.legFromPrevious;
  if (s.placeRating != null && typeof s.placeRating === 'number' && !Number.isNaN(s.placeRating) && s.placeRating > 0) {
    data.placeRating = Math.round(s.placeRating * 10) / 10;
  }
  if (
    s.placeUserRatingsTotal != null &&
    typeof s.placeUserRatingsTotal === 'number' &&
    !Number.isNaN(s.placeUserRatingsTotal) &&
    s.placeUserRatingsTotal > 0
  ) {
    data.placeUserRatingsTotal = Math.round(s.placeUserRatingsTotal);
  }
  if (s.googlePlaceId?.trim()) data.googlePlaceId = s.googlePlaceId.trim();

  const fromList = Array.isArray(s.extraExpenses) && s.extraExpenses.length > 0;
  if (fromList) {
    const cleaned = materializeExpenseIds(sanitizeExtraExpensesInput(s.extraExpenses));
    if (cleaned.length > 0) {
      data.extraExpenses = cleaned;
      applyLegacyCostFieldsFromExpenses(data, cleaned);
    }
  } else if (s.cost != null && typeof s.cost === 'number' && !Number.isNaN(s.cost) && s.cost > 0) {
    const one: StopExtraExpense = {
      expenseId: newExpenseId(),
      amount: Math.round(s.cost * 100) / 100,
      extraExpenseTypeId: s.extraExpenseTypeId ?? null,
      extraExpenseTypeName: s.extraExpenseTypeName ?? null,
    };
    data.extraExpenses = [one];
    applyLegacyCostFieldsFromExpenses(data, [one]);
  }

  return data;
}

/**
 * Kaynak rotanın duraklarını ve (isteğe bağlı) araç/yakıt özetini kopyalar; yeni tarih aralığına göre durak günlerini kaydırır.
 * Yeni rota: `actorUid` admin ve tek katılımcı; yorum/anket/davet aynı değildir.
 */
export async function copyTripWithNewSchedule(params: {
  sourceTripId: string;
  actorUid: string;
  title: string;
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
}): Promise<string> {
  const sourceId = String(params.sourceTripId ?? '').trim();
  const actorUid = String(params.actorUid ?? '').trim();
  const title = String(params.title ?? '').trim();
  const startDate = String(params.startDate ?? '').trim();
  const endDate = String(params.endDate ?? '').trim();
  if (!sourceId || !actorUid) throw new Error('Eksik bilgi.');
  if (!title) throw new Error('Rota adı girin.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error('Tarihler YYYY-MM-DD olmalı.');
  }
  if (new Date(endDate + 'T12:00:00').getTime() < new Date(startDate + 'T12:00:00').getTime()) {
    throw new Error('Bitiş tarihi başlangıçtan önce olamaz.');
  }

  const source = await getTrip(sourceId);
  if (!source) throw new Error('Kaynak rota bulunamadı.');
  if (!source.attendees.some((a) => a.uid === actorUid)) {
    throw new Error('Bu rotayı kopyalamak için rotaya katılmış olmalısın.');
  }

  const stops = await getStopsForTrip(sourceId);
  const dayDelta = dayDeltaBetweenYmd(source.startDate, startDate);

  const tripRef = doc(collection(db, TRIPS));
  const newTripId = tripRef.id;
  const attendees: TripAttendee[] = [{ uid: actorUid, role: 'admin', rsvp: 'going' }];
  const tripPayload: Record<string, any> = {
    tripId: newTripId,
    adminId: actorUid,
    title,
    startDate,
    endDate,
    totalDistance: source.totalDistance ?? 0,
    totalFuelCost: source.totalFuelCost ?? 0,
    attendees,
    attendeeIds: [actorUid],
    planStatus: 'planned' satisfies TripPlanStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (source.vehicleLabel?.trim()) tripPayload.vehicleLabel = source.vehicleLabel.trim();
  if (
    source.tripConsumptionLPer100km != null &&
    typeof source.tripConsumptionLPer100km === 'number' &&
    !Number.isNaN(source.tripConsumptionLPer100km)
  ) {
    tripPayload.tripConsumptionLPer100km = source.tripConsumptionLPer100km;
  }
  if (
    source.fuelPricePerLiter != null &&
    typeof source.fuelPricePerLiter === 'number' &&
    !Number.isNaN(source.fuelPricePerLiter)
  ) {
    tripPayload.fuelPricePerLiter = source.fuelPricePerLiter;
  }
  const st = params.startTime?.trim();
  const et = params.endTime?.trim();
  if (st) tripPayload.startTime = st;
  if (et) tripPayload.endTime = et;
  stampTripEditor(tripPayload, actorUid);

  if (stops.length === 0) {
    const batch = writeBatch(db);
    batch.set(tripRef, tripPayload);
    await batch.commit();
    return newTripId;
  }

  let stopIndex = 0;
  let firstBatch = true;
  while (stopIndex < stops.length) {
    const batch = writeBatch(db);
    let ops = 0;
    if (firstBatch) {
      batch.set(tripRef, tripPayload);
      firstBatch = false;
      ops = 1;
    }
    while (stopIndex < stops.length && ops < 500) {
      const s = stops[stopIndex];
      const stopRef = doc(collection(db, STOPS));
      const shifted =
        s.stopDate?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(s.stopDate.trim())
          ? shiftYmdByDays(s.stopDate.trim(), dayDelta)
          : undefined;
      batch.set(
        stopRef,
        firestorePayloadForCopiedStop({
          source: s,
          newTripId,
          newStopId: stopRef.id,
          actorUid,
          shiftedStopDate: shifted,
        })
      );
      stopIndex++;
      ops++;
    }
    await batch.commit();
  }

  return newTripId;
}

export async function getTripsForUser(uid: string): Promise<Trip[]> {
  const q = query(collection(db, TRIPS), where('attendeeIds', 'array-contains', uid));
  const snap = await getDocs(q);
  const out: Trip[] = [];
  snap.forEach((d) => {
    const v = d.data() as any;
    out.push({
      tripId: d.id,
      adminId: v.adminId,
      title: v.title,
      startDate: v.startDate,
      endDate: v.endDate,
      totalDistance: v.totalDistance,
      totalFuelCost: v.totalFuelCost,
      vehicleLabel: v.vehicleLabel,
      tripConsumptionLPer100km: v.tripConsumptionLPer100km,
      fuelPricePerLiter: v.fuelPricePerLiter,
      attendees: parseAttendees(v.attendees),
      planStatus: parseTripPlanStatus(v.planStatus),
      commentActivityAt: v.commentActivityAt,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    });
  });
  out.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  return out;
}

export async function getTrip(tripId: string): Promise<Trip | null> {
  const ref = doc(db, TRIPS, tripId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const v = snap.data() as any;
  return {
    tripId: snap.id,
    adminId: v.adminId,
    title: v.title,
    startDate: v.startDate,
    endDate: v.endDate,
    startTime: v.startTime,
    endTime: v.endTime,
    totalDistance: v.totalDistance,
    totalFuelCost: v.totalFuelCost,
    vehicleLabel: v.vehicleLabel,
    tripConsumptionLPer100km: v.tripConsumptionLPer100km,
    fuelPricePerLiter: v.fuelPricePerLiter,
    attendees: parseAttendees(v.attendees),
    planStatus: parseTripPlanStatus(v.planStatus),
    commentActivityAt: v.commentActivityAt,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
}

/** Katılımcılar plan durumunu döngüsel değiştirir (planlandı → devam ediyor → tamamlandı). */
export async function updateTripPlanStatus(
  tripId: string,
  planStatus: TripPlanStatus,
  actorUid: string
): Promise<void> {
  const tid = String(tripId ?? '').trim();
  const uid = String(actorUid ?? '').trim();
  if (!tid || !uid) throw new Error('Eksik bilgi.');
  const t = await getTrip(tid);
  if (!t) throw new Error('Rota bulunamadı.');
  if (!t.attendees.some((a) => a.uid === uid)) {
    throw new Error('Bu rotanın durumunu yalnızca katılımcılar güncelleyebilir.');
  }
  const ref = doc(db, TRIPS, tid);
  const updates: Record<string, any> = {
    planStatus,
    updatedAt: serverTimestamp(),
  };
  stampTripEditor(updates, uid);
  await updateDoc(ref, updates);
}

/** Yorum eklendiğinde rota belgesini günceller (ana sayfa okunmamış özeti). */
export async function bumpTripCommentActivity(tripId: string): Promise<void> {
  const tid = String(tripId ?? '').trim();
  if (!tid) return;
  try {
    await updateDoc(doc(db, TRIPS, tid), {
      commentActivityAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch {
    /* izin yok / yok: sessiz */
  }
}

export async function getStopsForTrip(tripId: string): Promise<Stop[]> {
  const q = query(collection(db, STOPS), where('tripId', '==', tripId));
  const snap = await getDocs(q);
  const out: Stop[] = [];
  const docs = snap.docs;
  docs.forEach((d) => {
    const v = d.data() as any;
    out.push({
      stopId: d.id,
      tripId: v.tripId,
      locationName: v.locationName,
      stopDate: v.stopDate,
      placeRating: v.placeRating,
      placeUserRatingsTotal: v.placeUserRatingsTotal,
      googlePlaceId: typeof v.googlePlaceId === 'string' && v.googlePlaceId.trim() ? v.googlePlaceId.trim() : undefined,
      coords: normalizeStopCoords(v.coords),
      arrivalTime: v.arrivalTime,
      departureTime: v.departureTime,
      cost: v.cost,
      extraExpenses: parseStopExtraExpensesFromFirestore(v.extraExpenses),
      extraExpenseTypeId: v.extraExpenseTypeId ?? undefined,
      extraExpenseTypeName: v.extraExpenseTypeName ?? undefined,
      legFromPrevious: v.legFromPrevious,
      status: v.status || 'pending',
      order: v.order,
      createdBy: v.createdBy,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    });
  });
  out.sort((a, b) => {
    const oA = a.order ?? 999999;
    const oB = b.order ?? 999999;
    if (oA !== oB) return oA - oB;
    const tA = a.createdAt?.toMillis?.() ?? 0;
    const tB = b.createdAt?.toMillis?.() ?? 0;
    return tA - tB;
  });
  return out;
}

/** Anasayfa kartları: duraklar arası km/süre + durak ekstra masrafları (yakıt rotada). */
export type TripListMetrics = {
  distanceFromLegsKm: number;
  drivingDurationMin: number;
  extraCostsTotal: number;
};

export async function getTripListMetricsForHome(tripIds: string[]): Promise<Map<string, TripListMetrics>> {
  const unique = [...new Set(tripIds.filter((id) => String(id).trim()))];
  const map = new Map<string, TripListMetrics>();
  await Promise.all(
    unique.map(async (tripId) => {
      try {
        const stops = await getStopsForTrip(tripId);
        let distanceKm = 0;
        let durationMin = 0;
        let extraTotal = 0;
        for (const st of stops) {
          const leg = st.legFromPrevious;
          if (leg?.distanceKm != null && !Number.isNaN(leg.distanceKm)) distanceKm += leg.distanceKm;
          if (leg?.durationMin != null && !Number.isNaN(leg.durationMin)) durationMin += leg.durationMin;
          extraTotal += stopExtraTotal(st);
        }
        map.set(tripId, {
          distanceFromLegsKm: Math.round(distanceKm * 10) / 10,
          drivingDurationMin: Math.round(durationMin),
          extraCostsTotal: Math.round(extraTotal * 100) / 100,
        });
      } catch {
        map.set(tripId, {
          distanceFromLegsKm: 0,
          drivingDurationMin: 0,
          extraCostsTotal: 0,
        });
      }
    })
  );
  return map;
}

/** Profil özeti: kullanıcının katıldığı tüm rotaların toplamları */
export type UserTripAggregateStats = {
  tripCount: number;
  /** Duraklar arası km toplamı; bacak yoksa ilgili rotanın totalDistance değeri */
  totalKm: number;
  /** Duraklar arası tahmini sürüş süresi (dakika) */
  totalDrivingMinutes: number;
  /** Duraklardaki ekstra masraflar (TL) */
  totalStopExtraTl: number;
  /** Rota belgelerindeki yakıt tahmini toplamı (TL) */
  totalFuelTl: number;
  /** Ekstra + yakıt */
  totalCostTl: number;
  stopCount: number;
  approvedStopCount: number;
};

function tripMetricsFromStopsForAggregate(stops: Stop[], trip: Trip): {
  km: number;
  drivingMin: number;
  extraTl: number;
} {
  let distanceKm = 0;
  let durationMin = 0;
  let extraTotal = 0;
  for (const st of stops) {
    const leg = st.legFromPrevious;
    if (leg?.distanceKm != null && !Number.isNaN(leg.distanceKm)) distanceKm += leg.distanceKm;
    if (leg?.durationMin != null && !Number.isNaN(leg.durationMin)) durationMin += leg.durationMin;
    extraTotal += stopExtraTotal(st);
  }
  let km = Math.round(distanceKm * 10) / 10;
  if (km === 0 && trip.totalDistance != null && typeof trip.totalDistance === 'number' && !Number.isNaN(trip.totalDistance) && trip.totalDistance > 0) {
    km = Math.round(trip.totalDistance * 10) / 10;
  }
  return {
    km,
    drivingMin: Math.round(durationMin),
    extraTl: Math.round(extraTotal * 100) / 100,
  };
}

export async function getUserTripAggregateStats(uid: string): Promise<UserTripAggregateStats> {
  const trips = await getTripsForUser(uid);
  if (trips.length === 0) {
    return {
      tripCount: 0,
      totalKm: 0,
      totalDrivingMinutes: 0,
      totalStopExtraTl: 0,
      totalFuelTl: 0,
      totalCostTl: 0,
      stopCount: 0,
      approvedStopCount: 0,
    };
  }
  const stopsLists = await Promise.all(trips.map((t) => getStopsForTrip(t.tripId)));

  let totalKm = 0;
  let totalDrivingMinutes = 0;
  let totalStopExtraTl = 0;
  let totalFuelTl = 0;
  let stopCount = 0;
  let approvedStopCount = 0;

  trips.forEach((trip, i) => {
    const stops = stopsLists[i] ?? [];
    const m = tripMetricsFromStopsForAggregate(stops, trip);
    totalKm += m.km;
    totalDrivingMinutes += m.drivingMin;
    totalStopExtraTl += m.extraTl;
    const fuel = trip.totalFuelCost;
    if (fuel != null && typeof fuel === 'number' && !Number.isNaN(fuel) && fuel > 0) {
      totalFuelTl += fuel;
    }
    for (const s of stops) {
      stopCount++;
      if (s.status === 'approved') approvedStopCount++;
    }
  });

  totalKm = Math.round(totalKm * 10) / 10;
  totalStopExtraTl = Math.round(totalStopExtraTl * 100) / 100;
  totalFuelTl = Math.round(totalFuelTl * 100) / 100;
  const totalCostTl = Math.round((totalStopExtraTl + totalFuelTl) * 100) / 100;

  return {
    tripCount: trips.length,
    totalKm,
    totalDrivingMinutes,
    totalStopExtraTl,
    totalFuelTl,
    totalCostTl,
    stopCount,
    approvedStopCount,
  };
}

export async function addStop(params: {
  tripId: string;
  locationName: string;
  createdBy: string;
  status?: Stop['status'];
  /** YYYY-MM-DD */
  stopDate?: string;
  coords?: { latitude: number; longitude: number };
  order?: number;
  legFromPrevious?: LegFromPrevious;
  placeRating?: number;
  placeUserRatingsTotal?: number;
  googlePlaceId?: string;
}): Promise<string> {
  const ref = doc(collection(db, STOPS));
  const data: Record<string, any> = {
    stopId: ref.id,
    tripId: params.tripId,
    locationName: params.locationName,
    status: params.status ?? 'pending',
    createdBy: params.createdBy,
    order: params.order ?? 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (params.coords) data.coords = params.coords;
  if (params.stopDate?.trim()) data.stopDate = params.stopDate.trim();
  if (params.legFromPrevious) data.legFromPrevious = params.legFromPrevious;
  if (
    params.placeRating != null &&
    typeof params.placeRating === 'number' &&
    !Number.isNaN(params.placeRating) &&
    params.placeRating > 0
  ) {
    data.placeRating = Math.round(params.placeRating * 10) / 10;
  }
  if (
    params.placeUserRatingsTotal != null &&
    typeof params.placeUserRatingsTotal === 'number' &&
    !Number.isNaN(params.placeUserRatingsTotal) &&
    params.placeUserRatingsTotal > 0
  ) {
    data.placeUserRatingsTotal = Math.round(params.placeUserRatingsTotal);
  }
  if (params.googlePlaceId?.trim()) data.googlePlaceId = params.googlePlaceId.trim();
  await setDoc(ref, data);
  return ref.id;
}

export async function reorderStops(
  tripId: string,
  orderedStopIds: string[],
  editedByUid?: string
): Promise<void> {
  const batch = writeBatch(db);
  orderedStopIds.forEach((stopId, index) => {
    const ref = doc(db, STOPS, stopId);
    const u: Record<string, any> = { order: index, updatedAt: serverTimestamp() };
    stampStopEditor(u, editedByUid);
    batch.update(ref, u);
  });
  await batch.commit();
}

export async function updateStopStatus(
  stopId: string,
  status: Stop['status'],
  editedByUid?: string
): Promise<void> {
  const ref = doc(db, STOPS, stopId);
  const updates: Record<string, any> = { status, updatedAt: serverTimestamp() };
  stampStopEditor(updates, editedByUid);
  await updateDoc(ref, updates);
}

export async function updateStopTimes(
  stopId: string,
  data: { arrivalTime?: string; departureTime?: string },
  editedByUid?: string
): Promise<void> {
  const ref = doc(db, STOPS, stopId);
  const updates: Record<string, any> = { updatedAt: serverTimestamp() };
  if (data.arrivalTime !== undefined) updates.arrivalTime = data.arrivalTime;
  if (data.departureTime !== undefined) updates.departureTime = data.departureTime;
  stampStopEditor(updates, editedByUid);
  await updateDoc(ref, updates);
}

export async function updateStopCoords(
  stopId: string,
  coords: { latitude: number; longitude: number },
  editedByUid?: string
): Promise<void> {
  const ref = doc(db, STOPS, stopId);
  const updates: Record<string, any> = { coords, updatedAt: serverTimestamp() };
  stampStopEditor(updates, editedByUid);
  await updateDoc(ref, updates);
}

/** Durak ekstra masraflarını tam liste olarak yazar; `cost` ve tek satır tür alanlarını senkronlar */
export async function updateStopExtraExpenses(
  stopId: string,
  expenses: StopExtraExpense[],
  editedByUid?: string
): Promise<void> {
  const ref = doc(db, STOPS, stopId);
  let cleaned = sanitizeExtraExpensesInput(expenses);
  cleaned = materializeExpenseIds(cleaned);
  const updates: Record<string, any> = { updatedAt: serverTimestamp() };
  updates.extraExpenses = cleaned.length > 0 ? cleaned : null;
  applyLegacyCostFieldsFromExpenses(updates, cleaned);
  stampStopEditor(updates, editedByUid);
  await updateDoc(ref, updates);
}

/** Tek tutar (eski API); tüm listeyi tek satırla değiştirir */
export async function updateStopCost(
  stopId: string,
  cost: number | undefined,
  expenseType?: { id: string; name: string } | null,
  editedByUid?: string
): Promise<void> {
  if (cost === undefined || cost === null || isNaN(cost) || cost <= 0) {
    await updateStopExtraExpenses(stopId, [], editedByUid);
    return;
  }
  await updateStopExtraExpenses(
    stopId,
    [
      {
        expenseId: newExpenseId(),
        amount: Math.round(cost * 100) / 100,
        extraExpenseTypeId: expenseType?.id ?? null,
        extraExpenseTypeName: expenseType?.name ?? null,
      },
    ],
    editedByUid
  );
}

export async function updateStopLegFromPrevious(
  stopId: string,
  leg: {
    distanceKm?: number;
    durationMin?: number;
    distanceBasis?: 'driving' | 'straight_line';
  } | null
): Promise<void> {
  const ref = doc(db, STOPS, stopId);
  await updateDoc(ref, {
    legFromPrevious: leg ?? null,
    updatedAt: serverTimestamp(),
  });
}

export async function updateStopFromPayload(
  stopId: string,
  payload: {
    locationName?: string;
    stopDate?: string | null;
    arrivalTime?: string;
    departureTime?: string;
    cost?: number;
    extraExpenseTypeId?: string | null;
    extraExpenseTypeName?: string | null;
    extraExpenses?: StopExtraExpense[] | null;
    coords?: { latitude: number; longitude: number };
    placeRating?: number | null;
    placeUserRatingsTotal?: number | null;
    googlePlaceId?: string | null;
  },
  editedByUid?: string
): Promise<void> {
  const ref = doc(db, STOPS, stopId);
  const updates: Record<string, any> = { updatedAt: serverTimestamp() };
  if (payload.locationName !== undefined) updates.locationName = payload.locationName;
  if (payload.stopDate !== undefined) updates.stopDate = payload.stopDate?.trim() ? payload.stopDate.trim() : null;
  if (payload.arrivalTime !== undefined) updates.arrivalTime = payload.arrivalTime || null;
  if (payload.departureTime !== undefined) updates.departureTime = payload.departureTime || null;

  if (payload.extraExpenses !== undefined) {
    let cleaned = sanitizeExtraExpensesInput(payload.extraExpenses ?? []);
    cleaned = materializeExpenseIds(cleaned);
    updates.extraExpenses = cleaned.length > 0 ? cleaned : null;
    applyLegacyCostFieldsFromExpenses(updates, cleaned);
  } else if (payload.cost !== undefined) {
    const c = payload.cost;
    if (c == null || c === 0 || (typeof c === 'number' && isNaN(c))) {
      updates.cost = null;
      updates.extraExpenseTypeId = null;
      updates.extraExpenseTypeName = null;
      updates.extraExpenses = null;
    } else {
      const one: StopExtraExpense = {
        expenseId: newExpenseId(),
        amount: Math.round(c * 100) / 100,
        extraExpenseTypeId: payload.extraExpenseTypeId ?? null,
        extraExpenseTypeName: payload.extraExpenseTypeName ?? null,
      };
      updates.extraExpenses = [one];
      updates.cost = one.amount;
      if (payload.extraExpenseTypeId !== undefined)
        updates.extraExpenseTypeId = payload.extraExpenseTypeId;
      if (payload.extraExpenseTypeName !== undefined)
        updates.extraExpenseTypeName = payload.extraExpenseTypeName;
    }
  }
  if (payload.extraExpenseTypeId !== undefined && payload.extraExpenses === undefined)
    updates.extraExpenseTypeId = payload.extraExpenseTypeId;
  if (payload.extraExpenseTypeName !== undefined && payload.extraExpenses === undefined)
    updates.extraExpenseTypeName = payload.extraExpenseTypeName;
  if (payload.coords !== undefined) updates.coords = payload.coords;
  if (payload.placeRating !== undefined) {
    updates.placeRating =
      payload.placeRating == null || Number.isNaN(payload.placeRating) || payload.placeRating <= 0
        ? null
        : Math.round(payload.placeRating * 10) / 10;
  }
  if (payload.placeUserRatingsTotal !== undefined) {
    updates.placeUserRatingsTotal =
      payload.placeUserRatingsTotal == null ||
      Number.isNaN(payload.placeUserRatingsTotal) ||
      payload.placeUserRatingsTotal < 0
        ? null
        : Math.round(payload.placeUserRatingsTotal);
  }
  if (payload.googlePlaceId !== undefined) {
    updates.googlePlaceId =
      payload.googlePlaceId == null || !String(payload.googlePlaceId).trim()
        ? null
        : String(payload.googlePlaceId).trim();
  }
  stampStopEditor(updates, editedByUid);
  await updateDoc(ref, updates);
}

export async function updateTripVehiclePlanning(
  tripId: string,
  data: {
    vehicleLabel?: string;
    tripConsumptionLPer100km?: number;
    fuelPricePerLiter?: number;
    totalDistance?: number;
    totalFuelCost?: number;
  },
  editedByUid?: string
): Promise<void> {
  const ref = doc(db, TRIPS, tripId);
  const updates: Record<string, any> = { updatedAt: serverTimestamp() };
  if (data.vehicleLabel !== undefined) updates.vehicleLabel = data.vehicleLabel || null;
  if (data.tripConsumptionLPer100km !== undefined)
    updates.tripConsumptionLPer100km = data.tripConsumptionLPer100km;
  if (data.fuelPricePerLiter !== undefined) updates.fuelPricePerLiter = data.fuelPricePerLiter;
  if (data.totalDistance !== undefined) updates.totalDistance = data.totalDistance;
  if (data.totalFuelCost !== undefined) updates.totalFuelCost = data.totalFuelCost;
  stampTripEditor(updates, editedByUid);
  await updateDoc(ref, updates);
}

/**
 * attendeeIds ile attendees[].uid uyumsuzsa (eski veri / manuel düzenleme) Firestore kuralları yorumları reddedebilir.
 * Yalnızca rota admini çalıştırabilir; kurallar admin güncellemesine izin verir.
 */
export async function repairAttendeeIdsFromAttendeesIfAdmin(
  tripId: string,
  actingUid: string
): Promise<void> {
  const ref = doc(db, TRIPS, tripId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const v = snap.data() as any;
  if (v.adminId !== actingUid) return;
  const attendees: TripAttendee[] = parseAttendees(v.attendees);
  const fromAttendees = attendees.map((a) => a.uid).filter(Boolean);
  const current: string[] = Array.isArray(v.attendeeIds) ? v.attendeeIds.filter(Boolean) : [];
  const merged = new Set<string>([...current, ...fromAttendees]);
  if (typeof v.adminId === 'string' && v.adminId) merged.add(v.adminId);
  const nextIds = Array.from(merged);
  const norm = (ids: string[]) =>
    [...new Set(ids)]
      .sort()
      .join('\u001f');
  if (norm(current) === norm(nextIds)) return;
  const updates: Record<string, any> = { attendeeIds: nextIds, updatedAt: serverTimestamp() };
  stampTripEditor(updates, actingUid);
  await updateDoc(ref, updates);
}

export async function addAttendeeToTrip(
  tripId: string,
  uid: string,
  role: 'editor' | 'viewer',
  editedByUid?: string
): Promise<void> {
  const ref = doc(db, TRIPS, tripId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Rota bulunamadı.');
  const v = snap.data() as any;
  const attendeeIds: string[] = v.attendeeIds || [];
  if (attendeeIds.includes(uid)) return;
  const existingBefore = [...attendeeIds];
  const attendees: TripAttendee[] = parseAttendees(v.attendees);
  attendees.push({ uid, role, rsvp: 'maybe' });
  attendeeIds.push(uid);
  const updates: Record<string, any> = {
    attendees,
    attendeeIds,
    updatedAt: serverTimestamp(),
  };
  stampTripEditor(updates, editedByUid);
  await updateDoc(ref, updates);

  const tripTitle = String(v.title || 'Rota');
  const actorUid = String(editedByUid || v.adminId || uid).trim();
  const selfAdd = actorUid === uid;
  let adderName = 'Bir kullanıcı';
  if (!selfAdd) {
    try {
      const adderProf = await getUserProfile(actorUid);
      adderName = adderProf?.displayName?.trim() || adderName;
    } catch {
      /* profil yok */
    }
  }
  let addedName = 'Bir kullanıcı';
  try {
    const addedProf = await getUserProfile(uid);
    addedName = addedProf?.displayName?.trim() || addedName;
  } catch {
    /* profil yok */
  }

  const addedYouPreview = selfAdd
    ? `«${tripTitle}» rotasına katıldın`
    : `${adderName} seni «${tripTitle}» rotasına ekledi`;

  try {
    await pushTripMembershipNotification({
      toUid: uid,
      tripId,
      tripTitle,
      actorUid,
      kind: 'added_you',
      preview: addedYouPreview,
    });
  } catch {
    /* bildirim yazılamazsa rota yine eklendi */
  }

  for (const oid of existingBefore) {
    if (oid === uid || oid === actorUid) continue;
    try {
      await pushTripMembershipNotification({
        toUid: oid,
        tripId,
        tripTitle,
        actorUid,
        kind: 'member_joined',
        preview: `${addedName} «${tripTitle}» rotasına katıldı`,
      });
    } catch {
      /* tek tek atla */
    }
  }
}

/** Katılımcı kendi isteğiyle rotadan çıkar; admin ayrılırsa başka bir üye admin olur. Son kişi ayrılamaz. */
export async function leaveTripAsAttendee(tripId: string, actorUid: string): Promise<void> {
  const tid = String(tripId ?? '').trim();
  const uid = String(actorUid ?? '').trim();
  if (!tid || !uid) throw new Error('Eksik bilgi.');
  const ref = doc(db, TRIPS, tid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Rota bulunamadı.');
  const v = snap.data() as any;
  const attendees: TripAttendee[] = parseAttendees(v.attendees);
  const idx = attendees.findIndex((a) => a.uid === uid);
  if (idx === -1) throw new Error('Bu rotanın katılımcısı değilsin.');
  if (attendees.length <= 1) {
    throw new Error('Son katılımcı olarak rotadan ayrılamazsın. Rotayı silmek için detay ekranını kullan.');
  }

  const tripTitle = String(v.title || 'Rota');
  let adminId: string = v.adminId;
  let nextAttendees = attendees.filter((a) => a.uid !== uid);

  if (adminId === uid) {
    const prefer =
      nextAttendees.find((a) => a.role === 'editor') ??
      nextAttendees.find((a) => a.role === 'viewer') ??
      nextAttendees[0];
    if (!prefer) throw new Error('Yönetici devri yapılamadı.');
    adminId = prefer.uid;
    nextAttendees = nextAttendees.map((a) =>
      a.uid === adminId ? { ...a, role: 'admin' as const } : a
    );
  }

  const nextIds = nextAttendees.map((a) => a.uid).filter(Boolean);
  const updates: Record<string, any> = {
    attendees: nextAttendees,
    attendeeIds: nextIds,
    adminId,
    updatedAt: serverTimestamp(),
  };
  stampTripEditor(updates, uid);
  await updateDoc(ref, updates);

  let leaverName = 'Bir kullanıcı';
  try {
    const p = await getUserProfile(uid);
    leaverName = p?.displayName?.trim() || leaverName;
  } catch {
    /* */
  }

  for (const oid of nextIds) {
    try {
      await pushTripMembershipNotification({
        toUid: oid,
        tripId: tid,
        tripTitle,
        actorUid: uid,
        kind: 'member_left',
        preview: `${leaverName} «${tripTitle}» rotasından ayrıldı`,
      });
    } catch {
      /* */
    }
  }
}

/**
 * Yalnızca rota yöneticisi (`adminId`) başka bir katılımcıyı çıkarır; hedef `attendeeIds` / `attendees` güncellenir.
 * Oluşturucu listeden çıkarılamaz; yönetici kendini çıkaramaz (bunun için `leaveTripAsAttendee`).
 */
export async function removeAttendeeByAdmin(params: {
  tripId: string;
  targetUid: string;
  actorUid: string;
}): Promise<void> {
  const tid = String(params.tripId ?? '').trim();
  const targetUid = String(params.targetUid ?? '').trim();
  const actorUid = String(params.actorUid ?? '').trim();
  if (!tid || !targetUid || !actorUid) throw new Error('Eksik bilgi.');
  if (targetUid === actorUid) {
    throw new Error('Kendini çıkarmak için ana sayfada rotaya uzun basıp «Rotadan ayrıl» kullan.');
  }

  const ref = doc(db, TRIPS, tid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Rota bulunamadı.');
  const v = snap.data() as any;
  if (v.adminId !== actorUid) throw new Error('Sadece rota yöneticisi katılımcı çıkarabilir.');
  if (targetUid === v.adminId) throw new Error('Rota oluşturucusu listeden çıkarılamaz.');

  const attendees: TripAttendee[] = parseAttendees(v.attendees);
  const idx = attendees.findIndex((a) => a.uid === targetUid);
  if (idx === -1) throw new Error('Katılımcı bulunamadı.');
  if (attendees.length <= 1) throw new Error('Son katılımcı çıkarılamaz.');

  const tripTitle = String(v.title || 'Rota');
  const nextAttendees = attendees.filter((a) => a.uid !== targetUid);
  const nextIds = nextAttendees.map((a) => a.uid).filter(Boolean);
  const updates: Record<string, any> = {
    attendees: nextAttendees,
    attendeeIds: nextIds,
    updatedAt: serverTimestamp(),
  };
  stampTripEditor(updates, actorUid);
  await updateDoc(ref, updates);

  let adminName = 'Yönetici';
  try {
    const ap = await getUserProfile(actorUid);
    adminName = ap?.displayName?.trim() || adminName;
  } catch {
    /* */
  }
  let removedName = 'Bir kullanıcı';
  try {
    const rp = await getUserProfile(targetUid);
    removedName = rp?.displayName?.trim() || removedName;
  } catch {
    /* */
  }

  try {
    await pushTripMembershipNotification({
      toUid: targetUid,
      tripId: tid,
      tripTitle,
      actorUid,
      kind: 'removed_by_admin',
      preview: `${adminName} seni «${tripTitle}» rotasından çıkardı`,
    });
  } catch {
    /* */
  }

  for (const oid of nextIds) {
    try {
      await pushTripMembershipNotification({
        toUid: oid,
        tripId: tid,
        tripTitle,
        actorUid,
        kind: 'member_removed',
        preview: `${adminName}, ${removedName} kullanıcısını «${tripTitle}» rotasından çıkardı`,
      });
    } catch {
      /* */
    }
  }
}

export async function updateAttendeeRsvp(
  tripId: string,
  uid: string,
  rsvp: 'going' | 'maybe' | 'declined',
  editedByUid?: string
): Promise<void> {
  const ref = doc(db, TRIPS, tripId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Rota bulunamadı.');
  const v = snap.data() as any;
  const attendees: TripAttendee[] = parseAttendees(v.attendees);
  const idx = attendees.findIndex((a) => a.uid === uid);
  if (idx === -1) throw new Error('Katılımcı bulunamadı.');
  attendees[idx] = { ...attendees[idx], rsvp };
  const updates: Record<string, any> = { attendees, updatedAt: serverTimestamp() };
  stampTripEditor(updates, editedByUid);
  await updateDoc(ref, updates);
}

export async function updateTripDistanceAndFuel(
  tripId: string,
  totalDistance: number,
  totalFuelCost: number
): Promise<void> {
  const ref = doc(db, TRIPS, tripId);
  await updateDoc(ref, {
    totalDistance,
    totalFuelCost,
    updatedAt: serverTimestamp(),
  });
}

/** Rota bilgisi: başlık, tarih ve plan saatleri */
export async function updateTripDetails(
  tripId: string,
  data: {
    title?: string;
    startDate?: string;
    endDate?: string;
    startTime?: string | null;
    endTime?: string | null;
  },
  editedByUid?: string
): Promise<void> {
  const ref = doc(db, TRIPS, tripId);
  const updates: Record<string, any> = { updatedAt: serverTimestamp() };
  if (data.title !== undefined) updates.title = data.title.trim();
  if (data.startDate !== undefined) updates.startDate = data.startDate;
  if (data.endDate !== undefined) updates.endDate = data.endDate;
  if (data.startTime !== undefined) {
    updates.startTime = data.startTime && String(data.startTime).trim() ? String(data.startTime).trim() : null;
  }
  if (data.endTime !== undefined) {
    updates.endTime = data.endTime && String(data.endTime).trim() ? String(data.endTime).trim() : null;
  }
  stampTripEditor(updates, editedByUid);
  await updateDoc(ref, updates);
}

/** Durağı ve bağlı yorumları siler (istemci tarafında yetki kontrolü yapın). */
export async function deleteStop(stopId: string): Promise<void> {
  const cq = query(collection(db, COMMENTS_COL), where('stopId', '==', stopId));
  const csnap = await getDocs(cq);
  if (!csnap.empty) {
    const batch = writeBatch(db);
    csnap.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await deleteDoc(doc(db, STOPS, stopId));
}

/** Tüm durakları ve rota dokümanını siler (yalnızca güvenilir istemcilerde admin kontrolü yapın). */
export async function deleteTrip(tripId: string): Promise<void> {
  const CHUNK = 400;
  const tid = String(tripId ?? '').trim();
  if (!tid) throw new Error('Rota kimliği yok.');

  const tripCommentDocs = (await getDocs(collection(db, TRIPS, tid, 'comments'))).docs;
  for (let i = 0; i < tripCommentDocs.length; i += CHUNK) {
    const batch = writeBatch(db);
    tripCommentDocs.slice(i, i + CHUNK).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  const rootTripCommentDocs = (
    await getDocs(query(collection(db, COMMENTS_COL), where('tripId', '==', tid)))
  ).docs;
  for (let i = 0; i < rootTripCommentDocs.length; i += CHUNK) {
    const batch = writeBatch(db);
    rootTripCommentDocs.slice(i, i + CHUNK).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  const stopDocsForComments = (await getDocs(query(collection(db, STOPS), where('tripId', '==', tid))))
    .docs;
  for (const sd of stopDocsForComments) {
    const csnap = await getDocs(query(collection(db, COMMENTS_COL), where('stopId', '==', sd.id)));
    const cdocs = csnap.docs;
    for (let i = 0; i < cdocs.length; i += CHUNK) {
      const batch = writeBatch(db);
      cdocs.slice(i, i + CHUNK).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }

  const pollDocs = (await getDocs(collection(db, TRIPS, tid, 'polls'))).docs;
  for (const pollDoc of pollDocs) {
    const voteDocs = (await getDocs(collection(db, TRIPS, tid, 'polls', pollDoc.id, 'votes'))).docs;
    for (let i = 0; i < voteDocs.length; i += CHUNK) {
      const batch = writeBatch(db);
      voteDocs.slice(i, i + CHUNK).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    await deleteDoc(pollDoc.ref);
  }

  const proposalDocs = (await getDocs(query(collection(db, TRIP_PROPOSALS), where('tripId', '==', tid))))
    .docs;
  for (let i = 0; i < proposalDocs.length; i += CHUNK) {
    const batch = writeBatch(db);
    proposalDocs.slice(i, i + CHUNK).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  const stopDocs = stopDocsForComments;
  for (let i = 0; i < stopDocs.length; i += CHUNK) {
    const batch = writeBatch(db);
    stopDocs.slice(i, i + CHUNK).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  await deleteDoc(doc(db, TRIPS, tid));
}

/**
 * Koordinatı olan duraklar arasında mesafe/süre hesaplar (Google Routes API — computeRoutes).
 * Başarısız olursa hata fırlatır; önceki duraklar arası verileri silmez.
 * trip.totalFuelCost korunur; totalDistance güncellenir.
 */
export async function recalculateLegsForTrip(tripId: string): Promise<{ totalKm: number } | null> {
  const stops = await getStopsForTrip(tripId);
  const indices: number[] = [];
  const coords: { latitude: number; longitude: number }[] = [];
  stops.forEach((s, i) => {
    if (s.coords?.latitude != null && s.coords?.longitude != null) {
      indices.push(i);
      coords.push({ latitude: s.coords.latitude, longitude: s.coords.longitude });
    }
  });
  if (coords.length < 2) return null;

  const legs = await fetchDrivingLegs(coords);

  for (const s of stops) {
    await updateStopLegFromPrevious(s.stopId, null);
  }
  for (let j = 0; j < legs.length; j++) {
    const stopId = stops[indices[j + 1]].stopId;
    await updateStopLegFromPrevious(stopId, {
      distanceKm: legs[j].distanceKm,
      durationMin: legs[j].durationMin,
      distanceBasis: 'driving',
    });
  }
  const totalKm = sumLegDistanceKm(legs);
  const trip = await getTrip(tripId);
  await updateTripDistanceAndFuel(tripId, totalKm, trip?.totalFuelCost ?? 0);
  return { totalKm };
}
