import { useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getBannerAdUnitId } from '../constants/admobConfig';
import { getGoogleMobileAdsModule, isExpoGoEnvironment, supportsGoogleMobileAds } from '../lib/mobileAds';
import { useAppTheme } from '../ThemeContext';

/**
 * Sekmelerin altında sabit, ince uyarlanabilir banner (Google AdMob).
 * Web / Expo Go’da boş görünür.
 */
export function BottomAdBanner() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme, insets.bottom), [theme, insets.bottom]);

  const mod = getGoogleMobileAdsModule();
  if (!mod || !supportsGoogleMobileAds || isExpoGoEnvironment()) {
    return <View style={styles.placeholder} />;
  }

  const { BannerAd, BannerAdSize, TestIds } = mod;
  const unitId = getBannerAdUnitId(TestIds);

  return (
    <View style={styles.wrap} collapsable={false}>
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
      />
    </View>
  );
}

function createStyles(theme: import('../theme').AppTheme, bottomInset: number) {
  return StyleSheet.create({
    wrap: {
      width: '100%',
      alignItems: 'center',
      backgroundColor: theme.color.surface,
      borderTopWidth: 1,
      borderTopColor: theme.color.border,
      paddingBottom: Platform.OS === 'ios' ? Math.max(bottomInset, 4) : 4,
    },
    placeholder: {
      height: 0,
    },
  });
}
