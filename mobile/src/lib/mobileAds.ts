import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { GoogleMobileAdsModule } from './mobileAdsShared';

/**
 * Google AdMob yalnızca native derlemede (EAS Build / expo run) çalışır.
 * Expo Go’da native modül yok; web’de banner/rewarded yok.
 */
export const supportsGoogleMobileAds = Platform.OS === 'android' || Platform.OS === 'ios';

/** Expo Go’da reklam SDK’sı kullanılmaz (test için development build gerekir). */
export function isExpoGoEnvironment(): boolean {
  return Constants.appOwnership === 'expo';
}

export type { GoogleMobileAdsModule } from './mobileAdsShared';

let cachedModule: GoogleMobileAdsModule | null | undefined;

export function getGoogleMobileAdsModule(): GoogleMobileAdsModule | null {
  if (!supportsGoogleMobileAds) return null;
  if (isExpoGoEnvironment()) return null;
  if (cachedModule !== undefined) return cachedModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedModule = require('react-native-google-mobile-ads') as GoogleMobileAdsModule;
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}
