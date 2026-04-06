import { Alert } from 'react-native';

export const POST_TRIP_CREATION_AD_PREFACE_TITLE = 'Rota oluşturuldu';

/** Reklam öncesi kullanıcıya gösterilen açıklama (rota hakkı artmaz). */
export const POST_TRIP_CREATION_AD_PREFACE_MESSAGE =
  'Planını kaydettik. Rota oluşumunu tamamlamak için sırada kısa bir reklam izlemen gerekiyor. ' +
  'Tamamen ücretsiz bir uygulamada sana daha iyi hizmet sunabilmemiz için bu desteğe ihtiyacımız var; ' +
  'anlayışın için teşekkür ederiz.\n\n' +
  'Devam ettiğinde reklam açılacak. Bu izlenim rota hakkını artırmaz.';

type PrefaceListener = (resolve: () => void) => void;

let prefaceListener: PrefaceListener | null = null;

/** Kök ekranda `PostTripCreationAdPrefaceModal` bağlamak için (App.tsx). */
export function setPostTripCreationAdPrefaceListener(fn: PrefaceListener | null): void {
  prefaceListener = fn;
}

/**
 * Temalı modal açılır; dinleyici yoksa sistem Alert (Expo Go / test).
 */
export function waitPostTripAdPrefaceContinue(): Promise<void> {
  return new Promise((resolve) => {
    if (prefaceListener) {
      prefaceListener(resolve);
      return;
    }
    Alert.alert(
      POST_TRIP_CREATION_AD_PREFACE_TITLE,
      POST_TRIP_CREATION_AD_PREFACE_MESSAGE,
      [{ text: 'Reklamı izle ve devam et', onPress: () => resolve() }],
      { cancelable: false }
    );
  });
}
