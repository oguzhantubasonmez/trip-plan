# Uygulama derleme rehberi (Expo / EAS)

Bu proje **Expo SDK 55** ile yazılmış bir **React Native** uygulamasıdır. Aşağıda **Expo** ve **EAS** ne işe yarar, **sürüm nerede**, **nasıl build alınır** özetlenir.

---

## Expo ne işe yarıyor?

| Kavram | Ne işe yarar? |
|--------|----------------|
| **Expo** | React Native geliştirmeyi kolaylaştıran araç seti: `expo start` ile Metro sunucusu, Expo Go ile telefonda deneme, native modüller için hazır paketler (`expo-clipboard`, `expo-constants` vb.). |
| **Bu projede** | `package.json` içindeki `expo`, `app.json` yapılandırması, `npx expo start` / `run:android` komutları Expo’ya aittir. |

**Expo Go** = Mağazadan indirilen “sandbox” uygulama; geliştirme için hızlıdır ama **mağazaya yüklediğin .apk/.ipa değildir**.

---

## EAS (Expo Application Services) ne işe yarıyor?

| Kavram | Ne işe yarıyor? |
|--------|----------------|
| **EAS Build** | Bulutta (veya yerelde) **gerçek Android .aab/.apk** ve **iOS .ipa** üretir; Play Store / App Store’a uygun paketler buradan çıkar. |
| **EAS Submit** | Üretilen paketi mağazaya göndermeye yardımcı olur. |
| **Bu projede** | `app.json` → `extra.eas.projectId` tanımlı; **`eas.json`** içinde `image` sadece **`build.<profil>.android.image`** ve **`build.<profil>.ios.image`** altında (profil kökünde `image` kullanılmaz). |

**Özet:** Günlük kod yazarken **Expo CLI**; mağazaya gidecek **install edilebilir uygulama** için çoğu ekip **EAS Build** kullanır.

---

## Uygulama sürümünü nerede görürsün?

1. **Kaynak (mağaza sürümü metni)**  
   - `app.json` → `expo.version` → şu an **`1.0.0`**  
   - Mağaza açıklamasında gösterilen “sürüm” genelde buradan gelir.

2. **Telefonda (uygulama içi)**  
   - **Profil** ekranının altında: `Uygulama 1.0.0 · Expo SDK …` (`expo-constants` ile `app.json` okunur).

3. **Android dahili sürüm (build numarası)**  
   - Play Console her yüklemede artan sayı ister. İstersen `app.json` içine eklersin:  
     `"android": { "versionCode": 1 }`  
   - iOS için benzeri: `"ios": { "buildNumber": "1" }`

`app.json` içindeki `version` veya `buildNumber` / `versionCode` değiştirdiğinde Profil’deki metin de güncellenir (yeniden yükleme / build sonrası).

---

## Adım adım: Yerelde Android build (.apk debug)

**Gereksinim:** [Android Studio](https://developer.android.com/studio) (SDK, en az bir emülatör veya USB ile telefon + USB debugging).

1. Proje klasörü:
   ```bash
   cd mobile
   ```
2. Bağımlılıklar:
   ```bash
   npm install
   ```
3. Native proje üret (ilk sefer veya native değişiklikten sonra):
   ```bash
   npx expo prebuild --platform android
   ```
4. USB ile telefon bağlı veya emülatör açıkken:
   ```bash
   npx expo run:android
   ```
5. Çıktı: cihazda **debug** uygulama yüklenir. Release `.apk` için Android Studio’dan “Generate Signed Bundle / APK” veya aşağıdaki EAS yolunu kullan.

---

## Adım adım: EAS ile bulutta build (önerilen, mağazaya yakın)

1. [Expo hesabı](https://expo.dev) aç / giriş yap.
2. Global EAS CLI (bir kez):
   ```bash
   npm install -g eas-cli
   eas login
   ```
3. `mobile` klasöründe:
   ```bash
   cd mobile
   eas build:configure
   ```
   Bu genelde **`eas.json`** oluşturur (profiller: development, preview, production).
4. Android APK veya AAB (örnek preview):
   ```bash
   eas build -p android --profile preview
   ```
5. Komut bitince terminalde **indirme linki** çıkar; `.apk`’yı telefona atıp kurabilirsin.

> İlk kez: Google Play imzalama anahtarları için EAS soruları çıkabilir; ekrandaki yönergeleri izle.

---

## iOS (.ipa / .app)

- **`.app`**: Genelde **simülatör** çıktısı veya Xcode derlemesinin ürünü; kullanıcı telefonuna doğrudan “.app” atılmaz, **.ipa** veya TestFlight kullanılır.
- **Fiziksel iPhone:** macOS + Xcode + Apple Developer hesabı gerekir.
- **EAS:** `eas build -p ios --profile preview` (Apple hesabı ve sertifikalar EAS tarafından yönetilebilir).

---

## Hızlı komut özeti

| Amaç | Komut |
|------|--------|
| Geliştirme sunucusu | `npx expo start` |
| Web | `npx expo start --web` |
| Yerel Android derleme | `npx expo prebuild -p android` → `npx expo run:android` |
| Bulut Android paketi | `eas build -p android` |

---

## İlgili dosyalar

- `app.json` — uygulama adı, `version`, Android `package`, ikon, EAS `projectId`
- `package.json` — npm sürümü (çoğu zaman `app.json` ile aynı tutulur)
- `eas.json` — `eas build:configure` sonrası (şu an yoksa ilk build’de oluşur)

Daha fazla: [Expo — Create a production build](https://docs.expo.dev/deploy/build-project/), [EAS Build](https://docs.expo.dev/build/introduction/).

### EAS: `expo-firebase-core` — `unknown property 'classifier'` (Gradle 9)

`expo-firebase-recaptcha` → `expo-firebase-core` bazı Gradle sürümleriyle çakışabiliyordu. Bu projede **telefon girişi anonim Firebase auth** ile yapıldığı için `expo-firebase-recaptcha` kaldırıldı; tekrar **SMS + reCAPTCHA** eklersen güncel paket / patch gerekir.

### EAS: `Invalid image for Linux: ubuntu-…-ndk-26b`

İmaj adında **typo** olabilir: geçerli isim `ndk-r26b` şeklinde (**r** harfi şart). Yanlış: `ndk-26b`. En kolayı: `eas.json` içinde **`"image": "sdk-55"`** kullan (Expo SDK 55 ile uyumlu; listede `sdk-55` veya `ubuntu-24.04-jdk-17-ndk-r27b-sdk-55` geçerli).
