import {
  addDoc,
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
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Group } from '../types/group';
import { getUserProfile } from './userProfile';

const COLLECTION = 'groups';
const INVITES = 'groupInvites';
const GROUP_NOTIF = 'groupNotifications';

function tsMillis(v: unknown): number {
  if (v == null) return 0;
  if (typeof (v as { toMillis?: () => number }).toMillis === 'function') {
    try {
      return (v as { toMillis: () => number }).toMillis();
    } catch {
      return 0;
    }
  }
  return 0;
}

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

/** Sahip olduğun veya üyesi olduğun gruplar (tekilleştirilmiş). */
export async function listGroupsVisibleToUser(uid: string): Promise<Group[]> {
  const [owned, memberSnap] = await Promise.all([
    getGroupsForUser(uid),
    getDocs(query(collection(db, COLLECTION), where('memberIds', 'array-contains', uid))),
  ]);
  const map = new Map<string, Group>();
  for (const g of owned) map.set(g.groupId, g);
  memberSnap.forEach((d) => {
    const v = d.data() as any;
    const gid = d.id;
    if (map.has(gid)) return;
    map.set(gid, {
      groupId: gid,
      ownerId: v.ownerId,
      name: v.name || 'Grup',
      memberIds: Array.isArray(v.memberIds) ? v.memberIds : [],
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    });
  });
  return [...map.values()].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'tr'));
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

export type GroupNotificationKind = 'removed_by_owner' | 'member_left';

export type GroupNotificationRow = {
  id: string;
  toUid: string;
  groupId: string;
  groupName: string;
  actorUid: string;
  kind: GroupNotificationKind;
  preview: string;
  read: boolean;
  createdAt?: unknown;
};

async function persistMemberIds(groupId: string, memberIds: string[]): Promise<void> {
  const ref = doc(db, COLLECTION, groupId);
  await updateDoc(ref, { memberIds, updatedAt: serverTimestamp() });
}

async function pushGroupNotification(params: {
  toUid: string;
  groupId: string;
  groupName: string;
  actorUid: string;
  kind: GroupNotificationKind;
  preview: string;
}): Promise<void> {
  await addDoc(collection(db, GROUP_NOTIF), {
    ...params,
    read: false,
    createdAt: serverTimestamp(),
  });
}

/** Sadece grup sahibi başka üyeyi çıkarır; çıkarılan kullanıcıya uygulama içi bildirim gider. */
export async function removeMemberFromGroup(
  groupId: string,
  targetUid: string,
  actorUid: string
): Promise<void> {
  const g = await getGroup(groupId);
  if (!g) throw new Error('Grup bulunamadı.');
  if (g.ownerId !== actorUid) throw new Error('Sadece grup sahibi üye çıkarabilir.');
  if (targetUid === g.ownerId) throw new Error('Grup sahibi gruptan çıkarılamaz.');
  if (!g.memberIds.includes(targetUid)) return;
  const memberIds = g.memberIds.filter((id) => id !== targetUid);
  await persistMemberIds(groupId, memberIds);
  const ownerProf = await getUserProfile(actorUid);
  const actorName = ownerProf?.displayName?.trim() || 'Grup sahibi';
  await pushGroupNotification({
    toUid: targetUid,
    groupId,
    groupName: g.name,
    actorUid,
    kind: 'removed_by_owner',
    preview: `${actorName} seni «${g.name}» grubundan çıkardı`,
  });
}

/** Üye kendi isteğiyle gruptan ayrılır; gruba sahip kullanıcıya bildirim gider. Grup sahibi ayrılamaz (grubu silmeli). */
export async function leaveGroup(groupId: string, actorUid: string): Promise<void> {
  const g = await getGroup(groupId);
  if (!g) throw new Error('Grup bulunamadı.');
  if (g.ownerId === actorUid) {
    throw new Error(
      'Grup sahibi buradan ayrılamaz. Grubu silmek için grup detayındaki «Grubu sil» veya listedeki sil seçeneğini kullan.'
    );
  }
  if (!g.memberIds.includes(actorUid)) {
    throw new Error('Bu grubun üyesi değilsin.');
  }
  const memberIds = g.memberIds.filter((id) => id !== actorUid);
  await persistMemberIds(groupId, memberIds);
  const leaverProf = await getUserProfile(actorUid);
  const leaverName = leaverProf?.displayName?.trim() || 'Bir üye';
  await pushGroupNotification({
    toUid: g.ownerId,
    groupId,
    groupName: g.name,
    actorUid,
    kind: 'member_left',
    preview: `${leaverName} «${g.name}» grubundan ayrıldı`,
  });
}

export async function listUnreadGroupNotifications(uid: string): Promise<GroupNotificationRow[]> {
  const qy = query(collection(db, GROUP_NOTIF), where('toUid', '==', uid), limit(50));
  const snap = await getDocs(qy);
  const out: GroupNotificationRow[] = [];
  snap.forEach((d) => {
    const v = d.data() as any;
    if (v.read === true) return;
    out.push({
      id: d.id,
      toUid: v.toUid,
      groupId: v.groupId,
      groupName: String(v.groupName || 'Grup'),
      actorUid: v.actorUid,
      kind: v.kind === 'member_left' ? 'member_left' : 'removed_by_owner',
      preview: String(v.preview || ''),
      read: Boolean(v.read),
      createdAt: v.createdAt,
    });
  });
  out.sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
  return out;
}

export async function markGroupNotificationRead(notifId: string): Promise<void> {
  const ref = doc(db, GROUP_NOTIF, notifId);
  await updateDoc(ref, { read: true, readAt: serverTimestamp() });
}

/** Yalnızca grup sahibi (oluşturan) siler; bekleyen grup davetleri de temizlenir. */
export async function deleteGroup(params: { groupId: string; actorUid: string }): Promise<void> {
  const groupId = String(params.groupId ?? '').trim();
  const actorUid = String(params.actorUid ?? '').trim();
  if (!groupId || !actorUid) throw new Error('Eksik bilgi.');
  const g = await getGroup(groupId);
  if (!g) throw new Error('Grup bulunamadı.');
  if (g.ownerId !== actorUid) throw new Error('Sadece grubu oluşturan silebilir.');

  const invitesSnap = await getDocs(
    query(collection(db, INVITES), where('groupId', '==', groupId))
  );
  const CHUNK = 400;
  for (let i = 0; i < invitesSnap.docs.length; i += CHUNK) {
    const batch = writeBatch(db);
    invitesSnap.docs.slice(i, i + CHUNK).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await deleteDoc(doc(db, COLLECTION, groupId));
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
