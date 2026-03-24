const base = require('./app.json');

/** EAS / lokal prebuild sırasında dolu olmalı; boş anahtarla karolar yüklenmez (siyah harita + Google logosu). */
const googleMapsApiKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  '';

module.exports = {
  ...base,
  expo: {
    ...base.expo,
    extra: {
      ...(base.expo.extra || {}),
      googleMapsApiKey,
    },
    plugins: [
      ...base.expo.plugins,
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
