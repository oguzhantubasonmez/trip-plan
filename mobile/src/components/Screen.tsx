import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { Edge } from 'react-native-safe-area-context';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';

export function Screen(props: {
  children: ReactNode;
  noGradient?: boolean;
  /** Varsayılan tüm kenarlar; sekme kökünde üst chrome ScrollView içindeyse ['left','right','bottom'] */
  safeAreaEdges?: Edge[];
  /** Varsayılan `theme.space.md`; sekme kökü genelde 0 */
  contentTopPadding?: number;
}) {
  const theme = useAppTheme();
  const topPad = props.contentTopPadding ?? theme.space.md;
  const styles = useMemo(() => createScreenStyles(theme, topPad), [theme, topPad]);
  const safeProps = props.safeAreaEdges ? { edges: props.safeAreaEdges } : {};

  /**
   * Web: `useWindowDimensions()` çoğu zaman viewport/meta genişliğini (ör. ~390) verir;
   * buna sabit px vermek masaüstünde dar sütun yapar. Üst zincir + web.css tam genişlikte;
   * burada yalnızca %100 + stretch.
   */
  const webFill =
    Platform.OS === 'web'
      ? {
          width: '100%' as const,
          maxWidth: '100%' as const,
          alignSelf: 'stretch' as const,
        }
      : null;

  if (props.noGradient) {
    return (
      <SafeAreaView style={[styles.safe, webFill, { backgroundColor: theme.color.bg }]} {...safeProps}>
        <View style={[styles.inner, webFill]}>{props.children}</View>
      </SafeAreaView>
    );
  }
  return (
    <LinearGradient
      colors={[...theme.screenGradient] as [string, string, ...string[]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.gradient, webFill]}
    >
      <SafeAreaView style={[styles.safe, webFill]} {...safeProps}>
        <View style={[styles.inner, webFill]}>{props.children}</View>
      </SafeAreaView>
    </LinearGradient>
  );
}

function createScreenStyles(theme: AppTheme, contentTopPadding: number) {
  return StyleSheet.create({
    gradient: { flex: 1, width: '100%', maxWidth: '100%', alignSelf: 'stretch' },
    safe: { flex: 1, width: '100%', maxWidth: '100%', alignSelf: 'stretch', backgroundColor: 'transparent' },
    inner: {
      flex: 1,
      width: '100%',
      maxWidth: '100%',
      alignSelf: 'stretch',
      paddingHorizontal: theme.space.lg,
      paddingTop: contentTopPadding,
    },
  });
}
