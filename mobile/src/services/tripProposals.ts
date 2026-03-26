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
import type { TripProposal } from '../types/tripProposal';
import { updateStopFromPayload } from './trips';

const COL = 'tripProposals';

export async function createEditStopProposal(params: {
  tripId: string;
  stopId: string;
  proposedBy: string;
  payload: TripProposal['payload'];
}): Promise<string> {
  const ref = doc(collection(db, COL));
  await setDoc(ref, {
    proposalId: ref.id,
    tripId: params.tripId,
    stopId: params.stopId,
    proposedBy: params.proposedBy,
    payload: params.payload,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getPendingProposalsForTrip(tripId: string): Promise<TripProposal[]> {
  const q = query(collection(db, COL), where('tripId', '==', tripId));
  const snap = await getDocs(q);
  const out: TripProposal[] = [];
  snap.forEach((d) => {
    const v = d.data() as any;
    if (v.status !== 'pending') return;
    out.push({
      proposalId: d.id,
      tripId: v.tripId,
      stopId: v.stopId,
      proposedBy: v.proposedBy,
      payload: v.payload || {},
      status: v.status,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    });
  });
  out.sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
  return out;
}

export async function approveProposal(proposalId: string, appliedByUid?: string): Promise<void> {
  const ref = doc(db, COL, proposalId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Öneri bulunamadı.');
  const v = snap.data() as any;
  if (v.status !== 'pending') throw new Error('Öneri artık beklemede değil.');
  await updateStopFromPayload(v.stopId, v.payload || {}, appliedByUid);
  await updateDoc(ref, { status: 'approved', updatedAt: serverTimestamp() });
}

export async function rejectProposal(proposalId: string): Promise<void> {
  const ref = doc(db, COL, proposalId);
  await updateDoc(ref, { status: 'rejected', updatedAt: serverTimestamp() });
}
