import { Ionicons } from '@expo/vector-icons';
import { doc, onSnapshot } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProEntitlement } from '../hooks/useProEntitlement';
import { auth, db } from '../lib/firebase';
import { isExpoGoEnvironment } from '../lib/mobileAds';
import { runRewardedTripCreditAdFlow } from '../lib/rewardedTripCreditAdFlow';
import {
  DEFAULT_TRIP_CREATION_CREDITS,
  resolvedTripCreationCreditsFromDoc,
} from '../services/tripCreationCredits';
import { useAppTheme } from '../ThemeContext';
import { RewardedAdHelpModal } from './RewardedAdHelpModal';
import { TripCreditRewardModal } from './TripCreditRewardModal';

type TripCreditsHeaderProps = {
  /** Üstte `SafeAreaView` (edges top) içindeyse true — status bar boşluğu tekrar eklenmez */
  omitTopInset?: boolean;
};

/**
 * Ana sekmeler üstünde: kalan rota hakkı + ödüllü reklam ile hak kazanma.
 */
export function TripCreditsHeader({ omitTopInset = false }: TripCreditsHeaderProps) {
  const theme = useAppTheme();
  const { isPro } = useProEntitlement();
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => createStyles(theme, insets.top, omitTopInset, Platform.OS === 'web'),
    [theme, insets.top, omitTopInset]
  );
  const uid = auth.currentUser?.uid;
  const [credits, setCredits] = useState<number | null>(null);
  const [rewardBusy, setRewardBusy] = useState(false);
  const [rewardSuccessOpen, setRewardSuccessOpen] = useState(false);
  const [adHelpOpen, setAdHelpOpen] = useState(false);
  const [adHelpTechnical, setAdHelpTechnical] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setCredits(null);
      return;
    }
    const ref = doc(db, 'users', uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setCredits(DEFAULT_TRIP_CREATION_CREDITS);
          return;
        }
        setCredits(resolvedTripCreationCreditsFromDoc(snap.data() as Record<string, unknown>));
      },
      () => setCredits(DEFAULT_TRIP_CREATION_CREDITS)
    );
    return () => unsub();
  }, [uid]);

  const showRewardedAd = useCallback(async () => {
    if (!uid) return;
    setRewardBusy(true);
    try {
      const out = await runRewardedTripCreditAdFlow(uid);
      if (out.kind === 'earned') {
        if (Platform.OS !== 'web') {
          setRewardSuccessOpen(true);
        }
      } else if (out.kind === 'error_native') {
        setAdHelpTechnical(out.technicalHint);
        setAdHelpOpen(true);
      }
    } finally {
      setRewardBusy(false);
    }
  }, [uid]);

  if (!uid || credits == null) return null;

  return (
    <>
      <TripCreditRewardModal visible={rewardSuccessOpen} onClose={() => setRewardSuccessOpen(false)} />
      <RewardedAdHelpModal
        visible={adHelpOpen}
        onClose={() => {
          setAdHelpOpen(false);
          setAdHelpTechnical(null);
        }}
        technicalHint={adHelpTechnical}
      />
      <View style={styles.wrap} accessibilityRole="summary">
        <View style={styles.row}>
          <Ionicons
            name={isPro ? 'star' : 'ticket-outline'}
            size={18}
            color={isPro ? '#FBBF24' : theme.color.primaryDark}
            style={styles.icon}
          />
          <Text style={styles.label}>{isPro ? 'RouteWise Pro' : 'Rota hakkı'}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{isPro ? '∞' : credits}</Text>
          </View>
        </View>
        {isPro ? (
          <Text style={styles.proSub}>
            Sınırsız rota · Reklamsız · Gelişmiş planlama (dışa aktarma, durak güncelleme)
          </Text>
        ) : Platform.OS === 'web' ? (
          <View style={styles.webNoAdsBox}>
            <Ionicons name="information-circle-outline" size={20} color={theme.color.muted} style={{ marginRight: 8 }} />
            <Text style={styles.webNoAdsText}>
              Ödüllü reklam web’de çalışmaz; yalnızca telefondaki Android veya iOS uygulamasında açılır. +1 hak için RouteWise’ı Play Store / App Store’dan veya geliştirme APK’sı ile yüklü sürümde dene.
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={() => void showRewardedAd()}
            disabled={rewardBusy}
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.88 }, rewardBusy && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="Reklam izleyerek rota hakkı kazan"
          >
            {rewardBusy ? (
              <ActivityIndicator size="small" color={theme.color.primaryDark} />
            ) : (
              <>
                <Ionicons name="play-circle-outline" size={16} color={theme.color.primaryDark} />
                <Text style={styles.ctaText}>Reklam izle · +1 hak</Text>
              </>
            )}
          </Pressable>
        )}
        {Platform.OS !== 'web' && !isPro && isExpoGoEnvironment() ? (
          <Text style={styles.hint}>Expo Go’da reklam kapalı — geliştirme build gerekir.</Text>
        ) : null}
      </View>
    </>
  );
}

function createStyles(
  theme: import('../theme').AppTheme,
  topInset: number,
  omitTopInset: boolean,
  isWeb: boolean
) {
  const topPad = omitTopInset ? 8 : Math.max(topInset, 0) + 8;
  return StyleSheet.create({
    wrap: {
      paddingTop: topPad,
      paddingBottom: theme.space.md,
      paddingHorizontal: theme.space.md,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    icon: { marginRight: 2 },
    label: {
      flex: 1,
      fontSize: theme.font.small,
      fontWeight: '800',
      color: theme.color.text,
    },
    proSub: {
      fontSize: theme.font.tiny,
      fontWeight: '600',
      color: theme.color.muted,
      lineHeight: 18,
    },
    badge: {
      minWidth: 32,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: theme.radius.pill,
      backgroundColor: 'rgba(255, 149, 0, 0.22)',
      borderWidth: 1,
      borderColor: 'rgba(255, 160, 60, 0.55)',
      alignItems: 'center',
    },
    badgeText: {
      fontSize: theme.font.body,
      fontWeight: '900',
      color: '#FF9500',
    },
    cta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 10,
      borderRadius: theme.radius.md,
      backgroundColor: theme.color.inputBg,
      borderWidth: 1,
      borderColor: theme.color.primary,
    },
    ctaText: {
      fontSize: theme.font.small,
      fontWeight: '800',
      color: theme.color.primaryDark,
    },
    webNoAdsBox: isWeb
      ? {
          flexDirection: 'row',
          alignItems: 'flex-start',
          paddingVertical: 12,
          paddingHorizontal: 12,
          borderRadius: theme.radius.lg,
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.2)',
        }
      : {
          flexDirection: 'row',
          alignItems: 'flex-start',
          paddingVertical: 12,
          paddingHorizontal: 12,
          borderRadius: theme.radius.md,
          backgroundColor: theme.color.inputBg,
          borderWidth: 1,
          borderColor: theme.color.border,
        },
    webNoAdsText: {
      flex: 1,
      fontSize: theme.font.tiny,
      fontWeight: '600',
      color: isWeb ? 'rgba(248, 250, 252, 0.92)' : theme.color.textSecondary,
      lineHeight: 18,
    },
    hint: {
      marginTop: 8,
      fontSize: theme.font.tiny,
      color: theme.color.muted,
      fontWeight: '600',
      lineHeight: 16,
    },
  });
}
