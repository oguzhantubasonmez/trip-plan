import Constants from 'expo-constants';
import type { GoogleMobileAdsModule } from './mobileAdsShared';

/**
 * Web: AdMob native modülü yok; paketi grafa hiç sokmayız (Metro 500 önlenir).
 */
export const supportsGoogleMobileAds = false;

export function isExpoGoEnvironment(): boolean {
  return Constants.appOwnership === 'expo';
}

export type { GoogleMobileAdsModule } from './mobileAdsShared';

export function getGoogleMobileAdsModule(): GoogleMobileAdsModule | null {
  return null;
}
