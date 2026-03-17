import { ReactNode } from 'react';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import { theme } from '../theme';

export function Screen(props: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.inner}>{props.children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.bg },
  inner: { flex: 1, paddingHorizontal: theme.space.lg, paddingTop: theme.space.lg },
});

