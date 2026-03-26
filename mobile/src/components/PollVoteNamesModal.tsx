import { useMemo } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Örn. «B şıkkı» */
  optionSummary: string;
  names: string[];
  loading: boolean;
  error: string | null;
};

export function PollVoteNamesModal(props: Props) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="fade"
      onRequestClose={props.onClose}
    >
      <Pressable style={styles.backdrop} onPress={props.onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Kim oy verdi?</Text>
          <Text style={styles.sub}>{props.optionSummary}</Text>
          {props.loading ? (
            <ActivityIndicator color={theme.color.primary} style={{ marginVertical: theme.space.md }} />
          ) : props.error ? (
            <Text style={styles.error}>{props.error}</Text>
          ) : props.names.length === 0 ? (
            <Text style={styles.empty}>Bu şıkkı henüz kimse seçmemiş.</Text>
          ) : (
            <ScrollView
              style={styles.scroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {props.names.map((n, i) => (
                <Text key={`${n}-${i}`} style={styles.nameRow}>
                  · {n}
                </Text>
              ))}
            </ScrollView>
          )}
          <Pressable onPress={props.onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>Tamam</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(t: AppTheme) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: t.color.overlayDark,
      justifyContent: 'center',
      padding: t.space.lg,
    },
    card: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.xl,
      padding: t.space.lg,
      borderWidth: 1,
      borderColor: t.color.cardBorderPrimary,
      maxHeight: '70%',
      ...t.shadowCard,
    },
    title: {
      color: t.color.text,
      fontSize: t.font.h2,
      fontWeight: '900',
      marginBottom: 4,
    },
    sub: {
      color: t.color.textSecondary,
      fontSize: t.font.small,
      fontWeight: '700',
      marginBottom: t.space.sm,
    },
    scroll: { maxHeight: 220 },
    nameRow: {
      color: t.color.text,
      fontSize: t.font.body,
      fontWeight: '600',
      paddingVertical: 6,
    },
    empty: {
      color: t.color.muted,
      fontSize: t.font.small,
      fontStyle: 'italic',
      marginVertical: t.space.md,
    },
    error: {
      color: t.color.danger,
      fontSize: t.font.small,
      fontWeight: '700',
      marginVertical: t.space.sm,
    },
    closeBtn: {
      marginTop: t.space.md,
      alignSelf: 'flex-end',
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: t.radius.pill,
      backgroundColor: t.color.primarySoft,
      borderWidth: 1,
      borderColor: t.color.primary,
    },
    closeBtnText: {
      color: t.color.primaryDark,
      fontSize: t.font.small,
      fontWeight: '800',
    },
  });
}
