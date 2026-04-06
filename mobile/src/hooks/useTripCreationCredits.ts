import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { auth, db } from '../lib/firebase';
import {
  DEFAULT_TRIP_CREATION_CREDITS,
  resolvedTripCreationCreditsFromDoc,
} from '../services/tripCreationCredits';

/** Firestore `users/{uid}.tripCreationCredits` canlı değeri (oturum yoksa null). */
export function useTripCreationCredits(): number | null {
  const uid = auth.currentUser?.uid;
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    if (!uid) {
      setCredits(null);
      return;
    }
    const ref = doc(db, 'users', uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setCredits(DEFAULT_TRIP_CREATION_CREDITS);
          return;
        }
        setCredits(resolvedTripCreationCreditsFromDoc(snap.data() as Record<string, unknown>));
      },
      () => setCredits(DEFAULT_TRIP_CREATION_CREDITS)
    );
    return () => unsub();
  }, [uid]);

  return credits;
}
