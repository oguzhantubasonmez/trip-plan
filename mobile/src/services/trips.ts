import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Stop, Trip, TripAttendee } from '../types/trip';

const TRIPS = 'trips';
const STOPS = 'stops';

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
}): Promise<string> {
  const ref = doc(collection(db, TRIPS));
  const tripId = ref.id;
  const attendees: TripAttendee[] = [{ uid: params.adminId, role: 'admin', rsvp: 'going' }];
  const attendeeIds = [params.adminId];
  await setDoc(ref, {
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
  });
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
    totalDistance: v.totalDistance,
    totalFuelCost: v.totalFuelCost,
    attendees: parseAttendees(v.attendees),
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
}

export async function getStopsForTrip(tripId: string): Promise<Stop[]> {
  const q = query(collection(db, STOPS), where('tripId', '==', tripId));
  const snap = await getDocs(q);
  const out: Stop[] = [];
  const docs = snap.docs.sort(
    (a, b) => (a.data().createdAt?.toMillis?.() ?? 0) - (b.data().createdAt?.toMillis?.() ?? 0)
  );
  docs.forEach((d) => {
    const v = d.data() as any;
    out.push({
      stopId: d.id,
      tripId: v.tripId,
      locationName: v.locationName,
      coords: v.coords,
      arrivalTime: v.arrivalTime,
      departureTime: v.departureTime,
      cost: v.cost,
      status: v.status || 'pending',
      createdBy: v.createdBy,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    });
  });
  return out;
}

export async function addStop(params: {
  tripId: string;
  locationName: string;
  createdBy: string;
  status?: Stop['status'];
  coords?: { latitude: number; longitude: number };
}): Promise<string> {
  const ref = doc(collection(db, STOPS));
  const data: Record<string, any> = {
    stopId: ref.id,
    tripId: params.tripId,
    locationName: params.locationName,
    status: params.status ?? 'pending',
    createdBy: params.createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (params.coords) data.coords = params.coords;
  await setDoc(ref, data);
  return ref.id;
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
