/** Firestore / Firebase istemci hataları (permission-denied vb.) */

export function isFirestorePermissionDenied(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const o = e as { code?: string; message?: string };
  const c = o.code;
  if (c === 'permission-denied' || c === 'firestore/permission-denied') return true;
  const msg = typeof o.message === 'string' ? o.message : '';
  if (/insufficient permissions|missing or insufficient permissions|permission denied/i.test(msg)) {
    return true;
  }
  return false;
}

/** Kullanıcıya gösterilecek kısa yönlendirme (Türkçe). */
export function firestorePermissionUserMessage(): string {
  return (
    'Firestore erişimi reddedildi. Firebase Console → Firestore → Kurallar: (1) `users` — giriş yapmış ' +
    'kullanıcılar birbirinin profil belgesini okuyabilmeli; yalnızca `request.auth.uid == userId` okuması ' +
    'e-posta / isim / telefon ile arkadaş aramasını kırar. (2) `friendRequests` — okuma ve istek ' +
    'oluşturma/silme. Örnek: mobile/firestore.rules.example dosyasını yapıştırıp Yayınla.'
  );
}
