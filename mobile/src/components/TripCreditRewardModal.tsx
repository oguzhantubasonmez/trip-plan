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
 * Ödüllü reklam sonrası rota hakkı — sistem alert yerine tema ile uyumlu onay.
 */
export function TripCreditRewardModal(props: Props) {
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
          <View style={[styles.iconWrap, styles.iconWrapSuccess]}>
            <Ionicons name="ticket" size={30} color={theme.color.primaryDark} />
          </View>
          <Text style={styles.kicker}>Hak güncellendi</Text>
          <Text style={styles.title}>Teşekkürler</Text>
          <Text style={styles.lead}>
            Reklamı tamamladın. <Text style={styles.leadStrong}>1 rota oluşturma hakkı</Text> hesabına eklendi.
          </Text>
          <View style={styles.hintRow}>
            <Ionicons name="sparkles-outline" size={18} color={theme.color.muted} />
            <Text style={styles.hintText}>Yeni rotayı hemen planlayabilirsin.</Text>
          </View>
          <View style={{ width: '100%' }}>
            <PrimaryButton title="Harika" onPress={props.onClose} />
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
    iconWrapSuccess: {
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
    hintRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginBottom: theme.space.lg,
      paddingHorizontal: theme.space.sm,
    },
    hintText: {
      flex: 1,
      color: theme.color.textSecondary,
      fontSize: theme.font.small,
      fontWeight: '600',
      lineHeight: 20,
    },
  });
}
