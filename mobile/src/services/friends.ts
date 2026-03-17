import { arrayUnion, collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import * as Contacts from 'expo-contacts';
import { db } from '../lib/firebase';
import { chunk } from '../utils/array';
import { normalizeE164 } from '../utils/phone';

export type MatchedUser = {
  uid: string;
  phoneNumber: string;
  displayName?: string;
  avatar?: string;
};

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
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

  // In case duplicates happen across batches (unlikely, but safe)
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

