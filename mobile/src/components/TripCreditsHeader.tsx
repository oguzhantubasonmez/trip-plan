import { Ionicons } from '@expo/vector-icons';
import { doc, onSnapshot } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, db } from '../lib/firebase';
import { getGoogleMobileAdsModule, isExpoGoEnvironment } from '../lib/mobileAds';
import {
  addTripCreationCreditFromReward,
  DEFAULT_TRIP_CREATION_CREDITS,
  resolvedTripCreationCreditsFromDoc,
} from '../services/tripCreationCredits';
import { getRewardedAdUnitId } from '../constants/admobConfig';
import { useAppTheme } from '../ThemeContext';

/**
 * Ana sekmeler üstünde: kalan rota hakkı + ödüllü reklam ile hak kazanma.
 */
export function TripCreditsHeader() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme, insets.top), [theme, insets.top]);
  const uid = auth.currentUser?.uid;
  const [credits, setCredits] = useState<number | null>(null);
  const [rewardBusy, setRewardBusy] = useState(false);

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
    const mod = getGoogleMobileAdsModule();
    if (!mod) {
      if (Platform.OS === 'web') {
        if (typeof globalThis !== 'undefined' && typeof (globalThis as { alert?: (m: string) => void }).alert === 'function') {
          (globalThis as { alert: (m: string) => void }).alert(
            'Web sürümünde Google ödüllü reklam çalışmaz.\n\n+1 rota hakkı için Android veya iOS uygulamasını kullan (EAS / Play Store APK).'
          );
        } else {
          Alert.alert(
            'Bilgi',
            'Web’de reklam yok. Hak kazanmak için Android veya iOS uygulamasında dene.'
          );
        }
        return;
      }
      if (isExpoGoEnvironment()) {
        Alert.alert(
          'Geliştirme (Expo Go)',
          'Google reklamları yalnızca development build veya mağaza derlemesinde çalışır. `npx expo run:android` veya EAS Build kullanın.'
        );
        return;
      }
      Alert.alert('Reklam', 'Reklam modülü yüklenemedi. Uygulamayı yeniden derleyin.');
      return;
    }

    const { RewardedAd, RewardedAdEventType, AdEventType, TestIds } = mod;
    const unitId = getRewardedAdUnitId(TestIds);
    setRewardBusy(true);

    const rewarded = RewardedAd.createForAdRequest(unitId, {
      requestNonPersonalizedAdsOnly: true,
    });

    let earned = false;
    const unsubs: Array<() => void> = [];

    try {
      await new Promise<void>((resolve, reject) => {
        unsubs.push(
          rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
            earned = true;
          })
        );
        unsubs.push(
          rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
            try {
              rewarded.show();
            } catch (err) {
              reject(err);
            }
          })
        );
        unsubs.push(
          rewarded.addAdEventListener(AdEventType.ERROR, (err: unknown) => {
            reject(err ?? new Error('Reklam hatası'));
          })
        );
        unsubs.push(
          rewarded.addAdEventListener(AdEventType.CLOSED, () => {
            resolve();
          })
        );
        try {
          rewarded.load();
        } catch (err) {
          reject(err);
        }
      });

      if (earned) {
        await addTripCreationCreditFromReward(uid);
        Alert.alert('Teşekkürler', '1 rota oluşturma hakkı eklendi.');
      }
    } catch (e: any) {
      const msg = e?.message || e?.code || 'Reklam gösterilemedi.';
      Alert.alert('Reklam', String(msg));
    } finally {
      for (const u of unsubs) {
        try {
          u();
        } catch {
          /* */
        }
      }
      setRewardBusy(false);
    }
  }, [uid]);

  if (!uid || credits == null) return null;

  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <View style={styles.row}>
        <Ionicons name="ticket-outline" size={18} color={theme.color.primaryDark} style={styles.icon} />
        <Text style={styles.label}>Rota hakkı</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{credits}</Text>
        </View>
      </View>
      {Platform.OS === 'web' ? (
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
      {Platform.OS !== 'web' && isExpoGoEnvironment() ? (
        <Text style={styles.hint}>Expo Go’da reklam kapalı — geliştirme build gerekir.</Text>
      ) : null}
    </View>
  );
}

function createStyles(theme: import('../theme').AppTheme, topInset: number) {
  return StyleSheet.create({
    wrap: {
      paddingTop: Math.max(topInset > 0 ? 4 : 8, 4),
      paddingBottom: 10,
      paddingHorizontal: theme.space.md,
      backgroundColor: theme.color.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.color.border,
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
    badge: {
      minWidth: 32,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.primarySoft,
      borderWidth: 1,
      borderColor: theme.color.cardBorderPrimary,
      alignItems: 'center',
    },
    badgeText: {
      fontSize: theme.font.body,
      fontWeight: '900',
      color: theme.color.primaryDark,
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
    webNoAdsBox: {
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
      color: theme.color.textSecondary,
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
