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
import { getUserProfile } from './userProfile';

const COLLECTION = 'groups';
const INVITES = 'groupInvites';

export type GroupInvite = {
  id: string;
  groupId: string;
  toUid: string;
  fromUid: string;
  status: 'pending';
  createdAt?: unknown;
};

function inviteDocId(groupId: string, toUid: string): string {
  return `${groupId}_${toUid}`;
}

export async function createGroup(ownerId: string, name: string): Promise<string> {
  const ref = doc(collection(db, COLLECTION));
  const groupId = ref.id;
  /** Sahip de üye sayılır; boş liste Firestore/UX kafa karıştırmasın, rotaya gruptan eklemede en az kendin eklenir. */
  await setDoc(ref, {
    groupId,
    ownerId,
    name: name.trim() || 'Yeni grup',
    memberIds: [ownerId],
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

export async function inviteMemberToGroup(params: {
  groupId: string;
  ownerUid: string;
  memberUid: string;
}): Promise<void> {
  const { groupId, ownerUid, memberUid } = params;
  if (memberUid === ownerUid) return;
  const g = await getGroup(groupId);
  if (!g) throw new Error('Grup bulunamadı.');
  if (g.ownerId !== ownerUid) throw new Error('Sadece grup sahibi davet gönderebilir.');
  if (g.memberIds.includes(memberUid)) return;

  const owner = await getUserProfile(ownerUid);
  const ownerFriends = owner?.friends ?? [];
  const other = await getUserProfile(memberUid);
  const mutual =
    ownerFriends.includes(memberUid) && (other?.friends ?? []).includes(ownerUid);
  if (!mutual) throw new Error('Sadece onaylı arkadaşların gruba davet edilebilir.');

  const ref = doc(db, INVITES, inviteDocId(groupId, memberUid));
  const snap = await getDoc(ref);
  if (snap.exists() && (snap.data() as any)?.status === 'pending') return;

  await setDoc(ref, {
    groupId,
    toUid: memberUid,
    fromUid: ownerUid,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
}

export async function acceptGroupInvite(params: { groupId: string; memberUid: string }): Promise<void> {
  const ref = doc(db, INVITES, inviteDocId(params.groupId, params.memberUid));
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Davet bulunamadı.');
  const v = snap.data() as any;
  if (v.toUid !== params.memberUid || v.status !== 'pending') throw new Error('Bu daveti kabul edemezsin.');
  await addMemberToGroup(params.groupId, params.memberUid);
  await deleteDoc(ref);
}

export async function declineGroupInvite(params: { groupId: string; memberUid: string }): Promise<void> {
  const ref = doc(db, INVITES, inviteDocId(params.groupId, params.memberUid));
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const v = snap.data() as any;
  if (v.toUid !== params.memberUid || v.status !== 'pending') throw new Error('Bu davet reddedilemez.');
  await deleteDoc(ref);
}

export async function listPendingGroupInvitesForUser(toUid: string): Promise<GroupInvite[]> {
  const q = query(collection(db, INVITES), where('toUid', '==', toUid), where('status', '==', 'pending'));
  const snap = await getDocs(q);
  const out: GroupInvite[] = [];
  snap.forEach((d) => {
    const v = d.data() as any;
    out.push({
      id: d.id,
      groupId: v.groupId,
      toUid: v.toUid,
      fromUid: v.fromUid,
      status: 'pending',
      createdAt: v.createdAt,
    });
  });
  return out;
}

export async function listPendingGroupInvitesForGroup(groupId: string): Promise<GroupInvite[]> {
  const q = query(collection(db, INVITES), where('groupId', '==', groupId), where('status', '==', 'pending'));
  const snap = await getDocs(q);
  const out: GroupInvite[] = [];
  snap.forEach((d) => {
    const v = d.data() as any;
    out.push({
      id: d.id,
      groupId: v.groupId,
      toUid: v.toUid,
      fromUid: v.fromUid,
      status: 'pending',
      createdAt: v.createdAt,
    });
  });
  return out;
}
