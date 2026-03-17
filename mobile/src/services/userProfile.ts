import { doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export type UserProfile = {
  uid: string;
  phoneNumber: string;
  displayName?: string;
  avatar?: string;
  carConsumption?: string;
  friends?: string[];
};

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const v = snap.data() as any;
  return {
    uid: snap.id,
    phoneNumber: v.phoneNumber,
    displayName: v.displayName,
    avatar: v.avatar,
    carConsumption: v.carConsumption,
    friends: v.friends || [],
  };
}

export async function ensureUserDoc(params: { uid: string; phoneNumber: string }) {
  const ref = doc(db, 'users', params.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(
      ref,
      {
        uid: params.uid,
        phoneNumber: params.phoneNumber,
        displayName: '',
        avatar: '',
        friends: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } else {
    await updateDoc(ref, { updatedAt: serverTimestamp() });
  }
}

export async function updateUserProfile(
  uid: string,
  data: { displayName?: string; carConsumption?: string }
): Promise<void> {
  const ref = doc(db, 'users', uid);
  const updates: Record<string, any> = { updatedAt: serverTimestamp() };
  if (data.displayName !== undefined) updates.displayName = data.displayName;
  if (data.carConsumption !== undefined) updates.carConsumption = data.carConsumption;
  await updateDoc(ref, updates);
}

export async function getUsersByUids(uids: string[]): Promise<Map<string, UserProfile>> {
  const map = new Map<string, UserProfile>();
  const uniqueUids = Array.from(new Set(uids)).filter(Boolean);
  await Promise.all(
    uniqueUids.map(async (id) => {
      const u = await getUserProfile(id);
      if (u) map.set(id, u);
    })
  );
  return map;
}

