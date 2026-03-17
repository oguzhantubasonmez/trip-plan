const base = require('./app.json');

module.exports = {
  ...base,
  expo: {
    ...base.expo,
    plugins: [
      ...base.expo.plugins,
      [
        'react-native-maps',
        {
          androidGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '',
        },
      ],
    ],
  },
};
