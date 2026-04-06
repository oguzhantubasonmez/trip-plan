/**
 * AdMob birim kimlikleri
 * ----------------------
 * Geliştirme: `react-native-google-mobile-ads` içindeki `TestIds` kullanılır (aşağıdaki yardımcılar).
 * Yayın: AdMob konsolunda uygulama + reklam birimi oluştur; `.env` veya `app.json` extra ile ver:
 *   EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID
 *   EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID
 *
 * Expo entegrasyonu:
 * 1) `app.json` → `plugins` içinde `react-native-google-mobile-ads` + `androidAppId` / `iosAppId` (AdMob uygulama kimliği ~ ile biter).
 * 2) `npx expo prebuild` veya EAS Build (Expo Go’da reklam çalışmaz).
 * 3) Android: AdMob’da uygulamayı paket adı `com.routewise.tripplan` ile eşle.
 * 4) Google Mobile Ads SDK politikalarına uy (GDPR/UMP gerekiyorsa ileride eklenebilir).
 */

export function getBannerAdUnitId(TestIds: { BANNER: string; ADAPTIVE_BANNER: string }): string {
  const fromEnv =
    typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID
      ? String(process.env.EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID).trim()
      : '';
  if (fromEnv) return fromEnv;
  return __DEV__ ? TestIds.ADAPTIVE_BANNER || TestIds.BANNER : TestIds.ADAPTIVE_BANNER || TestIds.BANNER;
}

export function getRewardedAdUnitId(TestIds: { REWARDED: string }): string {
  const fromEnv =
    typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID
      ? String(process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID).trim()
      : '';
  if (fromEnv) return fromEnv;
  return TestIds.REWARDED;
}
