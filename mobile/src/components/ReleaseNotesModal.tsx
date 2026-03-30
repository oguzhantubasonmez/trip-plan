import { useMemo, useState } from 'react';
import {
  Modal,
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

type Props = {
  visible: boolean;
  version: string;
  body: string;
  onClose: (dontShowAgain: boolean) => void;
};

export function ReleaseNotesModal(props: Props) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const panelW = Math.min(400, winW - theme.space.lg * 2);
  const maxBodyH = Math.min(320, winH * 0.45);
  const [dontShow, setDontShow] = useState(false);

  return (
    <Modal visible={props.visible} transparent animationType="fade" statusBarTranslucent>
      <View style={[styles.backdrop, { paddingTop: insets.top + theme.space.md }]}>
        <View style={[styles.panel, theme.shadowCard, { width: panelW }]}>
          <Text style={styles.kicker}>Yenilikler</Text>
          <Text style={styles.title}>RouteWise {props.version}</Text>
          <ScrollView
            style={[styles.bodyScroll, { maxHeight: maxBodyH }]}
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.bodyText}>{props.body}</Text>
          </ScrollView>

          <Pressable
            onPress={() => setDontShow((x) => !x)}
            style={({ pressed }) => [styles.checkRow, pressed && { opacity: 0.88 }]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: dontShow }}
          >
            <Text style={styles.checkGlyph}>{dontShow ? '☑' : '☐'}</Text>
            <Text style={styles.checkLabel}>
              Gelecek güncellemelerde sürüm notlarını gösterme (tüm sürümler)
            </Text>
          </Pressable>

          <PrimaryButton title="Tamam" onPress={() => props.onClose(dontShow)} />
        </View>
      </View>
    </Modal>
  );
}

function createStyles(t: AppTheme) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: t.color.overlayDark,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: t.space.lg,
      paddingBottom: t.space.xl,
    },
    panel: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.xl,
      borderWidth: 1,
      borderColor: t.color.cardBorderPrimary,
      padding: t.space.lg,
      maxWidth: '100%',
    },
    kicker: {
      color: t.color.primaryDark,
      fontSize: t.font.tiny,
      fontWeight: '800',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      marginBottom: t.space.xs,
    },
    title: {
      color: t.color.text,
      fontSize: t.font.h2,
      fontWeight: '900',
      marginBottom: t.space.md,
    },
    bodyScroll: {
      marginBottom: t.space.md,
    },
    bodyText: {
      color: t.color.textSecondary,
      fontSize: t.font.small,
      lineHeight: 22,
      fontWeight: '600',
    },
    checkRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: t.space.sm,
      marginBottom: t.space.md,
      paddingVertical: 4,
    },
    checkGlyph: {
      fontSize: 20,
      lineHeight: 24,
      color: t.color.text,
    },
    checkLabel: {
      flex: 1,
      color: t.color.text,
      fontSize: t.font.small,
      fontWeight: '700',
      lineHeight: 22,
    },
  });
}
