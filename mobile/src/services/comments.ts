import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { bumpTripCommentActivity } from './trips';
import type { Comment } from '../types/comment';

/** Kök koleksiyon — durak yorumları + eski rota yorumları (tripId ile). */
const COMMENTS = 'comments';

function tripCommentsCollection(tripId: string) {
  return collection(db, 'trips', tripId, 'comments');
}

function commentFromDoc(d: QueryDocumentSnapshot, fallbackTripId?: string): Comment {
  const v = d.data() as any;
  return {
    commentId: d.id,
    stopId: v.stopId ?? undefined,
    tripId: v.tripId ?? fallbackTripId ?? undefined,
    userId: v.userId,
    message: v.message,
    timestamp: v.timestamp,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Sorgu/yazma uyumu için (boşluk, tip). */
export function normalizeTripIdForComments(tripId: string): string {
  return String(tripId ?? '').trim();
}

export async function addComment(params: {
  stopId: string;
  userId: string;
  message: string;
}): Promise<string> {
  const ref = doc(collection(db, COMMENTS));
  await setDoc(ref, {
    commentId: ref.id,
    stopId: params.stopId,
    tripId: null,
    userId: params.userId,
    message: params.message.trim(),
    timestamp: serverTimestamp(),
  });
  try {
    const stopSnap = await getDoc(doc(db, 'stops', params.stopId));
    const tid = stopSnap.data()?.tripId;
    if (typeof tid === 'string' && tid.trim()) void bumpTripCommentActivity(tid.trim());
  } catch {
    /* yok */
  }
  return ref.id;
}

function firestoreErrorCode(e: unknown): string {
  if (e && typeof e === 'object' && 'code' in e && typeof (e as { code: unknown }).code === 'string') {
    return (e as { code: string }).code;
  }
  return '';
}

/**
 * Rota yorumu: önce `trips/{tripId}/comments/{id}` (kurallar path tripId ile uyumlu).
 * İzin reddi (eski kurallar / alt koleksiyon tanımsız) olursa kök `comments` + tripId alanına düşer.
 */
export async function addTripComment(params: {
  tripId: string;
  userId: string;
  message: string;
}): Promise<string> {
  const tid = normalizeTripIdForComments(params.tripId);
  if (!tid) throw new Error('Geçersiz rota kimliği.');
  const msg = params.message.trim();
  if (!msg) throw new Error('Boş yorum gönderilemez.');

  const payload = {
    tripId: tid,
    userId: params.userId,
    message: msg,
    timestamp: serverTimestamp(),
  };

  const subRef = doc(collection(db, 'trips', tid, 'comments'));
  const subDoc = { commentId: subRef.id, ...payload };
  try {
    await setDoc(subRef, subDoc);
    void bumpTripCommentActivity(tid);
    return subRef.id;
  } catch (e: unknown) {
    if (firestoreErrorCode(e) !== 'permission-denied') throw e;
  }

  const rootRef = doc(collection(db, COMMENTS));
  await setDoc(rootRef, { commentId: rootRef.id, ...payload });
  void bumpTripCommentActivity(tid);
  return rootRef.id;
}

export async function getCommentsForStop(stopId: string): Promise<Comment[]> {
  const q = query(collection(db, COMMENTS), where('stopId', '==', stopId));
  const snap = await getDocs(q);
  const out: Comment[] = [];
  snap.forEach((d) => {
    const v = d.data() as any;
    out.push({
      commentId: d.id,
      stopId: v.stopId ?? undefined,
      tripId: v.tripId ?? undefined,
      userId: v.userId,
      message: v.message,
      timestamp: v.timestamp,
    });
  });
  out.sort((a, b) => {
    const ta = a.timestamp?.toMillis?.() ?? 0;
    const tb = b.timestamp?.toMillis?.() ?? 0;
    return ta - tb;
  });
  return out;
}

async function getTripCommentsFromSubcollection(tripId: string): Promise<Comment[]> {
  const tid = normalizeTripIdForComments(tripId);
  if (!tid) return [];
  const snap = await getDocs(tripCommentsCollection(tid));
  const out: Comment[] = [];
  snap.forEach((d) => out.push(commentFromDoc(d, tid)));
  return out;
}

/** Eski veri: kök `comments` içinde tripId alanı olan belgeler (kurallar izin veriyorsa). */
async function getTripCommentsFromRootLegacy(tripId: string): Promise<Comment[]> {
  const tid = normalizeTripIdForComments(tripId);
  if (!tid) return [];
  const q = query(collection(db, COMMENTS), where('tripId', '==', tid));
  const snap = await getDocs(q);
  const out: Comment[] = [];
  snap.forEach((d) => out.push(commentFromDoc(d, tid)));
  return out;
}

export async function getCommentsForTrip(tripId: string): Promise<Comment[]> {
  const tid = normalizeTripIdForComments(tripId);
  if (!tid) return [];
  const [subRes, rootRes] = await Promise.allSettled([
    getTripCommentsFromSubcollection(tid),
    getTripCommentsFromRootLegacy(tid),
  ]);
  const byId = new Map<string, Comment>();
  if (subRes.status === 'fulfilled') {
    for (const c of subRes.value) byId.set(c.commentId, c);
  }
  if (rootRes.status === 'fulfilled') {
    for (const c of rootRes.value) {
      if (!byId.has(c.commentId)) byId.set(c.commentId, c);
    }
  }
  const out = Array.from(byId.values());
  out.sort((a, b) => {
    const ta = a.timestamp?.toMillis?.() ?? 0;
    const tb = b.timestamp?.toMillis?.() ?? 0;
    return ta - tb;
  });

  /**
   * Alt koleksiyon boş + kök `where('tripId')` reddedilirse birleşik [] dönüyordu; load() listeyi sıfırlayıp
   * ekrandaki yorumlar (Firebase’de olanlar) kayboluyordu. Gerçekten boş rota: her iki okuma da başarılı olmalı.
   */
  const bothReadsOk = subRes.status === 'fulfilled' && rootRes.status === 'fulfilled';
  if (out.length === 0 && !bothReadsOk) {
    const rejected = [subRes, rootRes].find((r) => r.status === 'rejected') as
      | PromiseRejectedResult
      | undefined;
    const reason = rejected?.reason;
    const msg =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : 'Yorumlar okunamadı (izin veya ağ).';
    throw new Error(msg);
  }

  return out;
}

/** Ağ / kısa süreli izin gürültüsünde birkaç kez dene (ekrana geri dönüşte boş liste). */
export async function getCommentsForTripReliable(tripId: string): Promise<Comment[]> {
  const tid = normalizeTripIdForComments(tripId);
  if (!tid) return [];
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await getCommentsForTrip(tid);
    } catch (e) {
      lastError = e;
      if (attempt < 2) await delay(400);
    }
  }
  throw lastError;
}
