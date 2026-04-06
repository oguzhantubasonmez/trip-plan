import { doc, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * Firestore `users/{uid}`:
 * - `pro: true` → süresiz Pro (yönetim / sunucu doğrulaması sonrası)
 * - veya `proUntil: Timestamp` → bu tarihe kadar Pro
 *
 * Üretimde `pro` alanını yalnızca güvenilir backend (IAP doğrulama, Cloud Function) yazmalıdır;
 * istemci tarafında herkesin `pro: true` yazabilmesi kurallarla engellenmelidir.
 */
export function isProFromUserDoc(data: Record<string, unknown> | undefined | null): boolean {
  if (!data) return false;
  if (data.pro === true) return true;
  const until = data.proUntil;
  if (until != null && typeof until === 'object' && 'toMillis' in (until as object)) {
    try {
      return (until as Timestamp).toMillis() > Date.now();
    } catch {
      return false;
    }
  }
  return false;
}

/** Geliştirme: Pro’yu aç/kapat (yalnızca __DEV__). */
export async function setProEntitlementDev(uid: string, active: boolean): Promise<void> {
  if (!__DEV__) return;
  const ref = doc(db, 'users', uid);
  await updateDoc(ref, {
    pro: active,
    proUntil: null,
    updatedAt: serverTimestamp(),
  });
}

/** Örnek: 30 günlük Pro bitişi (test; üretimde IAP sonrası sunucu yazar). */
export async function setProEntitlementDevTimed(uid: string, days: number): Promise<void> {
  if (!__DEV__) return;
  const ref = doc(db, 'users', uid);
  const ms = Date.now() + Math.max(1, days) * 24 * 60 * 60 * 1000;
  await updateDoc(ref, {
    pro: false,
    proUntil: Timestamp.fromDate(new Date(ms)),
    updatedAt: serverTimestamp(),
  });
}
