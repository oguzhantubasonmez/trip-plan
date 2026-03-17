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
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Group } from '../types/group';

const COLLECTION = 'groups';

export async function createGroup(ownerId: string, name: string): Promise<string> {
  const ref = doc(collection(db, COLLECTION));
  const groupId = ref.id;
  await setDoc(ref, {
    groupId,
    ownerId,
    name: name.trim() || 'Yeni grup',
    memberIds: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return groupId;
}

export async function getGroupsForUser(ownerId: string): Promise<Group[]> {
  const q = query(collection(db, COLLECTION), where('ownerId', '==', ownerId));
  const snap = await getDocs(q);
  const out: Group[] = [];
  snap.forEach((d) => {
    const v = d.data() as any;
    out.push({
      groupId: d.id,
      ownerId: v.ownerId,
      name: v.name || 'Grup',
      memberIds: Array.isArray(v.memberIds) ? v.memberIds : [],
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    });
  });
  out.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return out;
}

export async function getGroup(groupId: string): Promise<Group | null> {
  const ref = doc(db, COLLECTION, groupId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const v = snap.data() as any;
  return {
    groupId: snap.id,
    ownerId: v.ownerId,
    name: v.name || 'Grup',
    memberIds: Array.isArray(v.memberIds) ? v.memberIds : [],
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
}

export async function updateGroup(
  groupId: string,
  data: { name?: string; memberIds?: string[] }
): Promise<void> {
  const ref = doc(db, COLLECTION, groupId);
  const updates: Record<string, any> = { updatedAt: serverTimestamp() };
  if (data.name !== undefined) updates.name = data.name.trim() || 'Grup';
  if (data.memberIds !== undefined) updates.memberIds = data.memberIds;
  await updateDoc(ref, updates);
}

export async function addMemberToGroup(groupId: string, uid: string): Promise<void> {
  const ref = doc(db, COLLECTION, groupId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Grup bulunamadı.');
  const v = snap.data() as any;
  const memberIds: string[] = v.memberIds || [];
  if (memberIds.includes(uid)) return;
  memberIds.push(uid);
  await updateDoc(ref, { memberIds, updatedAt: serverTimestamp() });
}

export async function removeMemberFromGroup(groupId: string, uid: string): Promise<void> {
  const ref = doc(db, COLLECTION, groupId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Grup bulunamadı.');
  const v = snap.data() as any;
  const memberIds: string[] = (v.memberIds || []).filter((id: string) => id !== uid);
  await updateDoc(ref, { memberIds, updatedAt: serverTimestamp() });
}

export async function deleteGroup(groupId: string): Promise<void> {
  const ref = doc(db, COLLECTION, groupId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Grup bulunamadı.');
  await deleteDoc(ref);
}
