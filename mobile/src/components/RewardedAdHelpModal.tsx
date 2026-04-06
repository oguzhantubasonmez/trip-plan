import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from './PrimaryButton';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';

const TIPS: string[] = [
  'VPN veya kurumsal ağı kapatıp mobil veri veya ev Wi‑Fi ile dene.',
  'Android: Ayarlar → Ağ ve internet → Özel DNS → “Kapalı” veya “Otomatik” (reklam filtresi veren DNS, Google reklam sunucularını da kesebilir).',
  'Reklam engelleyici / güvenlik uygulaması (Blok listesi, “tracking protection”) varsa RouteWise veya Google Mobile Ads için istisna ekle ya da geçici kapat.',
  'Veri tasarrufu / “sadece Wi‑Fi” kısıtları bazen TLS oturumunu bozar; kapatıp tekrar dene.',
  'Tarih ve saat otomatik ve doğru olsun.',
];

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Hata nesnesinden kısa teknik özet (gösterilir) */
  technicalHint?: string | null;
};

/**
 * Ödüllü reklam yüklenemediğinde: reklam engeli / ağ / SSL için yönlendirme + ayarlara kısayol.
 * Uygulama içinde “reklam izni” diye ayrı bir Android izni yok; kullanıcıyı doğru ayarlara yönlendiriyoruz.
 */
export function RewardedAdHelpModal(props: Props) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const panelW = Math.min(400, winW - theme.space.lg * 2);
  const maxPanelH = Math.min(520, winH * 0.72);

  const openAppSettings = () => {
    void Linking.openSettings().catch(() => {});
  };

  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={props.onClose}
    >
      <Pressable style={styles.backdrop} onPress={props.onClose} accessibilityRole="button" accessibilityLabel="Kapat">
        <Pressable
          style={[
            styles.panel,
            theme.shadowCard,
            {
              width: panelW,
              maxHeight: maxPanelH,
              marginBottom: Math.max(insets.bottom, theme.space.md),
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.iconWrap, styles.iconWrapWarn]}>
            <Ionicons name="cellular-outline" size={28} color={theme.color.primaryDark} />
          </View>
          <Text style={styles.title}>Reklam açılamadı</Text>
          <Text style={styles.subtitle}>
            Bu genelde <Text style={styles.subStrong}>ağ veya cihazdaki koruma</Text> kaynaklıdır; klasik “reklam engeli” tarayıcı eklentisi
            değil, çoğunlukla <Text style={styles.subStrong}>DNS filtresi, VPN veya güvenlik uygulaması</Text> Google’ın reklam sunucularına
            TLS bağlantısını keser (ekrandaki “SSL / bağlantı sıfırlandı” hatası buna benzer).
          </Text>

          {props.technicalHint?.trim() ? (
            <View style={styles.techBox}>
              <Text style={styles.techLabel}>Teknik özet</Text>
              <Text style={styles.techText} selectable>
                {props.technicalHint.trim()}
              </Text>
            </View>
          ) : null}

          <Text style={styles.listTitle}>Deneyebileceklerin</Text>
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {TIPS.map((line, i) => (
              <View key={i} style={styles.tipRow}>
                <View style={styles.tipBullet} />
                <Text style={styles.tipText}>{line}</Text>
              </View>
            ))}
          </ScrollView>

          <View style={styles.actions}>
            {Platform.OS === 'android' || Platform.OS === 'ios' ? (
              <View style={styles.actionGrow}>
                <PrimaryButton title="Uygulama ayarları" variant="outline" size="compact" onPress={openAppSettings} />
              </View>
            ) : null}
            <View style={styles.actionGrow}>
              <PrimaryButton title="Tamam" size="compact" onPress={props.onClose} />
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
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginBottom: theme.space.sm,
    },
    iconWrapWarn: {
      backgroundColor: theme.color.primarySoft,
      borderWidth: 1,
      borderColor: theme.color.border,
    },
    title: {
      color: theme.color.text,
      fontSize: theme.font.h2,
      fontWeight: '900',
      textAlign: 'center',
      marginBottom: theme.space.sm,
    },
    subtitle: {
      color: theme.color.muted,
      fontSize: theme.font.small,
      lineHeight: 22,
      textAlign: 'center',
      marginBottom: theme.space.md,
    },
    subStrong: {
      color: theme.color.text,
      fontWeight: '800',
    },
    techBox: {
      backgroundColor: theme.color.inputBg,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.border,
      padding: theme.space.sm,
      marginBottom: theme.space.md,
    },
    techLabel: {
      fontSize: theme.font.tiny,
      fontWeight: '800',
      color: theme.color.muted,
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    techText: {
      fontSize: theme.font.tiny,
      color: theme.color.textSecondary,
      lineHeight: 18,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    listTitle: {
      fontSize: theme.font.small,
      fontWeight: '900',
      color: theme.color.text,
      marginBottom: theme.space.sm,
    },
    scroll: {
      maxHeight: 200,
      marginBottom: theme.space.md,
    },
    tipRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: theme.space.sm,
      marginBottom: theme.space.sm,
    },
    tipBullet: {
      width: 6,
      height: 6,
      borderRadius: 3,
      marginTop: 7,
      backgroundColor: theme.color.primaryDark,
      flexShrink: 0,
    },
    tipText: {
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
