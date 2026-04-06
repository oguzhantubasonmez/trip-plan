import { useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomAdBanner, TopTabBannerAd } from './BottomAdBanner';
import { TripCreditsHeader } from './TripCreditsHeader';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';

type ChromeAdsProps = {
  /** false: yalnızca rota hakkı şeridi; üst banner yok */
  showBannerAds?: boolean;
};

/**
 * Yalnızca Profil sekmesi: üst (status + banner + rota hakkı) ve alt banner.
 * Ana sayfa / Keşfet için `TabRootSafeAreaTop` kullanın.
 */
export function TabRootScrollChromeTop({ showBannerAds = true }: ChromeAdsProps) {
  const theme = useAppTheme();
  const isWeb = Platform.OS === 'web';
  const styles = useMemo(() => createChromeStyles(theme, isWeb), [theme, isWeb]);

  return (
    <View style={styles.chromeShadow}>
      <View style={styles.chromeInner}>
        <SafeAreaView edges={['top']} style={styles.safeTop}>
          {showBannerAds ? <TopTabBannerAd /> : null}
          <TripCreditsHeader omitTopInset />
        </SafeAreaView>
      </View>
    </View>
  );
}

export function TabRootScrollChromeBottom({ showBannerAds = true }: ChromeAdsProps) {
  const theme = useAppTheme();
  const bottomStyles = useMemo(
    () =>
      StyleSheet.create({
        bottomWrap: {
          width: '100%',
          maxWidth: '100%',
          alignSelf: 'stretch',
          marginTop: theme.space.sm,
        },
      }),
    [theme.space.sm]
  );

  if (!showBannerAds) {
    return null;
  }

  return (
    <View style={bottomStyles.bottomWrap}>
      <BottomAdBanner />
    </View>
  );
}

/** Ana sayfa / Keşfet: status bar boşluğu; rota hakkı ve sekme reklamları Profil’de. */
export function TabRootSafeAreaTop() {
  const theme = useAppTheme();
  return (
    <View style={{ width: '100%', marginBottom: theme.space.md }}>
      <SafeAreaView edges={['top']} style={{ width: '100%', backgroundColor: 'transparent' }} />
    </View>
  );
}

function createChromeStyles(theme: AppTheme, isWeb: boolean) {
  const r = theme.radius.xl;
  return StyleSheet.create({
    chromeShadow: {
      width: '100%',
      maxWidth: '100%',
      alignSelf: 'stretch',
      marginBottom: theme.space.md,
      borderRadius: r,
      backgroundColor: 'transparent',
      ...(isWeb ? {} : theme.shadowCard),
    },
    chromeInner: isWeb
      ? {
          borderRadius: r,
          overflow: 'hidden',
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.22)',
        }
      : {
          borderRadius: r,
          overflow: 'hidden',
          backgroundColor: theme.color.surface,
          borderWidth: 1,
          borderColor: theme.color.cardBorderPrimary,
        },
    safeTop: {
      width: '100%',
      backgroundColor: 'transparent',
    },
  });
}
