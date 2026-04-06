import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { auth, db } from '../lib/firebase';
import { isProFromUserDoc } from '../services/proEntitlement';

export function useProEntitlement(): { isPro: boolean; ready: boolean } {
  const uid = auth.currentUser?.uid;
  const [isPro, setIsPro] = useState(false);
  const [ready, setReady] = useState(!uid);

  useEffect(() => {
    if (!uid) {
      setIsPro(false);
      setReady(true);
      return;
    }
    setReady(false);
    const ref = doc(db, 'users', uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setIsPro(isProFromUserDoc(snap.exists() ? (snap.data() as Record<string, unknown>) : null));
        setReady(true);
      },
      () => {
        setIsPro(false);
        setReady(true);
      }
    );
    return () => unsub();
  }, [uid]);

  return { isPro, ready };
}
