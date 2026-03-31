import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

/**
 * Konsolda koleksiyon: `appContent`
 *
 * Önerilen: belge kimliğini elle **`home`** yap (Belge kimliği → Otomatik kimlik yerine kendi kimliğin).
 * Böylece birden fazla içerik belgesi olsa bile ana sayfa hep `home`’u okur.
 *
 * Otomatik ID ile tek belge oluşturduysan da uygulama onu kullanır (`home` yoksa koleksiyondaki ilk belge).
 */
export const HOME_SCREEN_COPY_COLLECTION = 'appContent';
export const HOME_SCREEN_COPY_DOC_ID = 'home';

export const DEFAULT_HOME_SCREEN_COPY = {
  anasayfa_baslik: 'Nereye gidiyoruz?',
  altmetin1: 'Duraklar, süre, masraf ve yakıt — arkadaşlarınla birlikte planla.',
  altmetin2: 'Bildirimler sağ üstte.',
} as const;

export type HomeScreenCopy = {
  anasayfa_baslik: string;
  altmetin1: string;
  altmetin2: string;
};

/** İzin hatası vb. — varsayılan metin göstermek Firestore çalışıyor sanılmasın diye boş. */
export const EMPTY_HOME_SCREEN_COPY: HomeScreenCopy = {
  anasayfa_baslik: '',
  altmetin1: '',
  altmetin2: '',
};

function coerceStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function mergeCopy(raw: Record<string, unknown> | undefined): HomeScreenCopy {
  const title =
    coerceStr(raw?.anasayfa_baslik) ??
    coerceStr(raw?.anasayfa_baslık) ??
    DEFAULT_HOME_SCREEN_COPY.anasayfa_baslik;
  return {
    anasayfa_baslik: title,
    altmetin1: coerceStr(raw?.altmetin1) ?? DEFAULT_HOME_SCREEN_COPY.altmetin1,
    altmetin2: coerceStr(raw?.altmetin2) ?? DEFAULT_HOME_SCREEN_COPY.altmetin2,
  };
}

/**
 * Oturum token’ı Firestore isteğine bağlanmadan snapshot açılırsa kurallar reddeder ve uygulama
 * hep varsayılan metinde kalır. Bu yüzden önce `onAuthStateChanged`, sonra `home` belgesi dinlenir.
 * `home` yoksa koleksiyonda tek belge / ilk belgeye düşülür.
 */
export function subscribeHomeScreenCopy(onNext: (copy: HomeScreenCopy) => void): Unsubscribe {
  let innerUnsub: Unsubscribe | null = null;

  const stopInner = () => {
    innerUnsub?.();
    innerUnsub = null;
  };

  const startFirestore = () => {
    stopInner();
    const homeRef = doc(db, HOME_SCREEN_COPY_COLLECTION, HOME_SCREEN_COPY_DOC_ID);

    innerUnsub = onSnapshot(
      homeRef,
      async (snap) => {
        if (snap.exists()) {
          onNext(mergeCopy(snap.data() as Record<string, unknown>));
          return;
        }
        try {
          const q = query(collection(db, HOME_SCREEN_COPY_COLLECTION), limit(5));
          const list = await getDocs(q);
          const preferred = list.docs.find((d) => d.id === HOME_SCREEN_COPY_DOC_ID);
          const chosen = preferred ?? list.docs[0];
          onNext(mergeCopy(chosen ? (chosen.data() as Record<string, unknown>) : undefined));
        } catch {
          onNext({ ...EMPTY_HOME_SCREEN_COPY });
        }
      },
      () => {
        onNext({ ...EMPTY_HOME_SCREEN_COPY });
      }
    );
  };

  const authUnsub = onAuthStateChanged(auth, (user) => {
    if (!user) {
      stopInner();
      onNext({ ...EMPTY_HOME_SCREEN_COPY });
      return;
    }
    startFirestore();
  });

  return () => {
    authUnsub();
    stopInner();
  };
}
