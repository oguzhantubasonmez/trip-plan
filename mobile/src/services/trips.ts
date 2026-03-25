import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { LegFromPrevious, Stop, StopExtraExpense, Trip, TripAttendee } from '../types/trip';
import {
  materializeExpenseIds,
  newExpenseId,
  parseStopExtraExpensesFromFirestore,
  sanitizeExtraExpensesInput,
  stopExtraTotal,
} from '../utils/stopExpenses';
import { fetchDrivingLegs, sumLegDistanceKm } from './directions';

const TRIPS = 'trips';
const STOPS = 'stops';
const COMMENTS_COL = 'comments';

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
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (params.startTime?.trim()) data.startTime = params.startTime.trim();
  if (params.endTime?.trim()) data.endTime = params.endTime.trim();
  await setDoc(ref, data);
  return tripId;
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
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
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
      coords: v.coords,
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
  await setDoc(ref, data);
  return ref.id;
}

export async function reorderStops(tripId: string, orderedStopIds: string[]): Promise<void> {
  const batch = writeBatch(db);
  orderedStopIds.forEach((stopId, index) => {
    const ref = doc(db, STOPS, stopId);
    batch.update(ref, { order: index, updatedAt: serverTimestamp() });
  });
  await batch.commit();
}

export async function updateStopStatus(stopId: string, status: Stop['status']): Promise<void> {
  const ref = doc(db, STOPS, stopId);
  await updateDoc(ref, { status, updatedAt: serverTimestamp() });
}

export async function updateStopTimes(
  stopId: string,
  data: { arrivalTime?: string; departureTime?: string }
): Promise<void> {
  const ref = doc(db, STOPS, stopId);
  const updates: Record<string, any> = { updatedAt: serverTimestamp() };
  if (data.arrivalTime !== undefined) updates.arrivalTime = data.arrivalTime;
  if (data.departureTime !== undefined) updates.departureTime = data.departureTime;
  await updateDoc(ref, updates);
}

export async function updateStopCoords(
  stopId: string,
  coords: { latitude: number; longitude: number }
): Promise<void> {
  const ref = doc(db, STOPS, stopId);
  await updateDoc(ref, { coords, updatedAt: serverTimestamp() });
}

/** Durak ekstra masraflarını tam liste olarak yazar; `cost` ve tek satır tür alanlarını senkronlar */
export async function updateStopExtraExpenses(
  stopId: string,
  expenses: StopExtraExpense[]
): Promise<void> {
  const ref = doc(db, STOPS, stopId);
  let cleaned = sanitizeExtraExpensesInput(expenses);
  cleaned = materializeExpenseIds(cleaned);
  const updates: Record<string, any> = { updatedAt: serverTimestamp() };
  updates.extraExpenses = cleaned.length > 0 ? cleaned : null;
  applyLegacyCostFieldsFromExpenses(updates, cleaned);
  await updateDoc(ref, updates);
}

/** Tek tutar (eski API); tüm listeyi tek satırla değiştirir */
export async function updateStopCost(
  stopId: string,
  cost: number | undefined,
  expenseType?: { id: string; name: string } | null
): Promise<void> {
  if (cost === undefined || cost === null || isNaN(cost) || cost <= 0) {
    await updateStopExtraExpenses(stopId, []);
    return;
  }
  await updateStopExtraExpenses(stopId, [
    {
      expenseId: newExpenseId(),
      amount: Math.round(cost * 100) / 100,
      extraExpenseTypeId: expenseType?.id ?? null,
      extraExpenseTypeName: expenseType?.name ?? null,
    },
  ]);
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
  }
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
  }
): Promise<void> {
  const ref = doc(db, TRIPS, tripId);
  const updates: Record<string, any> = { updatedAt: serverTimestamp() };
  if (data.vehicleLabel !== undefined) updates.vehicleLabel = data.vehicleLabel || null;
  if (data.tripConsumptionLPer100km !== undefined)
    updates.tripConsumptionLPer100km = data.tripConsumptionLPer100km;
  if (data.fuelPricePerLiter !== undefined) updates.fuelPricePerLiter = data.fuelPricePerLiter;
  if (data.totalDistance !== undefined) updates.totalDistance = data.totalDistance;
  if (data.totalFuelCost !== undefined) updates.totalFuelCost = data.totalFuelCost;
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
  await updateDoc(ref, { attendeeIds: nextIds, updatedAt: serverTimestamp() });
}

export async function addAttendeeToTrip(
  tripId: string,
  uid: string,
  role: 'editor' | 'viewer'
): Promise<void> {
  const ref = doc(db, TRIPS, tripId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Rota bulunamadı.');
  const v = snap.data() as any;
  const attendeeIds: string[] = v.attendeeIds || [];
  if (attendeeIds.includes(uid)) return;
  const attendees: TripAttendee[] = parseAttendees(v.attendees);
  attendees.push({ uid, role, rsvp: 'maybe' });
  attendeeIds.push(uid);
  await updateDoc(ref, {
    attendees,
    attendeeIds,
    updatedAt: serverTimestamp(),
  });
}

export async function updateAttendeeRsvp(
  tripId: string,
  uid: string,
  rsvp: 'going' | 'maybe' | 'declined'
): Promise<void> {
  const ref = doc(db, TRIPS, tripId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Rota bulunamadı.');
  const v = snap.data() as any;
  const attendees: TripAttendee[] = parseAttendees(v.attendees);
  const idx = attendees.findIndex((a) => a.uid === uid);
  if (idx === -1) throw new Error('Katılımcı bulunamadı.');
  attendees[idx] = { ...attendees[idx], rsvp };
  await updateDoc(ref, { attendees, updatedAt: serverTimestamp() });
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
  }
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

  const tripCommentDocs = (await getDocs(collection(db, TRIPS, tripId, 'comments'))).docs;
  for (let i = 0; i < tripCommentDocs.length; i += CHUNK) {
    const batch = writeBatch(db);
    tripCommentDocs.slice(i, i + CHUNK).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  const q = query(collection(db, STOPS), where('tripId', '==', tripId));
  const snap = await getDocs(q);
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const batch = writeBatch(db);
    docs.slice(i, i + CHUNK).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await deleteDoc(doc(db, TRIPS, tripId));
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
