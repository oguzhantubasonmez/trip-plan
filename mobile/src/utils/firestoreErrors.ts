/** Firestore / Firebase istemci hataları (permission-denied vb.) */

export function isFirestorePermissionDenied(e: unknown): boolean {
  const code = (e as { code?: string })?.code;
  return code === 'permission-denied';
}

/** Kullanıcıya gösterilecek kısa yönlendirme (Türkçe). */
export function firestorePermissionUserMessage(): string {
  return (
    'Firestore izni yok. Firebase Console → Firestore → Kurallar: `friendRequests` koleksiyonu için okuma/yazma ' +
    'izni ekleyin. Koleksiyon adı tam olarak friendRequests olmalı (büyük/küçük harf). Örnek kurallar: ' +
    'mobile/firestore.rules.example'
  );
}
