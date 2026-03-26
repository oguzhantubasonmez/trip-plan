import { useMemo, useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';

type Props = {
  title: string;
  /** Kapalıyken başlığın altında gösterilen kısa özet */
  collapsedSummary?: string;
  defaultOpen?: boolean;
  /** İkisi de verilirse kontrollü mod (örn. derin linkten yorumlar açık) */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Daha az dikey boşluk ve küçük başlık (mobil rota ekranı için) */
  compact?: boolean;
  /** Başlık fontunu bir kademe daha küçült (örn. Katılımcılar) */
  smallTitle?: boolean;
  /** Sağ üst (ör. “+ Ekle”) — tıklanınca kart açılmaz */
  headerRight?: ReactNode;
  children: ReactNode;
  /** Dış kart (örn. TripDetail `section` stili) */
  containerStyle?: StyleProp<ViewStyle>;
};

export function CollapsibleSection(props: Props) {
  const theme = useAppTheme();
  const compact = props.compact ?? false;
  const smallTitle = props.smallTitle ?? false;
  const styles = useMemo(
    () => createStyles(theme, compact, smallTitle),
    [theme, compact, smallTitle]
  );
  const controlled = props.open !== undefined && props.onOpenChange != null;
  const [internalOpen, setInternalOpen] = useState(props.defaultOpen ?? false);
  const open = controlled ? Boolean(props.open) : internalOpen;
  function toggle() {
    const next = !open;
    if (controlled) props.onOpenChange?.(next);
    else setInternalOpen(next);
  }

  return (
    <View style={[styles.card, props.containerStyle]}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={toggle}
          style={({ pressed }) => [styles.headerMain, pressed && { opacity: 0.92 }]}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
        >
          <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
          <View style={styles.headerTitles}>
            <Text style={styles.title}>{props.title}</Text>
            {!open && props.collapsedSummary ? (
              <Text style={styles.summary} numberOfLines={2}>
                {props.collapsedSummary}
              </Text>
            ) : null}
          </View>
        </Pressable>
        {props.headerRight ? <View style={styles.headerRightWrap}>{props.headerRight}</View> : null}
      </View>
      {open ? <View style={styles.body}>{props.children}</View> : null}
    </View>
  );
}

function createStyles(t: AppTheme, compact: boolean, smallTitle: boolean) {
  const titleFontSize = smallTitle
    ? t.font.small
    : compact
      ? t.font.body
      : t.font.h2;
  return StyleSheet.create({
    card: {},
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: compact ? 8 : t.space.sm,
    },
    headerMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: compact ? 8 : t.space.sm,
      paddingVertical: compact ? 0 : 2,
    },
    chevron: {
      fontSize: compact ? 12 : 14,
      color: t.color.muted,
      fontWeight: '800',
      marginTop: compact ? 2 : 4,
      minWidth: compact ? 18 : 22,
    },
    headerTitles: { flex: 1, minWidth: 0 },
    title: {
      color: t.color.text,
      fontSize: titleFontSize,
      fontWeight: smallTitle ? '700' : '800',
      letterSpacing: smallTitle || compact ? 0 : -0.2,
    },
    summary: {
      color: t.color.muted,
      fontSize: compact ? t.font.tiny : t.font.small,
      fontWeight: '600',
      marginTop: compact ? 4 : 6,
      lineHeight: compact ? 16 : 20,
    },
    headerRightWrap: {
      justifyContent: 'center',
      paddingTop: compact ? 0 : 2,
    },
    body: {
      marginTop: compact ? t.space.sm : t.space.md,
      /** Web / bazı flex üstlerde gövde kalan yüksekliği doldurup içeriği itebiliyordu */
      flexGrow: 0,
      alignSelf: 'stretch',
    },
  });
}
