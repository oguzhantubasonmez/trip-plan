import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getCommentsForTripReliable } from './comments';
import { listIncomingFriendRequests } from './friends';
import {
  listUnreadDiscoverPollInvites,
  markDiscoverPollInviteRead,
  type DiscoverPollInviteRow,
} from './discoverPollInvites';
import { listUnreadGroupNotifications, markGroupNotificationRead } from './groups';
import type { GroupNotificationRow } from './groups';
import {
  listUnreadTripMembershipNotifications,
  markTripMembershipNotificationRead,
  type TripMembershipNotificationRow,
} from './trips';
import type { Trip } from '../types/trip';

export type { GroupNotificationRow, DiscoverPollInviteRow, TripMembershipNotificationRow };

const COL = 'userActivityRead';

export type ActivityReadState = {
  friendsHubVisitedAt: any | null;
  tripCommentReadAt: Record<string, any>;
};

function emptyState(): ActivityReadState {
  return { friendsHubVisitedAt: null, tripCommentReadAt: {} };
}

export async function getActivityReadState(uid: string): Promise<ActivityReadState> {
  const snap = await getDoc(doc(db, COL, uid));
  if (!snap.exists()) return emptyState();
  const v = snap.data() as any;
  const map = v.tripCommentReadAt;
  return {
    friendsHubVisitedAt: v.friendsHubVisitedAt ?? null,
    tripCommentReadAt:
      map && typeof map === 'object' && !Array.isArray(map)
        ? (map as Record<string, any>)
        : {},
  };
}

export async function markFriendsHubVisited(uid: string): Promise<void> {
  const ref = doc(db, COL, uid);
  await setDoc(
    ref,
    {
      friendsHubVisitedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function markTripCommentsRead(uid: string, tripId: string): Promise<void> {
  const tid = String(tripId ?? '').trim();
  if (!tid) return;
  const ref = doc(db, COL, uid);
  const snap = await getDoc(ref);
  const prev =
    snap.exists() && snap.data()?.tripCommentReadAt && typeof snap.data()!.tripCommentReadAt === 'object'
      ? { ...(snap.data()!.tripCommentReadAt as Record<string, unknown>) }
      : {};
  await setDoc(
    ref,
    {
      tripCommentReadAt: { ...prev, [tid]: serverTimestamp() },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

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

export type InboxTripUnread = { tripId: string; title: string; count: number };

export type InboxSummary = {
  newFriendRequestCount: number;
  pendingFriendTotal: number;
  unreadCommentCount: number;
  tripsWithUnread: InboxTripUnread[];
  /** Okunmamış grup üyelik bildirimleri */
  groupNotifications: GroupNotificationRow[];
  unreadGroupNotificationCount: number;
  /** Keşfet anket daveti (okunmamış) */
  discoverPollInvites: DiscoverPollInviteRow[];
  unreadDiscoverPollInviteCount: number;
  /** Rota üyelik (eklendin / biri katıldı / biri ayrıldı) */
  tripMembershipNotifications: TripMembershipNotificationRow[];
  unreadTripMembershipCount: number;
  totalCount: number;
  /** Ana sayfa «Yeni» kartı: yorum, yeni veya bekleyen arkadaşlık isteği */
  showInboxCard: boolean;
};

/** Kart üst satırı: örn. «2 yeni yorum · 1 yeni arkadaşlık isteği» */
export function formatInboxSummaryLines(s: InboxSummary): string {
  const parts: string[] = [];
  if (s.newFriendRequestCount > 0) {
    parts.push(
      s.newFriendRequestCount === 1
        ? '1 yeni arkadaşlık isteği'
        : `${s.newFriendRequestCount} yeni arkadaşlık isteği`,
    );
  } else if (s.pendingFriendTotal > 0) {
    parts.push(
      s.pendingFriendTotal === 1
        ? '1 bekleyen arkadaşlık isteği'
        : `${s.pendingFriendTotal} bekleyen arkadaşlık isteği`,
    );
  }
  if (s.unreadCommentCount > 0) {
    parts.push(
      s.unreadCommentCount === 1 ? '1 yeni yorum' : `${s.unreadCommentCount} yeni yorum`,
    );
  }
  const pollN = s.unreadDiscoverPollInviteCount ?? 0;
  if (pollN > 0) {
    parts.push(pollN === 1 ? '1 anket daveti' : `${pollN} anket daveti`);
  }
  const tripMemLine = s.unreadTripMembershipCount ?? 0;
  if (tripMemLine > 0) {
    parts.push(tripMemLine === 1 ? '1 rota bildirimi' : `${tripMemLine} rota bildirimi`);
  }
  return parts.join(' · ');
}

/**
 * Zil açılır panel üst özeti: rota bazlı yorum satırları varken toplam «N yeni yorum» tekrarını yazma
 * (kayma / çift kart hissi önlenir; ayrıntı her rota kartında).
 */
export function formatInboxBellPanelSummary(s: InboxSummary): string {
  const parts: string[] = [];
  if (s.newFriendRequestCount > 0) {
    parts.push(
      s.newFriendRequestCount === 1
        ? '1 yeni arkadaşlık isteği'
        : `${s.newFriendRequestCount} yeni arkadaşlık isteği`
    );
  } else if (s.pendingFriendTotal > 0) {
    parts.push(
      s.pendingFriendTotal === 1
        ? '1 bekleyen arkadaşlık isteği'
        : `${s.pendingFriendTotal} bekleyen arkadaşlık isteği`
    );
  }
  if (s.tripsWithUnread.length === 0 && s.unreadCommentCount > 0) {
    parts.push(
      s.unreadCommentCount === 1 ? '1 yeni yorum' : `${s.unreadCommentCount} yeni yorum`
    );
  }
  const pollN = s.unreadDiscoverPollInviteCount ?? 0;
  if (pollN > 0) {
    parts.push(pollN === 1 ? '1 anket daveti' : `${pollN} anket daveti`);
  }
  const tripMemN = s.unreadTripMembershipCount ?? 0;
  if (tripMemN > 0) {
    parts.push(tripMemN === 1 ? '1 rota bildirimi' : `${tripMemN} rota bildirimi`);
  }
  return parts.join(' · ');
}

/**
 * Üst çubuk zil rozeti: önce yeni istek + okunmamış yorum toplamı; ikisi de yoksa bekleyen istek sayısı.
 */
export function inboxBellBadgeCount(s: InboxSummary): number {
  const groupN = s.unreadGroupNotificationCount ?? 0;
  const pollN = s.unreadDiscoverPollInviteCount ?? 0;
  const tripMemN = s.unreadTripMembershipCount ?? 0;
  const base = s.totalCount + groupN + pollN + tripMemN;
  if (base > 0) return Math.min(99, base);
  if (s.pendingFriendTotal > 0) return Math.min(99, s.pendingFriendTotal);
  return 0;
}

/**
 * Ana sayfa rozeti: yeni arkadaşlık istekleri + başkalarının son okumadan sonraki yorumları.
 */
export async function getInboxSummary(uid: string, trips: Trip[]): Promise<InboxSummary> {
  let state = emptyState();
  try {
    state = await getActivityReadState(uid);
  } catch {
    /* userActivityRead okunamazsa arkadaşlık / rota özeti yine dolsun */
  }

  const friendsCutoff = tsMillis(state.friendsHubVisitedAt);

  let incoming: Awaited<ReturnType<typeof listIncomingFriendRequests>> = [];
  try {
    incoming = await listIncomingFriendRequests(uid);
  } catch {
    incoming = [];
  }

  const pendingFriendTotal = incoming.length;
  const newFriendRequestCount = incoming.filter((r) => {
    const t = tsMillis(r.createdAt);
    return t > friendsCutoff;
  }).length;

  const tripsWithUnread: InboxTripUnread[] = [];
  let unreadCommentCount = 0;

  try {
    const readMap = state.tripCommentReadAt || {};

    const candidates = trips.filter((t) => {
      const act = tsMillis(t.commentActivityAt);
      if (act <= 0) return false;
      const readAt = tsMillis(readMap[t.tripId]);
      return act > readAt;
    });

    await Promise.all(
      candidates.map(async (t) => {
        try {
          const comments = await getCommentsForTripReliable(t.tripId);
          const readAt = tsMillis(readMap[t.tripId]);
          const n = comments.filter((c) => {
            if (!c.userId || c.userId === uid) return false;
            return tsMillis(c.timestamp) > readAt;
          }).length;
          if (n > 0) {
            tripsWithUnread.push({ tripId: t.tripId, title: t.title, count: n });
            unreadCommentCount += n;
          }
        } catch {
          /* yorum okunamazsa atla */
        }
      })
    );

    tripsWithUnread.sort((a, b) => b.count - a.count);
  } catch {
    /* yorum özeti tamamen atlanır; gelen istekler yukarıda */
  }

  let groupNotifications: GroupNotificationRow[] = [];
  try {
    groupNotifications = await listUnreadGroupNotifications(uid);
  } catch {
    groupNotifications = [];
  }
  const unreadGroupNotificationCount = groupNotifications.length;

  let discoverPollInvites: DiscoverPollInviteRow[] = [];
  try {
    discoverPollInvites = await listUnreadDiscoverPollInvites(uid);
  } catch {
    discoverPollInvites = [];
  }
  const unreadDiscoverPollInviteCount = discoverPollInvites.length;

  let tripMembershipNotifications: TripMembershipNotificationRow[] = [];
  try {
    tripMembershipNotifications = await listUnreadTripMembershipNotifications(uid);
  } catch {
    tripMembershipNotifications = [];
  }
  const unreadTripMembershipCount = tripMembershipNotifications.length;

  const totalCount = newFriendRequestCount + unreadCommentCount;
  const showInboxCard =
    unreadCommentCount > 0 ||
    newFriendRequestCount > 0 ||
    pendingFriendTotal > 0 ||
    unreadGroupNotificationCount > 0 ||
    unreadDiscoverPollInviteCount > 0 ||
    unreadTripMembershipCount > 0;

  return {
    newFriendRequestCount,
    pendingFriendTotal,
    unreadCommentCount,
    tripsWithUnread,
    groupNotifications,
    unreadGroupNotificationCount,
    discoverPollInvites,
    unreadDiscoverPollInviteCount,
    tripMembershipNotifications,
    unreadTripMembershipCount,
    totalCount,
    showInboxCard,
  };
}

export { markGroupNotificationRead, markDiscoverPollInviteRead, markTripMembershipNotificationRead };
