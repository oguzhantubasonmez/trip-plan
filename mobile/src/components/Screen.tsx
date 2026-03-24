import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';

export function Screen(props: { children: ReactNode; noGradient?: boolean }) {
  const theme = useAppTheme();
  const styles = useMemo(() => createScreenStyles(theme), [theme]);

  if (props.noGradient) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.color.bg }]}>
        <View style={styles.inner}>{props.children}</View>
      </SafeAreaView>
    );
  }
  return (
    <LinearGradient
      colors={[...theme.screenGradient] as [string, string, ...string[]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.inner}>{props.children}</View>
      </SafeAreaView>
    </LinearGradient>
  );
}

function createScreenStyles(theme: AppTheme) {
  return StyleSheet.create({
    gradient: { flex: 1 },
    safe: { flex: 1, backgroundColor: 'transparent' },
    inner: { flex: 1, paddingHorizontal: theme.space.lg, paddingTop: theme.space.md },
  });
}
