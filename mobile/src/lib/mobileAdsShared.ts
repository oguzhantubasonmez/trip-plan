import type { ComponentType } from 'react';

/** `react-native-google-mobile-ads` paketini import etmeden kullandığımız yüzey (web bundle’a sızmasın). */
export type GoogleMobileAdsModule = {
  MobileAds: () => { initialize: () => Promise<unknown> };
  BannerAd: ComponentType<{
    unitId: string;
    size: string;
    requestOptions?: { requestNonPersonalizedAdsOnly?: boolean };
  }>;
  BannerAdSize: { ANCHORED_ADAPTIVE_BANNER: string };
  TestIds: { BANNER: string; ADAPTIVE_BANNER: string; REWARDED: string };
  RewardedAd: {
    createForAdRequest: (
      id: string,
      opts?: { requestNonPersonalizedAdsOnly?: boolean }
    ) => RewardedAdHandle;
  };
  RewardedAdEventType: { LOADED: string; EARNED_REWARD: string };
  AdEventType: { ERROR: string; CLOSED: string };
};

export type RewardedAdHandle = {
  addAdEventListener: (type: string, listener: (arg?: unknown) => void) => () => void;
  load: () => void;
  show: () => void;
};
