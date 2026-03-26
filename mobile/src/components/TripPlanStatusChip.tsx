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

  const inner = (
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
      return {
        bg: t.color.primarySoft,
        border: t.color.cardBorderPrimary,
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
    chipCompact: {
      paddingVertical: 5,
      paddingHorizontal: 8,
    },
    chipInteractive: {},
    chipText: {
      fontSize: t.font.tiny,
      fontWeight: '800',
    },
    spinner: { marginRight: -2 },
  });
}
