import { useMemo } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { PrimaryButton } from './PrimaryButton';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';

type Props = {
  visible: boolean;
  locationName: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
};

export function DeleteStopConfirmModal(props: Props) {
  const theme = useAppTheme();
  const { width } = useWindowDimensions();
  const maxW = Math.min(360, width - theme.space.lg * 2);
  const styles = useMemo(() => createStyles(theme, maxW), [theme, maxW]);

  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="fade"
      onRequestClose={props.onCancel}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={props.busy ? undefined : props.onCancel}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.iconWrap}>
            <Text style={styles.iconGlyph} accessibilityLabel="Uyarı">
              ✕
            </Text>
          </View>
          <Text style={styles.title}>Durağı sil</Text>
          <Text style={styles.name} numberOfLines={2}>
            {props.locationName}
          </Text>
          <Text style={styles.hint}>
            Bu durak listeden kaldırılır. Bu durağa yazılmış yorumlar da silinir. Bu işlem geri
            alınamaz.
          </Text>
          <View style={styles.actions}>
            <View style={styles.btnFlex}>
              <PrimaryButton
                title="İptal"
                variant="outline"
                onPress={props.onCancel}
                disabled={props.busy}
              />
            </View>
            <View style={styles.btnFlex}>
              <PrimaryButton
                title="Sil"
                variant="accent"
                onPress={props.onConfirm}
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

function createStyles(t: AppTheme, maxWidth: number) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: t.color.overlayDark,
      justifyContent: 'center',
      alignItems: 'center',
      padding: t.space.lg,
    },
    card: {
      width: '100%',
      maxWidth,
      backgroundColor: t.color.card,
      borderRadius: t.radius.lg,
      borderWidth: 1,
      borderColor: t.color.cardBorderPrimary,
      padding: t.space.lg,
      ...t.shadowCard,
    },
    iconWrap: {
      alignSelf: 'center',
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: t.color.primarySoft,
      borderWidth: 1,
      borderColor: t.color.cardBorderPrimary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: t.space.md,
    },
    iconGlyph: {
      fontSize: 22,
      color: t.color.primary,
      fontWeight: '600',
    },
    title: {
      fontSize: t.font.h2,
      fontWeight: '700',
      color: t.color.text,
      textAlign: 'center',
      marginBottom: t.space.sm,
    },
    name: {
      fontSize: t.font.body,
      fontWeight: '600',
      color: t.color.primary,
      textAlign: 'center',
      marginBottom: t.space.md,
    },
    hint: {
      fontSize: t.font.small,
      lineHeight: 20,
      color: t.color.textSecondary,
      textAlign: 'center',
      marginBottom: t.space.lg,
    },
    actions: {
      flexDirection: 'row',
      gap: t.space.sm,
    },
    btnFlex: {
      flex: 1,
    },
  });
}
