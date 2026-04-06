import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from './PrimaryButton';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Mağaza / abonelik URL’si yokken «Pro ol» — teknik uyarı yerine kullanıcı dostu bilgi.
 */
export function ProComingSoonModal(props: Props) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const panelW = Math.min(380, winW - theme.space.lg * 2);

  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={props.onClose}
    >
      <Pressable
        style={styles.backdrop}
        onPress={props.onClose}
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
          <View style={[styles.iconWrap, styles.iconWrapPro]}>
            <Ionicons name="star" size={30} color={theme.color.primaryDark} />
          </View>
          <Text style={styles.kicker}>RouteWise Pro</Text>
          <Text style={styles.title}>Pro üyelik yakında</Text>
          <Text style={styles.lead}>
            Abonelik ve uygulama içi satın alma{' '}
            <Text style={styles.leadStrong}>çok yakında</Text>. Şimdilik ücretsiz sürümle devam edebilirsin; hazır
            olduğunda buradan haberdar olacaksın.
          </Text>
          <View style={styles.bullets}>
            <View style={styles.bulletRow}>
              <Ionicons name="checkmark-circle" size={18} color={theme.color.primary} />
              <Text style={styles.bulletText}>Sınırsız rota oluşturma</Text>
            </View>
            <View style={styles.bulletRow}>
              <Ionicons name="checkmark-circle" size={18} color={theme.color.primary} />
              <Text style={styles.bulletText}>Gelişmiş planlama ve dışa aktarma</Text>
            </View>
            <View style={styles.bulletRow}>
              <Ionicons name="checkmark-circle" size={18} color={theme.color.primary} />
              <Text style={styles.bulletText}>Reklamsız deneyim</Text>
            </View>
          </View>
          <View style={{ width: '100%' }}>
            <PrimaryButton title="Tamam" onPress={props.onClose} />
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
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginBottom: theme.space.md,
    },
    iconWrapPro: {
      backgroundColor: theme.color.primarySoft,
      borderWidth: 1,
      borderColor: theme.color.cardBorderPrimary,
    },
    kicker: {
      textAlign: 'center',
      fontSize: theme.font.tiny,
      fontWeight: '800',
      color: theme.color.primaryDark,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: 4,
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
      fontSize: theme.font.body,
      lineHeight: 24,
      textAlign: 'center',
      marginBottom: theme.space.md,
    },
    leadStrong: {
      color: theme.color.text,
      fontWeight: '900',
    },
    bullets: {
      gap: theme.space.sm,
      marginBottom: theme.space.lg,
    },
    bulletRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: theme.space.xs,
    },
    bulletText: {
      flex: 1,
      color: theme.color.textSecondary,
      fontSize: theme.font.small,
      fontWeight: '600',
      lineHeight: 20,
    },
  });
}
