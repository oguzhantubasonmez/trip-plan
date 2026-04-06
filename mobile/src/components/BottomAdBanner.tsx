import { useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getBannerAdUnitId } from '../constants/admobConfig';
import { getGoogleMobileAdsModule, isExpoGoEnvironment, supportsGoogleMobileAds } from '../lib/mobileAds';
import { useAppTheme } from '../ThemeContext';

function useBannerModule() {
  const mod = getGoogleMobileAdsModule();
  if (!mod || !supportsGoogleMobileAds || isExpoGoEnvironment()) return null;
  return mod;
}

/**
 * Scroll içi üst banner. Sabitlenmiş `ANCHORED_*` yerine `INLINE_ADAPTIVE_BANNER` — layout akışında kalır.
 */
export function TopTabBannerAd() {
  const theme = useAppTheme();
  const styles = useMemo(() => createTopStyles(theme, Platform.OS === 'web'), [theme]);
  const mod = useBannerModule();
  if (!mod) {
    return <View style={styles.placeholder} />;
  }

  const { BannerAd, BannerAdSize, TestIds } = mod;
  const unitId = getBannerAdUnitId(TestIds);

  return (
    <View style={styles.wrap} collapsable={false} pointerEvents="box-none">
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.INLINE_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
      />
    </View>
  );
}

/**
 * Scroll içi alt banner. `ANCHORED_ADAPTIVE_BANNER` ekrana sabitlenir (içerik altından kayar);
 * bu yüzden burada yalnızca `INLINE_ADAPTIVE_BANNER` kullanılır.
 *
 * Web / Expo Go’da boş görünür.
 */
export function BottomAdBanner() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createBottomStyles(theme, insets.bottom), [theme, insets.bottom]);

  const mod = useBannerModule();
  if (!mod) {
    return <View style={styles.placeholder} />;
  }

  const { BannerAd, BannerAdSize, TestIds } = mod;
  const unitId = getBannerAdUnitId(TestIds);

  return (
    <View style={styles.wrap} collapsable={false}>
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.INLINE_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
      />
    </View>
  );
}

function createTopStyles(theme: import('../theme').AppTheme, isWeb: boolean) {
  return StyleSheet.create({
    wrap: {
      width: '100%',
      maxWidth: '100%',
      alignSelf: 'stretch',
      alignItems: 'center',
      backgroundColor: 'transparent',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isWeb ? 'rgba(255, 255, 255, 0.2)' : theme.color.border,
    },
    placeholder: {
      width: '100%',
      height: 0,
    },
  });
}

function createBottomStyles(theme: import('../theme').AppTheme, bottomInset: number) {
  return StyleSheet.create({
    wrap: {
      width: '100%',
      maxWidth: '100%',
      alignSelf: 'stretch',
      alignItems: 'center',
      backgroundColor: theme.color.surface,
      borderTopWidth: 1,
      borderTopColor: theme.color.border,
      paddingBottom: Math.max(bottomInset, 4),
    },
    placeholder: {
      height: 0,
    },
  });
}
