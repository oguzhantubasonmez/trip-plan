import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getTrip } from './trips';
import { getUserProfile } from './userProfile';

export type PollVoterRow = {
  uid: string;
  displayName: string;
  choiceIndex: number;
};

function choiceIndexFromVoteData(
  v: Record<string, unknown> | undefined,
  maxOptions: number
): number | null {
  if (!v || maxOptions <= 0) return null;
  const idx = Number(v.choiceIndex);
  if (Number.isInteger(idx) && idx >= 0 && idx < maxOptions) return idx;
  if (v.choice === 'a' && maxOptions >= 1) return 0;
  if (v.choice === 'b' && maxOptions >= 2) return 1;
  return null;
}

async function displayNameForUid(uid: string): Promise<string> {
  try {
    const p = await getUserProfile(uid);
    const n = p?.displayName?.trim() || p?.phoneNumber?.trim();
    if (n) return n;
  } catch {
    /* yok */
  }
  return `Kullanıcı ${uid.slice(0, 6)}`;
}

/**
 * Keşfet anketi: yalnızca oluşturan ve davetliler oy belgelerini görebilir.
 */
export async function listDiscoverPollVoters(
  pollId: string,
  requesterUid: string,
  optionCount: number
): Promise<PollVoterRow[]> {
  const pid = String(pollId ?? '').trim();
  if (!pid || !requesterUid) return [];
  const pollRef = doc(db, 'discoverPolls', pid);
  const pollSnap = await getDoc(pollRef);
  if (!pollSnap.exists()) return [];
  const p = pollSnap.data() as Record<string, unknown>;
  const createdBy = String(p.createdBy || '');
  const invited: string[] = Array.isArray(p.invitedUserIds) ? (p.invitedUserIds as string[]) : [];
  if (requesterUid !== createdBy && !invited.includes(requesterUid)) {
    throw new Error('Bu anketin oy dağılımını göremezsin.');
  }
  const maxOpt = Math.max(2, Math.min(32, optionCount || 2));
  const snap = await getDocs(collection(db, 'discoverPolls', pid, 'votes'));
  const rows: PollVoterRow[] = [];
  for (const d of snap.docs) {
    const uid = d.id;
    const v = d.data() as Record<string, unknown>;
    const ci = choiceIndexFromVoteData(v, maxOpt);
    if (ci == null) continue;
    const displayName = await displayNameForUid(uid);
    rows.push({ uid, displayName, choiceIndex: ci });
  }
  rows.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, 'tr', { sensitivity: 'base' })
  );
  return rows;
}

/**
 * Rota anketi: rotanın katılımcıları oy belgelerini görebilir.
 */
export async function listTripPollVoters(
  tripId: string,
  pollId: string,
  requesterUid: string,
  optionCount: number
): Promise<PollVoterRow[]> {
  const tid = String(tripId ?? '').trim();
  const pid = String(pollId ?? '').trim();
  if (!tid || !pid || !requesterUid) return [];
  const trip = await getTrip(tid);
  if (!trip) throw new Error('Rota bulunamadı.');
  const onTrip = trip.attendees.some((a) => a.uid === requesterUid);
  if (!onTrip) throw new Error('Bu anketin oy dağılımını göremezsin.');
  const maxOpt = Math.max(2, Math.min(32, optionCount || 2));
  const snap = await getDocs(collection(db, 'trips', tid, 'polls', pid, 'votes'));
  const rows: PollVoterRow[] = [];
  for (const d of snap.docs) {
    const uid = d.id;
    const v = d.data() as Record<string, unknown>;
    const ci = choiceIndexFromVoteData(v, maxOpt);
    if (ci == null) continue;
    const displayName = await displayNameForUid(uid);
    rows.push({ uid, displayName, choiceIndex: ci });
  }
  rows.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, 'tr', { sensitivity: 'base' })
  );
  return rows;
}
