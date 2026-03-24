import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../ThemeContext';

type Props = {
  size?: number;
};

/**
 * Uygulama markası — gradyan rozet + emoji (ek PNG gerektirmez)
 */
export function AppLogo({ size = 80 }: Props) {
  const theme = useAppTheme();
  const grad = [...theme.primaryButtonGradient] as [string, string];
  return (
    <View style={[styles.wrap, { width: size + 8, height: size + 28 }]}>
      <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={[styles.emoji, { fontSize: size * 0.45 }]}>✈️</Text>
      </LinearGradient>
      <Text style={[styles.wordmark, { color: theme.color.primaryDark, fontSize: size * 0.22 }]}>Rota</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  circle: { alignItems: 'center', justifyContent: 'center' },
  emoji: {},
  wordmark: { fontWeight: '900', letterSpacing: 2 },
});
