import { Alert, Platform } from 'react-native';
import { getRewardedAdUnitId } from '../constants/admobConfig';
import { addTripCreationCreditFromReward } from '../services/tripCreationCredits';
import { getGoogleMobileAdsModule, isExpoGoEnvironment } from './mobileAds';
import type { GoogleMobileAdsModule } from './mobileAdsShared';

export function formatRewardedAdErrorForUser(raw: unknown): string {
  const s = String((raw as { message?: string })?.message ?? raw ?? '');
  if (/SSL handshake|Connection reset|internal-error|ECONNRESET|CERT_/i.test(s)) {
    return (
      'Reklam sunucusuna güvenli bağlantı kurulamadı (SSL / ağ kesintisi). ' +
      'VPN, özel DNS veya reklam engelleyici Google sunucularını engelliyor olabilir.'
    );
  }
  return s.length > 280 ? `${s.slice(0, 277)}…` : s;
}

export function rewardedAdTechnicalHint(raw: unknown): string {
  if (raw != null && typeof raw === 'object') {
    const o = raw as { message?: string; code?: string };
    const code = typeof o.code === 'string' ? o.code.trim() : '';
    const msg = typeof o.message === 'string' ? o.message.trim() : '';
    if (code && msg) return `${code}: ${msg}`;
    if (msg) return msg;
    if (code) return code;
  }
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return 'Bilinmeyen hata';
}

export type RunRewardedTripCreditAdOutcome =
  | { kind: 'earned' }
  | { kind: 'closed_no_reward' }
  /** Web / Expo Go / modül yok: Alert zaten gösterildi */
  | { kind: 'noop' }
  | { kind: 'error_native'; technicalHint: string };

/**
 * Ortak ödüllü reklam: yükle → göster → kapanınca `earned`.
 * - `runRewardedTripCreditAdFlow`: ödül + Firestore +1 hak
 * - `runPostTripCreationAdFlow`: yalnızca gösterim (ilave; hak yazılmaz)
 */
export async function loadAndShowRewardedAdOnce(mod: GoogleMobileAdsModule): Promise<boolean> {
  const { RewardedAd, RewardedAdEventType, AdEventType, TestIds } = mod;
  const unitId = getRewardedAdUnitId(TestIds);
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
    return earned;
  } finally {
    for (const u of unsubs) {
      try {
        u();
      } catch {
        /* */
      }
    }
  }
}

/**
 * Ödüllü reklam + Firestore +1 hak. UI modalları çağıran bileşende.
 * Web / Expo Go: Alert ile bilgi (native modal yok).
 */
export async function runRewardedTripCreditAdFlow(uid: string): Promise<RunRewardedTripCreditAdOutcome> {
  const mod = getGoogleMobileAdsModule();
  if (!mod) {
    if (Platform.OS === 'web') {
      if (typeof globalThis !== 'undefined' && typeof (globalThis as { alert?: (m: string) => void }).alert === 'function') {
        (globalThis as { alert: (m: string) => void }).alert(
          'Web sürümünde Google ödüllü reklam çalışmaz.\n\n+1 rota hakkı için Android veya iOS uygulamasını kullan (EAS / Play Store APK).'
        );
      } else {
        Alert.alert('Bilgi', 'Web’de reklam yok. Hak kazanmak için Android veya iOS uygulamasında dene.');
      }
      return { kind: 'noop' };
    }
    if (isExpoGoEnvironment()) {
      Alert.alert(
        'Geliştirme (Expo Go)',
        'Google reklamları yalnızca development build veya mağaza derlemesinde çalışır. `npx expo run:android` veya EAS Build kullanın.'
      );
      return { kind: 'noop' };
    }
    Alert.alert('Reklam', 'Reklam modülü yüklenemedi. Uygulamayı yeniden derleyin.');
    return { kind: 'noop' };
  }

  try {
    const earned = await loadAndShowRewardedAdOnce(mod);

    if (earned) {
      await addTripCreationCreditFromReward(uid);
      if (Platform.OS === 'web') {
        Alert.alert('Teşekkürler', '1 rota oluşturma hakkı eklendi.');
      }
      return { kind: 'earned' };
    }
    return { kind: 'closed_no_reward' };
  } catch (e: unknown) {
    if (Platform.OS === 'web') {
      const msg = formatRewardedAdErrorForUser(e);
      Alert.alert('Reklam', msg || 'Reklam gösterilemedi.');
      return { kind: 'noop' };
    }
    return { kind: 'error_native', technicalHint: rewardedAdTechnicalHint(e) };
  }
}
