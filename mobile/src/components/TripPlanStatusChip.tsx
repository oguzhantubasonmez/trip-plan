import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { TripPlanStatus } from '../types/trip';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';
import { TRIP_PLAN_STATUS_LABEL_TR } from '../utils/tripPlanStatus';

type Props = {
  status: TripPlanStatus;
  /** Katılımcıysa tıklanınca sıradaki duruma geçer */
  interactive: boolean;
  busy?: boolean;
  onPressCycle?: () => void;
  /** compact = ana sayfa kartı */
  compact?: boolean;
};

export function TripPlanStatusChip(props: Props) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const label = TRIP_PLAN_STATUS_LABEL_TR[props.status];
  const palette = chipPalette(theme, props.status);
  const plannedVivid = props.status === 'planned';

  const inner = plannedVivid ? (
    <LinearGradient
      colors={['#0369A1', '#0D9488', '#059669']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.chip,
        styles.chipPlannedGradient,
        props.compact ? styles.chipCompact : null,
        props.interactive && !props.busy ? styles.chipInteractive : null,
      ]}
    >
      {props.busy ? (
        <ActivityIndicator size="small" color="#FFFFFF" style={styles.spinner} />
      ) : null}
      <Text style={styles.chipTextPlanned} numberOfLines={1}>
        {label}
      </Text>
    </LinearGradient>
  ) : (
    <View
      style={[
        styles.chip,
        props.compact ? styles.chipCompact : null,
        { backgroundColor: palette.bg, borderColor: palette.border },
        props.interactive && !props.busy ? styles.chipInteractive : null,
      ]}
    >
      {props.busy ? (
        <ActivityIndicator size="small" color={palette.text} style={styles.spinner} />
      ) : null}
      <Text style={[styles.chipText, { color: palette.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );

  if (!props.interactive || props.busy) {
    return (
      <View accessibilityRole="text" accessibilityLabel={`Rota durumu: ${label}`}>
        {inner}
      </View>
    );
  }

  return (
    <Pressable
      onPress={props.onPressCycle}
      accessibilityRole="button"
      accessibilityLabel={`Rota durumu: ${label}. Sonraki duruma geç.`}
      hitSlop={8}
      style={({ pressed }) => [pressed && { opacity: 0.88 }]}
    >
      {inner}
    </Pressable>
  );
}

function chipPalette(
  t: AppTheme,
  status: TripPlanStatus
): { bg: string; border: string; text: string } {
  switch (status) {
    case 'planned':
      /* Görünüm LinearGradient ile (chipPlannedGradient); palette yedek / tutarlılık */
      return {
        bg: t.color.primarySoft,
        border: t.color.primary,
        text: t.color.primaryDark,
      };
    case 'in_progress':
      return {
        bg: t.color.accentSoft,
        border: t.color.cardBorderAccent,
        text: t.color.text,
      };
    case 'completed':
      return {
        bg: 'rgba(34,197,94,0.14)',
        border: t.color.success,
        text: t.color.success,
      };
    default:
      return {
        bg: t.color.inputBg,
        border: t.color.border,
        text: t.color.text,
      };
  }
}

function createStyles(t: AppTheme) {
  return StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: t.radius.pill,
      borderWidth: 1,
      gap: 6,
      maxWidth: '100%',
    },
    chipPlannedGradient: {
      borderColor: 'rgba(255,255,255,0.45)',
      ...t.shadowSoft,
    },
    chipCompact: {
      paddingVertical: 5,
      paddingHorizontal: 8,
    },
    chipInteractive: {},
    chipText: {
      fontSize: t.font.tiny,
      fontWeight: '800',
    },
    chipTextPlanned: {
      fontSize: t.font.tiny,
      fontWeight: '900',
      color: '#FFFFFF',
      letterSpacing: 0.3,
      textShadowColor: 'rgba(0,0,0,0.22)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    spinner: { marginRight: -2 },
  });
}
