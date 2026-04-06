import { Alert, Platform } from 'react-native';
import { getGoogleMobileAdsModule, isExpoGoEnvironment } from './mobileAds';
import { formatRewardedAdErrorForUser, loadAndShowRewardedAdOnce } from './rewardedTripCreditAdFlow';

export const POST_TRIP_CREATION_AD_PREFACE_TITLE = 'Rota oluşturuldu';

/** Reklam öncesi kullanıcıya gösterilen açıklama (rota hakkı artmaz). */
export const POST_TRIP_CREATION_AD_PREFACE_MESSAGE =
  'Planını kaydettik. Rota oluşumunu tamamlamak için sırada kısa bir reklam izlemen gerekiyor. ' +
  'Tamamen ücretsiz bir uygulamada sana daha iyi hizmet sunabilmemiz için bu desteğe ihtiyacımız var; ' +
  'anlayışın için teşekkür ederiz.\n\n' +
  'Devam ettiğinde reklam açılacak. Bu izlenim rota hakkını artırmaz.';

/**
 * Yeni rota kaydı sonrası: önce açıklama, sonra ödüllü reklam (Firestore’a +1 yazılmaz).
 * Web / Expo Go / modül yok: kısa bilgi, reklam atlanır.
 * Pro: tamamen atlanır (`skipAds: true`).
 */
export async function runPostTripCreationAdFlow(opts?: { skipAds?: boolean }): Promise<void> {
  if (opts?.skipAds) return;
  const mod = getGoogleMobileAdsModule();
  if (!mod) {
    if (Platform.OS === 'web') {
      Alert.alert(
        'Bilgi',
        'Web sürümünde reklam gösterilemez; rota yine de kayıtlı.\n\nMobil uygulamada bu adımda kısa bir reklam izlenir.'
      );
    } else if (isExpoGoEnvironment()) {
      Alert.alert(
        'Geliştirme (Expo Go)',
        'Google reklamları yalnızca development build veya mağaza sürümünde çalışır. Rota kayıtlı.'
      );
    } else {
      Alert.alert('Reklam', 'Reklam modülü yüklenemedi; rota yine de kayıtlı.');
    }
    return;
  }

  await new Promise<void>((resolve) => {
    Alert.alert(
      POST_TRIP_CREATION_AD_PREFACE_TITLE,
      POST_TRIP_CREATION_AD_PREFACE_MESSAGE,
      [{ text: 'Reklamı izle ve devam et', onPress: () => resolve() }],
      { cancelable: false }
    );
  });

  try {
    await loadAndShowRewardedAdOnce(mod);
  } catch (e: unknown) {
    Alert.alert(
      'Reklam gösterilemedi',
      `${formatRewardedAdErrorForUser(e)}\n\nRota kayıtlı; devam edebilirsin.`,
      [{ text: 'Tamam' }]
    );
  }
}
