import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { BadgeTierId } from '../types/gamification';
import { badgeTierFromDiscoverScore } from '../types/gamification';
import type { Trip } from '../types/trip';
import type { DiscoverLeaderboardRow, DiscoverPollState, DiscoverQuest } from '../types/discover';
import {
  normalizePollDocument,
  optionsFromNormalized,
  parseChoiceIndex,
  parseStoredVote,
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  sanitizeNewOptionTexts,
} from '../utils/pollFirestore';
import { pushDiscoverPollInviteNotifications } from './discoverPollInvites';
import { filterMutualFriendUids } from './friends';
import { getUserProfile } from './userProfile';
import { getTripsForUser, getUserTripAggregateStats, type UserTripAggregateStats } from './trips';

const DISCOVER_POLLS = 'discoverPolls';

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

/** Rota + durak + km + onaylı durak + süre — tek Gezi puanı. */
export function computeTravelScore(s: UserTripAggregateStats): number {
  const km = typeof s.totalKm === 'number' && !Number.isNaN(s.totalKm) ? s.totalKm : 0;
  const min =
    typeof s.totalDrivingMinutes === 'number' && !Number.isNaN(s.totalDrivingMinutes)
      ? s.totalDrivingMinutes
      : 0;
  const raw =
    s.tripCount * 40 +
    s.stopCount * 12 +
    km * 2 +
    s.approvedStopCount * 8 +
    min * 0.15;
  return Math.max(0, Math.round(raw));
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Girişte Keşfet açıldığında: seriyi günceller (yerel takvim günü). */
export async function touchDiscoverStreak(uid: string): Promise<{ streak: number }> {
  const today = ymdLocal(new Date());
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { streak: 0 };
  const v = snap.data() as any;
  const last = typeof v.discoverStreakYmd === 'string' ? v.discoverStreakYmd : '';
  const prevStreak =
    typeof v.discoverStreak === 'number' && !Number.isNaN(v.discoverStreak) ? v.discoverStreak : 0;
  if (last === today) return { streak: Math.max(0, prevStreak) };
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const ystr = ymdLocal(y);
  let next = 1;
  if (last === ystr) next = prevStreak + 1;
  else if (last) next = 1;
  try {
    await updateDoc(ref, {
      discoverStreak: next,
      discoverStreakYmd: today,
      updatedAt: serverTimestamp(),
    });
  } catch {
    return { streak: Math.max(0, prevStreak) };
  }
  return { streak: next };
}

function countAdminTrips(trips: Trip[], uid: string): number {
  return trips.filter((t) => t.adminId === uid).length;
}

function countBuddyTrips(trips: Trip[], uid: string): number {
  return trips.filter((t) => {
    const going = t.attendees.filter((a) => a.rsvp === 'going');
    if (going.length < 2) return false;
    return going.some((a) => a.uid === uid);
  }).length;
}

export function buildDiscoverQuests(uid: string, stats: UserTripAggregateStats, trips: Trip[]): DiscoverQuest[] {
  const adminN = countAdminTrips(trips, uid);
  const buddyN = countBuddyTrips(trips, uid);
  const kmFloor = Math.floor(stats.totalKm);

  const q1: DiscoverQuest = {
    id: 'admin_trips',
    emoji: '✨',
    title: 'Rota şefi',
    progress: Math.min(adminN, 3),
    target: 3,
    done: adminN >= 3,
  };
  const q2: DiscoverQuest = {
    id: 'stops',
    emoji: '📍',
    title: 'Durak avcısı',
    progress: Math.min(stats.stopCount, 15),
    target: 15,
    done: stats.stopCount >= 15,
  };
  const q3: DiscoverQuest = {
    id: 'km',
    emoji: '🛣️',
    title: 'Km canavarı',
    progress: Math.min(kmFloor, 120),
    target: 120,
    done: kmFloor >= 120,
  };
  const q4: DiscoverQuest = {
    id: 'buddy',
    emoji: '🤝',
    title: 'Birlikte gidiyoruz',
    progress: Math.min(buddyN, 3),
    target: 3,
    done: buddyN >= 3,
  };
  return [q1, q2, q3, q4];
}

export function buildVibeChips(stats: UserTripAggregateStats, adminTripCount: number): string[] {
  const out: string[] = [];
  if (stats.approvedStopCount >= 5) out.push('✅ Onaylı durak ustası');
  if (stats.totalKm >= 80) out.push('🛣️ Km meraklısı');
  if (adminTripCount >= 3) out.push('🗺️ Plan canavarı');
  if (stats.tripCount >= 5) out.push('🎒 Çok rota modu');
  if (out.length === 0) {
    return ['🎲 Macera başlasın', '🧃 Molacı', '🌅 Gün batımı avcısı', '🗺️ Harita aşkı'];
  }
  out.push('🎲 Şanslı rota');
  return out.slice(0, 6);
}

export async function getDiscoverPollStateForMember(
  uid: string,
  pollDocId: string
): Promise<DiscoverPollState | null> {
  const pid = String(pollDocId || '').trim();
  if (!pid) return null;
  const pollRef = doc(db, DISCOVER_POLLS, pid);
  const pollSnap = await getDoc(pollRef);
  if (!pollSnap.exists()) return null;
  const p = pollSnap.data() as any;
  const createdBy = String(p.createdBy || '');
  const invited: string[] = Array.isArray(p.invitedUserIds) ? p.invitedUserIds : [];
  const canSee = uid === createdBy || invited.includes(uid);
  if (!canSee) return null;
  const voteSnap = await getDoc(doc(db, DISCOVER_POLLS, pid, 'votes', uid));
  const vv = voteSnap.data() as Record<string, unknown> | undefined;
  const norm = normalizePollDocument(p as Record<string, unknown>);
  const opts = optionsFromNormalized(norm.labels, norm.counts);
  const userChoice = parseStoredVote(vv ?? null, opts.length);
  const totalVotes = opts.reduce((s, o) => s + o.count, 0);
  return {
    pollId: pollSnap.id,
    question: String(p.question ?? 'Anket'),
    options: opts,
    userChoice,
    totalVotes,
    isCreator: uid === createdBy,
  };
}

export async function getLatestDiscoverPollForUser(uid: string): Promise<DiscoverPollState | null> {
  const [snapCreated, snapInvited] = await Promise.all([
    getDocs(
      query(
        collection(db, DISCOVER_POLLS),
        where('createdBy', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(15)
      )
    ),
    getDocs(
      query(
        collection(db, DISCOVER_POLLS),
        where('invitedUserIds', 'array-contains', uid),
        orderBy('createdAt', 'desc'),
        limit(15)
      )
    ),
  ]);
  const best = new Map<string, number>();
  const ingest = (snap: typeof snapCreated) => {
    snap.forEach((d) => {
      const v = d.data() as any;
      const t = tsMillis(v.createdAt);
      const cur = best.get(d.id) ?? -1;
      if (t >= cur) best.set(d.id, t);
    });
  };
  ingest(snapCreated);
  ingest(snapInvited);
  if (best.size === 0) return null;
  const topId = [...best.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return getDiscoverPollStateForMember(uid, topId);
}

export async function createDiscoverPoll(params: {
  createdBy: string;
  question: string;
  optionTexts: string[];
  inviteeUids: string[];
}): Promise<string> {
  const mutual = await filterMutualFriendUids(params.createdBy, params.inviteeUids);
  if (mutual.length === 0) {
    throw new Error('En az bir karşılıklı arkadaş seçmelisin.');
  }
  const q = params.question.trim();
  if (q.length < 2) throw new Error('Başlık en az 2 karakter olsun.');
  const texts = sanitizeNewOptionTexts(params.optionTexts);
  if (texts.length < POLL_MIN_OPTIONS) {
    throw new Error(`En az ${POLL_MIN_OPTIONS} seçenek gir.`);
  }
  if (texts.length > POLL_MAX_OPTIONS) {
    throw new Error(`En fazla ${POLL_MAX_OPTIONS} seçenek olabilir.`);
  }
  const ref = await addDoc(collection(db, DISCOVER_POLLS), {
    question: q,
    optionLabels: texts,
    voteCounts: texts.map(() => 0),
    createdBy: params.createdBy,
    invitedUserIds: mutual,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await pushDiscoverPollInviteNotifications({
    fromUid: params.createdBy,
    pollId: ref.id,
    preview: q,
    toUids: mutual,
  });
  return ref.id;
}

export async function voteDiscoverPoll(uid: string, pollDocId: string, choiceId: string): Promise<void> {
  const pid = String(pollDocId || '').trim();
  if (!pid) throw new Error('Anket bulunamadı.');
  const pollRef = doc(db, DISCOVER_POLLS, pid);
  const voteRef = doc(db, DISCOVER_POLLS, pid, 'votes', uid);
  await runTransaction(db, async (tx) => {
    const pollSnap = await tx.get(pollRef);
    if (!pollSnap.exists()) throw new Error('Anket bulunamadı.');
    const poll = pollSnap.data() as Record<string, unknown>;
    const createdBy = String((poll as { createdBy?: unknown }).createdBy || '');
    const invited: string[] = Array.isArray((poll as { invitedUserIds?: unknown }).invitedUserIds)
      ? ((poll as { invitedUserIds: string[] }).invitedUserIds as string[])
      : [];
    const canVote = uid === createdBy || invited.includes(uid);
    if (!canVote) throw new Error('Bu ankete katılma hakkın yok.');
    const voteSnap = await tx.get(voteRef);
    if (voteSnap.exists()) return;
    const norm = normalizePollDocument(poll);
    const idx = parseChoiceIndex(choiceId, norm.labels.length);
    if (norm.usesLegacyCounters) {
      if (idx > 1) throw new Error('Geçersiz oy.');
      const cA = norm.counts[0] ?? 0;
      const cB = norm.counts[1] ?? 0;
      if (idx === 0) {
        tx.update(pollRef, { countA: cA + 1, updatedAt: serverTimestamp() });
      } else {
        tx.update(pollRef, { countB: cB + 1, updatedAt: serverTimestamp() });
      }
    } else {
      const next = [...norm.counts];
      next[idx] = (next[idx] ?? 0) + 1;
      tx.update(pollRef, { voteCounts: next, updatedAt: serverTimestamp() });
    }
    tx.set(voteRef, { choiceIndex: idx, votedAt: serverTimestamp() }, { merge: true });
  });
}

async function leaderboardForUser(uid: string, myScore: number): Promise<DiscoverLeaderboardRow[]> {
  const profile = await getUserProfile(uid);
  const friendIds = profile?.friends ?? [];
  const mutual = await filterMutualFriendUids(uid, friendIds);
  const capped = mutual.slice(0, 14);
  const rows: DiscoverLeaderboardRow[] = [
    {
      uid,
      displayName: profile?.displayName?.trim() || profile?.phoneNumber || 'Sen',
      score: myScore,
      isSelf: true,
    },
  ];
  await Promise.all(
    capped.map(async (fid) => {
      try {
        const st = await getUserTripAggregateStats(fid);
        const sc = computeTravelScore(st);
        const pr = await getUserProfile(fid);
        const name = pr?.displayName?.trim() || pr?.phoneNumber || `Gezgin ${fid.slice(0, 4)}`;
        rows.push({ uid: fid, displayName: name, score: sc, isSelf: false });
      } catch {
        /* atla */
      }
    })
  );
  rows.sort((a, b) => b.score - a.score);
  return rows;
}

export type DiscoverScreenPayload = {
  score: number;
  streak: number;
  stats: UserTripAggregateStats;
  quests: DiscoverQuest[];
  leaderboard: DiscoverLeaderboardRow[];
  poll: DiscoverPollState | null;
  vibeChips: string[];
  badgeTier: BadgeTierId;
};

export async function loadDiscoverScreenData(
  uid: string,
  opts?: { focusPollId?: string }
): Promise<DiscoverScreenPayload> {
  const pollPromise =
    opts?.focusPollId != null && String(opts.focusPollId).trim()
      ? getDiscoverPollStateForMember(uid, String(opts.focusPollId).trim()).then(
          (p) => p ?? getLatestDiscoverPollForUser(uid)
        )
      : getLatestDiscoverPollForUser(uid);

  const [stats, trips, streakRes, poll] = await Promise.all([
    getUserTripAggregateStats(uid),
    getTripsForUser(uid),
    touchDiscoverStreak(uid),
    pollPromise,
  ]);
  const score = computeTravelScore(stats);
  const adminTripCount = countAdminTrips(trips, uid);
  const quests = buildDiscoverQuests(uid, stats, trips);
  const vibeChips = buildVibeChips(stats, adminTripCount);
  const badgeTier = badgeTierFromDiscoverScore(score);
  const leaderboard = await leaderboardForUser(uid, score);
  return {
    score,
    streak: streakRes.streak,
    stats,
    quests,
    leaderboard,
    poll,
    vibeChips,
    badgeTier,
  };
}
