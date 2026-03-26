import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { DiscoverPollState } from '../types/discover';
import {
  normalizePollDocument,
  optionsFromNormalized,
  parseChoiceIndex,
  parseStoredVote,
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  sanitizeNewOptionTexts,
} from '../utils/pollFirestore';

function pollsCollection(tripId: string) {
  return collection(db, 'trips', tripId, 'polls');
}

export async function listTripPollsWithVotes(
  tripId: string,
  uid: string | undefined
): Promise<DiscoverPollState[]> {
  const tid = String(tripId ?? '').trim();
  if (!tid) return [];
  const snap = await getDocs(query(pollsCollection(tid), orderBy('createdAt', 'desc')));
  const rows: DiscoverPollState[] = [];
  for (const d of snap.docs) {
    const p = d.data() as Record<string, unknown>;
    const question = String((p as { question?: unknown }).question ?? 'Anket');
    const norm = normalizePollDocument(p);
    const opts = optionsFromNormalized(norm.labels, norm.counts);
    let userChoice: string | null = null;
    if (uid) {
      const vs = await getDoc(doc(db, 'trips', tid, 'polls', d.id, 'votes', uid));
      const vv = vs.data() as Record<string, unknown> | undefined;
      userChoice = parseStoredVote(vv ?? null, opts.length);
    }
    const totalVotes = opts.reduce((s, o) => s + o.count, 0);
    rows.push({
      pollId: d.id,
      question,
      options: opts,
      userChoice,
      totalVotes,
    });
  }
  return rows;
}

export async function createTripPoll(params: {
  tripId: string;
  createdBy: string;
  question: string;
  optionTexts: string[];
}): Promise<string> {
  const tid = String(params.tripId ?? '').trim();
  const q = params.question.trim();
  if (!tid) throw new Error('Rota bulunamadı.');
  if (q.length < 2) throw new Error('Soru en az 2 karakter olsun.');
  const texts = sanitizeNewOptionTexts(params.optionTexts);
  if (texts.length < POLL_MIN_OPTIONS) {
    throw new Error(`En az ${POLL_MIN_OPTIONS} seçenek gir.`);
  }
  if (texts.length > POLL_MAX_OPTIONS) {
    throw new Error(`En fazla ${POLL_MAX_OPTIONS} seçenek olabilir.`);
  }
  const ref = await addDoc(pollsCollection(tid), {
    question: q,
    optionLabels: texts,
    voteCounts: texts.map(() => 0),
    createdBy: params.createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function voteTripPoll(
  tripId: string,
  pollDocId: string,
  uid: string,
  choiceId: string
): Promise<void> {
  const tid = String(tripId ?? '').trim();
  const pid = String(pollDocId ?? '').trim();
  if (!tid || !pid) throw new Error('Anket bulunamadı.');
  const pollRef = doc(db, 'trips', tid, 'polls', pid);
  const voteRef = doc(db, 'trips', tid, 'polls', pid, 'votes', uid);
  await runTransaction(db, async (tx) => {
    const pollSnap = await tx.get(pollRef);
    if (!pollSnap.exists()) throw new Error('Anket bulunamadı.');
    const voteSnap = await tx.get(voteRef);
    if (voteSnap.exists()) return;
    const poll = pollSnap.data() as Record<string, unknown>;
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
