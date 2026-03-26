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
  participantDisplayName: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirmRemove: () => void;
};

export function RemoveTripAttendeeConfirmModal(props: Props) {
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
            <Ionicons name="person-remove-outline" size={28} color={theme.color.danger} />
          </View>
          <Text style={styles.title}>Katılımcıyı çıkar</Text>
          <Text style={styles.lead}>
            Bu kişi rotadan çıkarılır; ana sayfasında rota görünmez, detaya erişemez. İstersen sonra yeniden
            davet edebilirsin.
          </Text>

          <View style={styles.personPill}>
            <Ionicons name="person-outline" size={18} color={theme.color.primaryDark} />
            <Text style={styles.personName} numberOfLines={2}>
              {props.participantDisplayName.trim() || 'Katılımcı'}
            </Text>
          </View>

          <View style={styles.tripPill}>
            <Ionicons name="map-outline" size={18} color={theme.color.primaryDark} />
            <Text style={styles.tripTitle} numberOfLines={2}>
              {props.tripTitle.trim() || 'İsimsiz rota'}
            </Text>
          </View>

          <View style={styles.infoBlock}>
            <View style={styles.infoRow}>
              <View style={styles.infoBullet} />
              <Text style={styles.infoText}>Diğer katılımcılara ve çıkarılan kişiye uygulama içi bildirim gider.</Text>
            </View>
            <View style={styles.infoRow}>
              <View style={[styles.infoBullet, styles.infoBulletAccent]} />
              <Text style={styles.infoText}>Rota oluşturucusu ve kendin bu işlemle çıkarılamaz.</Text>
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
                title="Çıkar"
                variant="danger"
                size="compact"
                onPress={props.onConfirmRemove}
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
      backgroundColor: 'rgba(239,68,68,0.12)',
      borderColor: 'rgba(239,68,68,0.35)',
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
    personPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space.sm,
      backgroundColor: theme.color.primarySoft,
      borderWidth: 1,
      borderColor: theme.color.cardBorderPrimary,
      borderRadius: theme.radius.lg,
      paddingVertical: theme.space.sm,
      paddingHorizontal: theme.space.md,
      marginBottom: theme.space.sm,
    },
    personName: {
      flex: 1,
      minWidth: 0,
      color: theme.color.text,
      fontSize: theme.font.body,
      fontWeight: '800',
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
      fontSize: theme.font.small,
      fontWeight: '700',
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
      backgroundColor: theme.color.primary,
      marginTop: 7,
      flexShrink: 0,
    },
    infoBulletAccent: {
      backgroundColor: theme.color.accent,
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
