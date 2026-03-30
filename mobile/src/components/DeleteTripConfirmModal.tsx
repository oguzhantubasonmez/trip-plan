import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from './PrimaryButton';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';

type Props = {
  visible: boolean;
  tripTitle: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirmDelete: () => void;
};

export function DeleteTripConfirmModal(props: Props) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const panelW = Math.min(360, winW - theme.space.lg * 2);

  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={props.busy ? undefined : props.onClose}
    >
      <Pressable
        style={styles.backdrop}
        onPress={props.busy ? undefined : props.onClose}
        accessibilityRole="button"
        accessibilityLabel="Kapat"
      >
        <Pressable
          style={[
            styles.panel,
            theme.shadowCard,
            {
              width: panelW,
              marginBottom: Math.max(insets.bottom, theme.space.md),
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.iconWrap, styles.iconWrapDanger]}>
            <Ionicons name="trash-outline" size={28} color={theme.color.danger} />
          </View>
          <Text style={styles.title}>Rotayı sil</Text>
          <Text style={styles.lead}>
            Bu rota ve tüm durakları kalıcı olarak silinir. Katılımcılar da erişemez. Bu işlem geri alınamaz.
          </Text>

          <View style={styles.tripPill}>
            <Ionicons name="map-outline" size={18} color={theme.color.primaryDark} />
            <Text style={styles.tripTitle} numberOfLines={3}>
              {props.tripTitle.trim() || 'İsimsiz rota'}
            </Text>
          </View>

          <View style={styles.infoBlock}>
            <View style={styles.infoRow}>
              <View style={[styles.infoBullet, styles.infoBulletDanger]} />
              <Text style={styles.infoText}>Rota belgesi, duraklar ve bu rotaya bağlı yerel veriler uygulama kurallarına göre temizlenir.</Text>
            </View>
            <View style={styles.infoRow}>
              <View style={[styles.infoBullet, styles.infoBulletDanger]} />
              <Text style={styles.infoText}>Davet linki artık geçerli olmayabilir; katılımcılara haber vermek isteyebilirsin.</Text>
            </View>
          </View>

          {props.error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={theme.color.danger} />
              <Text style={styles.errorText}>{props.error}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <View style={styles.actionGrow}>
              <PrimaryButton
                title="Vazgeç"
                variant="outline"
                size="compact"
                onPress={props.onClose}
                disabled={props.busy}
              />
            </View>
            <View style={styles.actionGrow}>
              <PrimaryButton
                title="Rotayı sil"
                variant="danger"
                size="compact"
                onPress={props.onConfirmDelete}
                disabled={props.busy}
                loading={props.busy}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: theme.color.overlayDark,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: theme.space.lg,
    },
    panel: {
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.xl,
      borderWidth: 1,
      borderColor: theme.color.cardBorderPrimary,
      padding: theme.space.lg,
      maxWidth: '100%',
    },
    iconWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: theme.color.primarySoft,
      borderWidth: 1,
      borderColor: theme.color.border,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginBottom: theme.space.md,
    },
    iconWrapDanger: {
      backgroundColor: 'rgba(239, 68, 68, 0.12)',
      borderColor: 'rgba(239, 68, 68, 0.35)',
    },
    title: {
      color: theme.color.text,
      fontSize: theme.font.h2,
      fontWeight: '900',
      textAlign: 'center',
      marginBottom: theme.space.sm,
    },
    lead: {
      color: theme.color.muted,
      fontSize: theme.font.small,
      lineHeight: 22,
      textAlign: 'center',
      marginBottom: theme.space.md,
    },
    tripPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space.sm,
      backgroundColor: theme.color.inputBg,
      borderWidth: 1,
      borderColor: theme.color.border,
      borderRadius: theme.radius.lg,
      paddingVertical: theme.space.sm,
      paddingHorizontal: theme.space.md,
      marginBottom: theme.space.md,
    },
    tripTitle: {
      flex: 1,
      minWidth: 0,
      color: theme.color.text,
      fontSize: theme.font.body,
      fontWeight: '800',
    },
    infoBlock: {
      gap: theme.space.sm,
      marginBottom: theme.space.md,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: theme.space.sm,
    },
    infoBullet: {
      width: 6,
      height: 6,
      borderRadius: 3,
      marginTop: 7,
      flexShrink: 0,
    },
    infoBulletDanger: {
      backgroundColor: theme.color.danger,
    },
    infoText: {
      flex: 1,
      color: theme.color.textSecondary,
      fontSize: theme.font.tiny,
      lineHeight: 18,
      fontWeight: '600',
    },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: theme.space.sm,
      backgroundColor: 'rgba(239,68,68,0.1)',
      borderWidth: 1,
      borderColor: theme.color.danger,
      borderRadius: theme.radius.md,
      padding: theme.space.sm,
      marginBottom: theme.space.md,
    },
    errorText: {
      flex: 1,
      color: theme.color.danger,
      fontSize: theme.font.small,
      fontWeight: '700',
      lineHeight: 20,
    },
    actions: {
      flexDirection: 'row',
      gap: theme.space.sm,
      alignItems: 'stretch',
    },
    actionGrow: { flex: 1, minWidth: 0 },
  });
}
