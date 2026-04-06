import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from './PrimaryButton';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';

export type NoTripCreditsVariant = 'createTrip' | 'discover' | 'copyTrip';

const COPY: Record<
  NoTripCreditsVariant,
  { title: string; lead: string; bullet: string }
> = {
  createTrip: {
    title: 'Rota hakkın bitti',
    lead: 'Yeni rota için en az bir rota hakkı gerekir. Kalan hakkını ve ödüllü reklam seçeneğini yalnızca Profil sekmesinde görürsün.',
    bullet: 'Alt menüden Profil’e git → üstteki rota hakkı alanından reklam izleyerek +1 hak kazanabilirsin.',
  },
  discover: {
    title: 'Yer keşfi için daha fazla hak gerekir',
    lead: 'Yer keşfet akışı için rota hakkının birden fazla olması gerekir. Hak durumun ve ödüllü reklam Profil sekmesinde.',
    bullet: 'Profil → rota hakkı: reklam izleyerek hak artır; ardından buradan keşfe devam et.',
  },
  copyTrip: {
    title: 'Rota kopyalamak için hak gerekir',
    lead: 'Kopyalama yeni rota sayılır; en az bir hakkın olmalı. Hak ve reklam yalnızca Profil’de yönetilir.',
    bullet: 'Profil sekmesine geçip rota hakkı satırından +1 hak kazanabilirsin.',
  },
};

type Props = {
  visible: boolean;
  variant: NoTripCreditsVariant;
  onClose: () => void;
  /** Profil sekmesi (rota hakkı + ödüllü reklam) */
  onGoToProfile: () => void;
};

export function NoTripCreditsModal(props: Props) {
  const theme = useAppTheme();
  const styles = useMemo(() => createNoTripCreditsStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const panelW = Math.min(400, winW - theme.space.lg * 2);
  const text = COPY[props.variant];

  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={props.onClose}
    >
      <Pressable style={styles.backdrop} onPress={props.onClose} accessibilityRole="button">
        <Pressable
          style={[
            styles.panel,
            theme.shadowCard,
            { width: panelW, marginBottom: Math.max(insets.bottom, theme.space.md) },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.iconWrap, styles.iconWrapMuted]}>
            <Ionicons name="person-circle-outline" size={28} color={theme.color.primaryDark} />
          </View>
          <Text style={styles.kicker}>Profil</Text>
          <Text style={styles.title}>{text.title}</Text>
          <Text style={styles.lead}>{text.lead}</Text>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>{text.bullet}</Text>
          </View>
          <View style={styles.actions}>
            <View style={styles.actionGrow}>
              <PrimaryButton title="Kapat" variant="outline" size="compact" onPress={props.onClose} />
            </View>
            <View style={styles.actionGrow}>
              <PrimaryButton
                title="Profil'e git"
                size="compact"
                onPress={() => {
                  props.onClose();
                  props.onGoToProfile();
                }}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createNoTripCreditsStyles(theme: AppTheme) {
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
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginBottom: theme.space.sm,
    },
    iconWrapMuted: {
      backgroundColor: theme.color.primarySoft,
      borderWidth: 1,
      borderColor: theme.color.border,
    },
    kicker: {
      textAlign: 'center',
      fontSize: theme.font.tiny,
      fontWeight: '800',
      color: theme.color.muted,
      letterSpacing: 0.6,
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
      fontSize: theme.font.small,
      lineHeight: 22,
      textAlign: 'center',
      marginBottom: theme.space.md,
    },
    bulletRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: theme.space.sm,
      marginBottom: theme.space.lg,
      paddingHorizontal: theme.space.xs,
    },
    bulletDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      marginTop: 8,
      backgroundColor: theme.color.primaryDark,
    },
    bulletText: {
      flex: 1,
      color: theme.color.textSecondary,
      fontSize: theme.font.tiny,
      lineHeight: 19,
      fontWeight: '600',
    },
    actions: {
      flexDirection: 'row',
      gap: theme.space.sm,
      alignItems: 'stretch',
    },
    actionGrow: { flex: 1, minWidth: 0 },
  });
}
