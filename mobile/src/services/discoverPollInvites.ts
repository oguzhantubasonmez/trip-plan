import { addDoc, collection, getDocs, limit, query, serverTimestamp, updateDoc, where, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';

const COL = 'discoverPollInvites';

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

export type DiscoverPollInviteRow = {
  id: string;
  toUid: string;
  fromUid: string;
  pollId: string;
  preview: string;
  read: boolean;
  createdAt?: unknown;
};

export async function listUnreadDiscoverPollInvites(uid: string): Promise<DiscoverPollInviteRow[]> {
  const qy = query(
    collection(db, COL),
    where('toUid', '==', uid),
    where('read', '==', false),
    limit(30)
  );
  const snap = await getDocs(qy);
  const out: DiscoverPollInviteRow[] = [];
  snap.forEach((d) => {
    const v = d.data() as any;
    out.push({
      id: d.id,
      toUid: v.toUid,
      fromUid: v.fromUid,
      pollId: String(v.pollId || ''),
      preview: String(v.preview || 'Anket daveti'),
      read: Boolean(v.read),
      createdAt: v.createdAt,
    });
  });
  out.sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
  return out;
}

export async function markDiscoverPollInviteRead(notifId: string): Promise<void> {
  const ref = doc(db, COL, notifId);
  await updateDoc(ref, { read: true, readAt: serverTimestamp() });
}

export async function pushDiscoverPollInviteNotifications(params: {
  fromUid: string;
  pollId: string;
  preview: string;
  toUids: string[];
}): Promise<void> {
  const preview = params.preview.trim().slice(0, 120) || 'Anket daveti';
  for (const toUid of params.toUids) {
    if (!toUid || toUid === params.fromUid) continue;
    await addDoc(collection(db, COL), {
      toUid,
      fromUid: params.fromUid,
      pollId: params.pollId,
      preview,
      read: false,
      createdAt: serverTimestamp(),
    });
  }
}
