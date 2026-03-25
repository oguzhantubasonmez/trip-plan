import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';

type Variant = 'primary' | 'accent' | 'outline' | 'danger';

export function PrimaryButton(props: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  variant?: Variant;
  /** Durak kartı vb. daha küçük düğüm */
  size?: 'default' | 'compact';
}) {
  const theme = useAppTheme();
  const styles = useMemo(() => createPrimaryButtonStyles(theme), [theme]);
  const variant = props.variant ?? 'primary';
  const compact = props.size === 'compact';
  const colors =
    variant === 'accent'
      ? [...theme.accentButtonGradient]
      : variant === 'outline' || variant === 'danger'
        ? []
        : [...theme.primaryButtonGradient];

  if (variant === 'danger') {
    const dangerColors = ['#DC2626', '#B91C1C'] as [string, string];
    return (
      <Pressable
        testID={props.testID}
        onPress={props.onPress}
        disabled={props.disabled || props.loading}
        style={({ pressed }) => [
          styles.wrap,
          theme.shadowSoft,
          pressed && !props.disabled && !props.loading ? styles.pressed : null,
          props.disabled || props.loading ? styles.disabled : null,
        ]}
      >
        <LinearGradient
          colors={dangerColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          <View style={styles.inner}>
            <Text style={styles.text}>{props.loading ? '...' : props.title}</Text>
          </View>
        </LinearGradient>
      </Pressable>
    );
  }

  if (variant === 'outline') {
    return (
      <Pressable
        testID={props.testID}
        onPress={props.onPress}
        disabled={props.disabled || props.loading}
        style={({ pressed }) => [
          styles.outlineBtn,
          compact && styles.outlineBtnCompact,
          theme.shadowSoft,
          pressed && !props.disabled && !props.loading ? styles.outlinePressed : null,
          props.disabled || props.loading ? styles.disabled : null,
        ]}
      >
        <Text style={[styles.outlineText, compact && styles.outlineTextCompact]}>
          {props.loading ? '...' : props.title}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      testID={props.testID}
      onPress={props.onPress}
      disabled={props.disabled || props.loading}
      style={({ pressed }) => [
        styles.wrap,
        theme.shadowSoft,
        pressed && !props.disabled && !props.loading ? styles.pressed : null,
        props.disabled || props.loading ? styles.disabled : null,
      ]}
    >
      <LinearGradient
        colors={colors as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.inner}>
          <Text style={styles.text}>{props.loading ? '...' : props.title}</Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function createPrimaryButtonStyles(theme: AppTheme) {
  return StyleSheet.create({
    wrap: { borderRadius: theme.radius.pill, overflow: 'hidden' },
    gradient: { borderRadius: theme.radius.pill },
    inner: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 15,
      paddingHorizontal: 22,
    },
    innerCompact: {
      paddingVertical: 10,
      paddingHorizontal: 16,
    },
    text: {
      color: '#FFFFFF',
      fontSize: theme.font.body,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    textCompact: {
      fontSize: theme.font.small,
    },
    pressed: { opacity: 0.92, transform: [{ scale: 0.98 }] },
    disabled: { opacity: 0.5 },
    outlineBtn: {
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.pill,
      borderWidth: 2,
      borderColor: theme.color.primary,
      paddingVertical: 13,
      paddingHorizontal: 20,
      alignItems: 'center',
    },
    outlinePressed: { backgroundColor: theme.color.primarySoft },
    outlineText: {
      color: theme.color.primaryDark,
      fontSize: theme.font.body,
      fontWeight: '800',
    },
    outlineTextCompact: {
      fontSize: theme.font.small,
    },
  });
}
