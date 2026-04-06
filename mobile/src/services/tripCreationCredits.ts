import { doc, getDoc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

/** Yeni kayıtta verilen ücretsiz rota oluşturma hakkı. */
export const DEFAULT_TRIP_CREATION_CREDITS = 3;

export function resolvedTripCreationCreditsFromDoc(data: Record<string, unknown> | undefined): number {
  if (!data) return DEFAULT_TRIP_CREATION_CREDITS;
  const c = data.tripCreationCredits;
  if (typeof c === 'number' && Number.isFinite(c) && c >= 0) return Math.floor(c);
  return DEFAULT_TRIP_CREATION_CREDITS;
}

/** Profil nesnesinden (Firestore veya getUserProfile) görünen hak sayısı. */
export function effectiveTripCreationCredits(profile: { tripCreationCredits?: number } | null | undefined): number {
  const c = profile?.tripCreationCredits;
  if (typeof c === 'number' && Number.isFinite(c) && c >= 0) return Math.floor(c);
  return DEFAULT_TRIP_CREATION_CREDITS;
}

/**
 * Eski hesaplarda alan yoksa bir kez 3 yazar (Firestore’da sabitlenir).
 * Oturum açılınca App’ten çağrılır.
 */
export async function ensureTripCreationCreditsField(uid: string): Promise<void> {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const d = snap.data() as Record<string, unknown>;
  if (d.tripCreationCredits !== undefined && d.tripCreationCredits !== null) return;
  await updateDoc(ref, {
    tripCreationCredits: DEFAULT_TRIP_CREATION_CREDITS,
    updatedAt: serverTimestamp(),
  });
}

export class NoTripCreationCreditsError extends Error {
  constructor() {
    super('NO_TRIP_CREDITS');
    this.name = 'NoTripCreationCreditsError';
  }
}

/** Başarılı rota oluşturma / kopyadan sonra bir hak düşer. */
export async function consumeTripCreationCredit(uid: string): Promise<number> {
  const ref = doc(db, 'users', uid);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Profil bulunamadı.');
    const d = snap.data() as Record<string, unknown>;
    const cur = resolvedTripCreationCreditsFromDoc(d);
    if (cur < 1) throw new NoTripCreationCreditsError();
    const next = cur - 1;
    tx.update(ref, { tripCreationCredits: next, updatedAt: serverTimestamp() });
    return next;
  });
}

/** Ödüllü reklam sonrası +1 hak. */
export async function addTripCreationCreditFromReward(uid: string): Promise<number> {
  const ref = doc(db, 'users', uid);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Profil bulunamadı.');
    const d = snap.data() as Record<string, unknown>;
    const cur = resolvedTripCreationCreditsFromDoc(d);
    const next = cur + 1;
    tx.update(ref, { tripCreationCredits: next, updatedAt: serverTimestamp() });
    return next;
  });
}
