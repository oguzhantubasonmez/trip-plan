import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

function readFirebaseConfig(): FirebaseConfig {
  // Expo injects EXPO_PUBLIC_* at build time; support both process.env and (global as any) for web
  const env = typeof process !== 'undefined' && process.env ? process.env : (global as any);
  const cfg: Partial<FirebaseConfig> = {
    apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
  };

  const missing = Object.entries(cfg)
    .filter(([, v]) => v === undefined || v === '')
    .map(([k]) => k);

  if (missing.length) {
    throw new Error(
      `Firebase config missing: ${missing.join(', ')}. ` +
        `Create mobile/.env with EXPO_PUBLIC_FIREBASE_* and restart (npx expo start --web -c).`,
    );
  }

  return cfg as FirebaseConfig;
}

export const firebaseConfig = readFirebaseConfig();

export const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);

// Web: bazı Firebase web akışları compat bekler — varsayılan app yoksa başlat
if (typeof window !== 'undefined') {
  try {
    const compat = require('firebase/compat/app');
    require('firebase/compat/auth');
    if (!compat.default.apps?.length) {
      compat.default.initializeApp(firebaseConfig);
    }
  } catch (_) {
    // compat may already be initialized by modular init
  }
}

