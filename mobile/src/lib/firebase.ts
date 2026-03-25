import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  type Firestore,
} from 'firebase/firestore';
import { Platform } from 'react-native';

type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

function trim(v: unknown): string {
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

/**
 * Metro `EXPO_PUBLIC_*` + EAS derlemesinde app.config `extra.firebaseConfig`.
 */
function readFirebaseConfig(): FirebaseConfig {
  const env =
    typeof process !== 'undefined' && process.env
      ? (process.env as Record<string, string | undefined>)
      : {};
  const extra = Constants.expoConfig?.extra as { firebaseConfig?: Partial<FirebaseConfig> } | undefined;
  const fc = extra?.firebaseConfig ?? {};

  const cfg: Partial<FirebaseConfig> = {
    apiKey: trim(env.EXPO_PUBLIC_FIREBASE_API_KEY) || trim(fc.apiKey),
    authDomain: trim(env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN) || trim(fc.authDomain),
    projectId: trim(env.EXPO_PUBLIC_FIREBASE_PROJECT_ID) || trim(fc.projectId),
    storageBucket: trim(env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET) || trim(fc.storageBucket),
    messagingSenderId:
      trim(env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID) || trim(fc.messagingSenderId),
    appId: trim(env.EXPO_PUBLIC_FIREBASE_APP_ID) || trim(fc.appId),
  };

  const missing = Object.entries(cfg)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length) {
    throw new Error(
      `Firebase yapılandırması eksik: ${missing.join(', ')}. ` +
        `mobile/.env içine EXPO_PUBLIC_FIREBASE_* ekleyin; EAS Build için expo.dev → Secrets veya eas.json env ile aynı değişkenleri tanımlayın.`
    );
  }

  return cfg as FirebaseConfig;
}

export const firebaseConfig = readFirebaseConfig();

export const firebaseApp: FirebaseApp = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);

function createAuth(): Auth {
  if (Platform.OS === 'web') {
    return getAuth(firebaseApp);
  }
  // RN paket yolu: getReactNativePersistence yalnızca native bundle’da vardır; web .d.ts’de yok → require.
  const rn = require('firebase/auth') as {
    initializeAuth: (app: FirebaseApp, opts: { persistence: unknown }) => Auth;
    getReactNativePersistence: (storage: typeof AsyncStorage) => unknown;
  };
  try {
    return rn.initializeAuth(firebaseApp, {
      persistence: rn.getReactNativePersistence(AsyncStorage),
    });
  } catch {
    return getAuth(firebaseApp);
  }
}

export const auth: Auth = createAuth();

/**
 * React Native (Android/iOS): varsayılan Fetch/WebChannel akışı bazen senkron motorunda
 * `reload` vb. undefined hatalarına yol açıyor. Long polling genelde daha stabil.
 * Web: klasik getFirestore (tarayıcı ortamı).
 */
function createFirestore(): Firestore {
  if (Platform.OS === 'web') {
    return getFirestore(firebaseApp);
  }
  try {
    return initializeFirestore(firebaseApp, {
      experimentalForceLongPolling: true,
    });
  } catch {
    return getFirestore(firebaseApp);
  }
}

export const db: Firestore = createFirestore();

// Web: bazı Firebase web akışları compat bekler — varsayılan app yoksa başlat
if (typeof window !== 'undefined') {
  try {
    const compat = require('firebase/compat/app');
    require('firebase/compat/auth');
    if (!compat.default.apps?.length) {
      compat.default.initializeApp(firebaseConfig);
    }
  } catch (_) {
    /* compat yok / zaten yüklü */
  }
}
