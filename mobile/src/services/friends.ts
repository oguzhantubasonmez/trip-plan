import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  where,
} from 'firebase/firestore';
import * as Contacts from 'expo-contacts';
import { db } from '../lib/firebase';
import { chunk } from '../utils/array';
import { normalizeNameSearchKey } from '../utils/searchText';
import { normalizeE164, trPhoneFirestoreMatchVariants, canonicalizeTrPhoneE164 } from '../utils/phone';
import { getUserProfile } from './userProfile';

const REQUESTS = 'friendRequests';

export type MatchedUser = {
  uid: string;
  phoneNumber: string;
  displayName?: string;
  avatar?: string;
  email?: string;
};

/** Rehber / arama listeleri için ortak satır verisi */
export type UserSearchHit = {
  uid: string;
  phoneNumber: string;
  displayName?: string;
  email?: string;
  avatar?: string;
};

export type FriendDiscoveryRowStatus = 'friend' | 'pending_out' | 'pending_in' | 'add';

function userHitFromDoc(id: string, v: any): UserSearchHit {
  return {
    uid: id,
    phoneNumber: typeof v.phoneNumber === 'string' ? v.phoneNumber : '',
    displayName: typeof v.displayName === 'string' ? v.displayName : undefined,
    email: typeof v.email === 'string' ? v.email : undefined,
    avatar: typeof v.avatar === 'string' ? v.avatar : undefined,
  };
}

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

/** Sorgu ile bulunur; belge id’si `from_to` formatında olmayan eski kayıtlar da silinir/onaylanır. */
async function findPendingRequestDocs(fromUid: string, toUid: string) {
  const q = query(
    collection(db, REQUESTS),
    where('fromUid', '==', fromUid),
    where('toUid', '==', toUid),
    where('status', '==', 'pending')
  );
  const snap = await getDocs(q);
  return snap.docs;
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

  const expanded = unique(numbers.flatMap((n) => trPhoneFirestoreMatchVariants(n)));
  const batches = chunk(expanded, 30);
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
        email: v.email,
      });
    });
  }

  const byUid = new Map<string, MatchedUser>();
  for (const u of out) byUid.set(u.uid, u);
  return Array.from(byUid.values());
}

export async function addFriendBothWays(params: { currentUid: string; friendUid: string }) {
  const { currentUid, friendUid } = params;
  if (currentUid === friendUid) return;
  const a = doc(db, 'users', currentUid);
  const b = doc(db, 'users', friendUid);
  const [snapA, snapB] = await Promise.all([getDoc(a), getDoc(b)]);
  if (!snapA.exists()) {
    throw new Error('Profil bulunamadı. Önce giriş yapıp profilini tamamla.');
  }
  if (!snapB.exists()) {
    throw new Error(
      'Karşı kullanıcı profili bulunamadı. Arkadaşlık için her iki hesabın da en az bir kez açılmış olması gerekir.'
    );
  }
  const batch = writeBatch(db);
  const ts = serverTimestamp();
  batch.update(a, { friends: arrayUnion(friendUid), updatedAt: ts });
  batch.update(b, { friends: arrayUnion(currentUid), updatedAt: ts });
  await batch.commit();
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

/**
 * Yalnızca senin `users/{currentUid}` belgenden `friendUid` çıkarır; karşı profili güncellemez.
 * Tek yönlü / bozuk kayıt temizliği ve karşı tarafa yazma izni olmayan kurallarla uyumludur.
 * İlgili friendRequests belgelerini de siler (varsa).
 */
export async function removeFriendFromMyListOnly(params: {
  currentUid: string;
  friendUid: string;
}): Promise<void> {
  const { currentUid, friendUid } = params;
  if (currentUid === friendUid) return;
  const a = doc(db, 'users', currentUid);
  const forwardRef = doc(db, REQUESTS, requestDocId(currentUid, friendUid));
  const reverseRef = doc(db, REQUESTS, requestDocId(friendUid, currentUid));
  const ts = serverTimestamp();
  await Promise.all([
    updateDoc(a, { friends: arrayRemove(friendUid), updatedAt: ts }),
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
  const forwardRef = doc(db, REQUESTS, forwardId);

  const alreadyOutgoing = await findPendingRequestDocs(fromUid, toUid);
  if (alreadyOutgoing.length > 0) return;

  const reversePending = await findPendingRequestDocs(toUid, fromUid);
  if (reversePending.length > 0) {
    await addFriendBothWays({ currentUid: fromUid, friendUid: toUid });
    await Promise.all(reversePending.map((d) => deleteDoc(d.ref)));
    const strayForward = await findPendingRequestDocs(fromUid, toUid);
    await Promise.all(strayForward.map((d) => deleteDoc(d.ref)));
    return;
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
  const docs = await findPendingRequestDocs(fromUid, toUid);
  if (docs.length === 0) throw new Error('İstek bulunamadı.');
  for (const d of docs) {
    const v = d.data() as any;
    if (v.toUid !== toUid || v.fromUid !== fromUid || v.status !== 'pending') {
      throw new Error('Bu isteği onaylayamazsın.');
    }
  }
  await addFriendBothWays({ currentUid: toUid, friendUid: fromUid });
  await Promise.all(docs.map((d) => deleteDoc(d.ref)));
}

export async function declineFriendRequest(params: { fromUid: string; toUid: string }): Promise<void> {
  const { fromUid, toUid } = params;
  const docs = await findPendingRequestDocs(fromUid, toUid);
  if (docs.length === 0) return;
  for (const d of docs) {
    const v = d.data() as any;
    if (v.toUid !== toUid || v.fromUid !== fromUid || v.status !== 'pending') {
      throw new Error('Bu istek reddedilemez.');
    }
  }
  await Promise.all(docs.map((d) => deleteDoc(d.ref)));
}

/** Gönderdiğin bekleyen isteği geri alır. */
export async function cancelOutgoingFriendRequest(params: { fromUid: string; toUid: string }): Promise<void> {
  const { fromUid, toUid } = params;
  const docs = await findPendingRequestDocs(fromUid, toUid);
  if (docs.length === 0) return;
  for (const d of docs) {
    const v = d.data() as any;
    if (v.fromUid !== fromUid || v.toUid !== toUid || v.status !== 'pending') {
      throw new Error('Bu istek iptal edilemez.');
    }
  }
  await Promise.all(docs.map((d) => deleteDoc(d.ref)));
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
/** Tam e-posta eşleşmesi (profilde küçük harf saklanır). */
export async function searchUserByEmail(email: string): Promise<UserSearchHit | null> {
  const norm = email.trim().toLowerCase();
  if (!norm || !norm.includes('@')) return null;
  const qy = query(collection(db, 'users'), where('email', '==', norm), limit(1));
  const snap = await getDocs(qy);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return userHitFromDoc(d.id, d.data());
}

/** Profilde kayıtlı telefon (E.164) tam eşleşmesi — arama kutusuna numara yazınca */
export async function searchUserByPhoneQuery(phoneRaw: string): Promise<UserSearchHit | null> {
  const normalized = normalizeE164(phoneRaw) || canonicalizeTrPhoneE164(phoneRaw);
  const variants = normalized
    ? trPhoneFirestoreMatchVariants(normalized)
    : trPhoneFirestoreMatchVariants(phoneRaw);
  const uniqueVariants = unique(variants).filter(Boolean);
  for (const v of uniqueVariants) {
    const qy = query(collection(db, 'users'), where('phoneNumber', '==', v), limit(1));
    const snap = await getDocs(qy);
    if (!snap.empty) {
      const d = snap.docs[0];
      return userHitFromDoc(d.id, d.data());
    }
  }
  return null;
}

/**
 * Profilde `displayNameLower` alanına göre önek araması (kayıt / güncelleme sonrası dolu olur).
 * Türkçe için `normalizeNameSearchKey` ile sorgu; eski belgelerde alan farklı kaydedildiyse ikinci bir sorgu birleştirilir.
 */
export async function searchUsersByDisplayNamePrefix(
  prefix: string,
  maxResults = 20
): Promise<UserSearchHit[]> {
  const pTr = normalizeNameSearchKey(prefix);
  if (pTr.length < 2) return [];
  const endTr = pTr + '\uf8ff';
  const qTr = query(
    collection(db, 'users'),
    where('displayNameLower', '>=', pTr),
    where('displayNameLower', '<=', endTr),
    limit(maxResults)
  );
  const snapTr = await getDocs(qTr);
  const byId = new Map<string, UserSearchHit>();
  snapTr.forEach((d) => byId.set(d.id, userHitFromDoc(d.id, d.data())));

  const pDef = prefix.trim().toLowerCase();
  if (pDef.length >= 2 && pDef !== pTr) {
    const endDef = pDef + '\uf8ff';
    const qDef = query(
      collection(db, 'users'),
      where('displayNameLower', '>=', pDef),
      where('displayNameLower', '<=', endDef),
      limit(maxResults)
    );
    const snapDef = await getDocs(qDef);
    snapDef.forEach((d) => {
      if (!byId.has(d.id)) byId.set(d.id, userHitFromDoc(d.id, d.data()));
    });
  }

  return Array.from(byId.values()).slice(0, maxResults);
}

export async function enrichHitsWithFriendStatus(
  hits: UserSearchHit[],
  currentUid: string
): Promise<Array<UserSearchHit & { status: FriendDiscoveryRowStatus }>> {
  const filtered = hits.filter((h) => h.uid && h.uid !== currentUid);
  if (!filtered.length) return [];

  const [me, outgoing, incoming] = await Promise.all([
    getUserProfile(currentUid),
    listOutgoingFriendRequestTargetUids(currentUid),
    listIncomingFriendRequests(currentUid),
  ]);
  const myFriendIds = new Set((me?.friends || []) as string[]);
  const incomingFrom = new Set(incoming.map((r) => r.fromUid));

  const profiles = new Map<string, Awaited<ReturnType<typeof getUserProfile>>>();
  await Promise.all(
    filtered.map(async (h) => {
      const p = await getUserProfile(h.uid);
      if (p) profiles.set(h.uid, p);
    })
  );

  const withStatus: Array<UserSearchHit & { status: FriendDiscoveryRowStatus }> = filtered.map((h) => {
    const theirFriends = profiles.get(h.uid)?.friends ?? [];
    const mutual = myFriendIds.has(h.uid) && theirFriends.includes(currentUid);
    if (mutual) return { ...h, status: 'friend' as const };
    if (outgoing.has(h.uid)) return { ...h, status: 'pending_out' as const };
    if (incomingFrom.has(h.uid)) return { ...h, status: 'pending_in' as const };
    return { ...h, status: 'add' as const };
  });

  withStatus.sort((a, b) => {
    const rank = (s: FriendDiscoveryRowStatus) =>
      s === 'pending_in' ? 0 : s === 'add' ? 1 : s === 'pending_out' ? 2 : 3;
    const d = rank(a.status) - rank(b.status);
    return d !== 0 ? d : (a.displayName || a.email || '').localeCompare(b.displayName || b.email || '', 'tr', {
      sensitivity: 'base',
    });
  });
  return withStatus;
}

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
