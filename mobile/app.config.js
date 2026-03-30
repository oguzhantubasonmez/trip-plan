const base = require('./app.json');

/** EAS / lokal prebuild sırasında dolu olmalı; boş anahtarla karolar yüklenmez (siyah harita + Google logosu). */
const googleMapsApiKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  '';

/** EAS derlemesinde `process.env` ile dolar; çalışma anında `expo-constants` extra üzerinden de okunur. */
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
};

const FIREBASE_ENV_KEYS = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
];

if (process.env.EAS_BUILD === 'true') {
  const missing = FIREBASE_ENV_KEYS.filter((k) => !String(process.env[k] || '').trim());
  if (missing.length) {
    console.warn(
      '\n[EAS] APK için Firebase ortam değişkenleri eksik. expo.dev → Environment variables → ' +
        'preview/production ortamına şunları ekleyin ve bu profile atayın:\n',
      missing.join('\n'),
      '\n'
    );
  }
}

const iosBase = base.expo.ios || {};
const iosBg = iosBase.infoPlist?.UIBackgroundModes;
const iosBgMerged = Array.from(
  new Set([...(Array.isArray(iosBg) ? iosBg : []), 'remote-notification']),
);

module.exports = {
  ...base,
  expo: {
    ...base.expo,
    ios: {
      ...iosBase,
      infoPlist: {
        ...(iosBase.infoPlist || {}),
        UIBackgroundModes: iosBgMerged,
      },
    },
    extra: {
      ...(base.expo.extra || {}),
      googleMapsApiKey,
      firebaseConfig,
      /** WhatsApp vb. için tıklanabilir https davet adresi (ör. GitHub Pages’e yüklenen invite-redirect.example.html). */
      inviteWebBaseUrl: process.env.EXPO_PUBLIC_INVITE_WEB_URL || '',
    },
    plugins: [
      ...base.expo.plugins,
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'RouteWise, bulunduğun yerdeki anlık hava durumunu göstermek için konumunu kullanır.',
        },
      ],
      [
        'react-native-maps',
        {
          androidGoogleMapsApiKey: googleMapsApiKey,
          iosGoogleMapsApiKey: googleMapsApiKey,
        },
      ],
    ],
  },
};
