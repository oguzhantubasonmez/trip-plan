import {
  arrayRemove,
  arrayUnion,
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
} from 'firebase/firestore';
import * as Contacts from 'expo-contacts';
import { db } from '../lib/firebase';
import { chunk } from '../utils/array';
import { normalizeE164 } from '../utils/phone';
import { getUserProfile } from './userProfile';

const REQUESTS = 'friendRequests';

export type MatchedUser = {
  uid: string;
  phoneNumber: string;
  displayName?: string;
  avatar?: string;
};

export type FriendRequest = {
  id: string;
  fromUid: string;
  toUid: string;
  status: 'pending';
  createdAt?: unknown;
};

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function requestDocId(fromUid: string, toUid: string): string {
  return `${fromUid}_${toUid}`;
}

export async function getDevicePhoneNumbersE164(): Promise<string[]> {
  const { status } = await Contacts.getPermissionsAsync();
  if (status !== 'granted') return [];

  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers],
    pageSize: 2000,
    pageOffset: 0,
  });

  const numbers: string[] = [];
  for (const c of data) {
    for (const p of c.phoneNumbers ?? []) {
      const n = normalizeE164(p.number ?? '');
      if (n) numbers.push(n);
    }
  }
  return unique(numbers);
}

export async function matchUsersByPhoneNumbers(phoneNumbersE164: string[]): Promise<MatchedUser[]> {
  const numbers = unique(phoneNumbersE164).filter(Boolean);
  if (!numbers.length) return [];

  const batches = chunk(numbers, 30);
  const out: MatchedUser[] = [];

  for (const b of batches) {
    const q = query(collection(db, 'users'), where('phoneNumber', 'in', b));
    const snap = await getDocs(q);
    snap.forEach((d) => {
      const v = d.data() as any;
      out.push({
        uid: d.id,
        phoneNumber: v.phoneNumber,
        displayName: v.displayName,
        avatar: v.avatar,
      });
    });
  }

  const byUid = new Map<string, MatchedUser>();
  for (const u of out) byUid.set(u.uid, u);
  return Array.from(byUid.values());
}

export async function addFriendBothWays(params: { currentUid: string; friendUid: string }) {
  const a = doc(db, 'users', params.currentUid);
  const b = doc(db, 'users', params.friendUid);
  await Promise.all([
    updateDoc(a, { friends: arrayUnion(params.friendUid) }),
    updateDoc(b, { friends: arrayUnion(params.currentUid) }),
  ]);
}

/** İki taraftan da `friends` dizisinden çıkarır; varsa bekleyen istek belgelerini temizler. */
export async function removeFriendBothWays(params: { currentUid: string; friendUid: string }): Promise<void> {
  const { currentUid, friendUid } = params;
  if (currentUid === friendUid) return;
  const a = doc(db, 'users', currentUid);
  const b = doc(db, 'users', friendUid);
  const forwardRef = doc(db, REQUESTS, requestDocId(currentUid, friendUid));
  const reverseRef = doc(db, REQUESTS, requestDocId(friendUid, currentUid));
  const ts = serverTimestamp();
  await Promise.all([
    updateDoc(a, { friends: arrayRemove(friendUid), updatedAt: ts }),
    updateDoc(b, { friends: arrayRemove(currentUid), updatedAt: ts }).catch(() => {}),
    deleteDoc(forwardRef).catch(() => {}),
    deleteDoc(reverseRef).catch(() => {}),
  ]);
}

async function isFriendWith(uid: string, otherUid: string): Promise<boolean> {
  const me = await getUserProfile(uid);
  return Boolean(me?.friends?.includes(otherUid));
}

/** Karşı taraftan da arkadaş listesindeysek onaylı sayılır (tek yönlü eski veri için). */
async function areConfirmedFriends(a: string, b: string): Promise<boolean> {
  const [ab, ba] = await Promise.all([isFriendWith(a, b), isFriendWith(b, a)]);
  return ab && ba;
}

export async function sendFriendRequest(params: { fromUid: string; toUid: string }): Promise<void> {
  const { fromUid, toUid } = params;
  if (fromUid === toUid) return;
  if (await areConfirmedFriends(fromUid, toUid)) return;

  const forwardId = requestDocId(fromUid, toUid);
  const reverseId = requestDocId(toUid, fromUid);
  const forwardRef = doc(db, REQUESTS, forwardId);
  const reverseRef = doc(db, REQUESTS, reverseId);

  const [forwardSnap, reverseSnap] = await Promise.all([getDoc(forwardRef), getDoc(reverseRef)]);

  if (forwardSnap.exists()) {
    const st = (forwardSnap.data() as any)?.status;
    if (st === 'pending') return;
  }

  if (reverseSnap.exists()) {
    const st = (reverseSnap.data() as any)?.status;
    if (st === 'pending') {
      await Promise.all([
        addFriendBothWays({ currentUid: fromUid, friendUid: toUid }),
        deleteDoc(reverseRef),
        deleteDoc(forwardRef).catch(() => {}),
      ]);
      return;
    }
  }

  await setDoc(forwardRef, {
    fromUid,
    toUid,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
}

export async function acceptFriendRequest(params: { fromUid: string; toUid: string }): Promise<void> {
  const { fromUid, toUid } = params;
  const ref = doc(db, REQUESTS, requestDocId(fromUid, toUid));
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('İstek bulunamadı.');
  const v = snap.data() as any;
  if (v.toUid !== toUid || v.status !== 'pending') throw new Error('Bu isteği onaylayamazsın.');
  await addFriendBothWays({ currentUid: toUid, friendUid: fromUid });
  await deleteDoc(ref);
}

export async function declineFriendRequest(params: { fromUid: string; toUid: string }): Promise<void> {
  const ref = doc(db, REQUESTS, requestDocId(params.fromUid, params.toUid));
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const v = snap.data() as any;
  if (v.toUid !== params.toUid || v.status !== 'pending') throw new Error('Bu istek reddedilemez.');
  await deleteDoc(ref);
}

/** Gönderdiğin bekleyen isteği geri alır. */
export async function cancelOutgoingFriendRequest(params: { fromUid: string; toUid: string }): Promise<void> {
  const ref = doc(db, REQUESTS, requestDocId(params.fromUid, params.toUid));
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const v = snap.data() as any;
  if (v.fromUid !== params.fromUid || v.toUid !== params.toUid || v.status !== 'pending') {
    throw new Error('Bu istek iptal edilemez.');
  }
  await deleteDoc(ref);
}

export async function listIncomingFriendRequests(toUid: string): Promise<FriendRequest[]> {
  const q = query(collection(db, REQUESTS), where('toUid', '==', toUid), where('status', '==', 'pending'));
  const snap = await getDocs(q);
  const out: FriendRequest[] = [];
  snap.forEach((d) => {
    const v = d.data() as any;
    out.push({
      id: d.id,
      fromUid: v.fromUid,
      toUid: v.toUid,
      status: 'pending',
      createdAt: v.createdAt,
    });
  });
  return out;
}

export async function listOutgoingFriendRequestTargetUids(fromUid: string): Promise<Set<string>> {
  const q = query(collection(db, REQUESTS), where('fromUid', '==', fromUid), where('status', '==', 'pending'));
  const snap = await getDocs(q);
  const set = new Set<string>();
  snap.forEach((d) => {
    const v = d.data() as any;
    if (v.toUid) set.add(v.toUid);
  });
  return set;
}

/** `candidateUids` senin `friends` dizinden gelmeli; karşı taraf da seni arkadaş listesinde tutuyorsa döner. */
export async function filterMutualFriendUids(myUid: string, candidateUids: string[]): Promise<string[]> {
  const ids = unique(candidateUids).filter((id) => id && id !== myUid);
  if (!ids.length) return [];
  const results = await Promise.all(
    ids.map(async (id) => {
      const p = await getUserProfile(id);
      return p?.friends?.includes(myUid) ? id : null;
    })
  );
  return results.filter((x): x is string => Boolean(x));
}
