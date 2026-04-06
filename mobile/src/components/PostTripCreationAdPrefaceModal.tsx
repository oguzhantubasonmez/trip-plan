import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  POST_TRIP_CREATION_AD_PREFACE_MESSAGE,
  POST_TRIP_CREATION_AD_PREFACE_TITLE,
} from '../lib/postTripCreationAdPrefaceBridge';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';
import { PrimaryButton } from './PrimaryButton';

type Props = {
  visible: boolean;
  onContinue: () => void;
};

export function PostTripCreationAdPrefaceModal(props: Props) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const panelW = Math.min(400, winW - theme.space.lg * 2);
  const paragraphs = POST_TRIP_CREATION_AD_PREFACE_MESSAGE.split(/\n\n+/).filter(Boolean);

  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        /* cancelable: false — yalnızca ana düğme */
      }}
    >
      <View style={styles.backdrop} accessibilityViewIsModal>
        <View
          style={[
            styles.panel,
            theme.shadowCard,
            { width: panelW, marginBottom: Math.max(insets.bottom, theme.space.md) },
          ]}
        >
          <View style={[styles.iconWrap, styles.iconWrapAccent]}>
            <Ionicons name="play-circle" size={30} color={theme.color.primaryDark} />
          </View>
          <Text style={styles.kicker}>Teşekkürler</Text>
          <Text style={styles.title}>{POST_TRIP_CREATION_AD_PREFACE_TITLE}</Text>
          {paragraphs.map((p, i) => (
            <Text key={i} style={i === 0 ? styles.lead : styles.leadSecondary}>
              {p.trim()}
            </Text>
          ))}
          <PrimaryButton title="Reklamı izle ve devam et" onPress={props.onContinue} />
        </View>
      </View>
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
    iconWrapAccent: {
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
      marginBottom: theme.space.md,
    },
    lead: {
      color: theme.color.textSecondary,
      fontSize: theme.font.small,
      lineHeight: 22,
      textAlign: 'center',
      marginBottom: theme.space.sm,
    },
    leadSecondary: {
      color: theme.color.muted,
      fontSize: theme.font.tiny,
      lineHeight: 20,
      textAlign: 'center',
      marginBottom: theme.space.lg,
      fontWeight: '600',
    },
  });
}
