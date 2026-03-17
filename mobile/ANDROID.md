# Android'de Uygulamayı Açma

## EAS Build Gradle hatası aldıysan

Build "Run gradlew" aşamasında fail ediyorsa projede şunlar yapıldı:

- **react-native-maps** için Expo config plugin eklendi (`app.config.js`).
- EAS Build için **Android image** sabitlendi: `ubuntu-22.04-jdk-17-ndk-26b` (`eas.json`).

**EAS’te Google Maps API anahtarı:** Harita Android’de çalışsın diye build ortamında anahtarı ver:

1. [expo.dev](https://expo.dev) → Projen → **Settings** → **Environment variables**
2. **Build** için değişken ekle: `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` = Google Cloud’daki Maps API anahtarın

Veya yerelde `.env` kullanıyorsan EAS’e taşımak için:

```bash
eas secret:create --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY --value "AIza..."
```

Sonra tekrar dene:

```bash
eas build --platform android --profile preview
```

Build log’unda hâlâ hata varsa, **Run gradlew** aşamasının tam log çıktısına bak (kırmızı satırlar). “Duplicate class”, “SDK version” veya “minSdkVersion” gibi ifadeler varsa bunları not edip paylaşırsan bir sonraki düzeltmeyi yapabiliriz.

---

# Android'de Uygulamayı Açma

## Yöntem 1: Expo Go ile (en hızlı)

Telefonda uygulama gibi açmak için önce **Expo Go** ile çalıştırabilirsin. Gerçek bir “yüklü uygulama” değil, Expo Go içinde projen çalışır ama deneme ve geliştirme için yeterlidir.

### Adımlar

1. **Telefona Expo Go yükle**
   - Play Store’dan **“Expo Go”** uygulamasını indir ve kur.
   - Mümkünse uygulamayı güncel tut (Expo SDK 55 ile uyum için).

2. **Bilgisayarda projeyi başlat**
   - Proje klasöründe terminal:
   ```bash
   cd mobile
   npx expo start
   ```
   - **Sadece web için** çalıştırıyorsan `--web` kullanma; Android için `npx expo start` yeterli.

3. **Telefonu bağla**
   - **Aynı Wi‑Fi:** Telefon ve bilgisayar **aynı kablosuz ağda** olmalı.
   - Terminalde çıkan **QR kodu** telefonda Expo Go ile tara.
   - Veya bilgisayarda terminalde **`a`** tuşuna bas; Android cihaz/emülatör seçilir.

4. **Açılmıyorsa: Tunnel kullan**
   - Telefon ve bilgisayar farklı ağdaysa (farklı Wi‑Fi veya telefon mobil veri):
   ```bash
   npx expo start --tunnel
   ```
   veya:
   ```bash
   npm run android:tunnel
   ```
   - Yine terminalde çıkan QR kodu Expo Go ile tara.

### Sık sorunlar

- **“Unable to connect” / Bağlanamıyor:** Aynı Wi‑Fi’de değilseniz `--tunnel` kullanın.
- **“Expo Go incompatible”:** Play Store’dan Expo Go’yu güncelleyin; gerekirse [Expo Go indirme sayfası](https://expo.dev/go) üzerinden güncel sürümü kontrol edin.
- **QR kod görünmüyor:** Terminalde `?` veya `m` ile menüyü açıp “Show QR code” seçin.

---

## Yöntem 2: Gerçek APK (telefonda tek başına uygulama)

Telefonda **Expo Go olmadan**, doğrudan yüklenen bir uygulama (APK) istiyorsan development build veya EAS Build kullanman gerekir.

### Seçenek A: EAS Build (Expo’nun bulut build’i)

1. **EAS CLI ve hesap**
   ```bash
   npm install -g eas-cli
   eas login
   ```

2. **Projede EAS’i ayarla**
   ```bash
   cd mobile
   eas build:configure
   ```

3. **Android APK oluştur**
   ```bash
   eas build --platform android --profile preview
   ```
   - Build bittikten sonra linkten **APK** indirip telefona atıp kurabilirsin.

### Seçenek B: Bilgisayarda yerel build (prebuild + Gradle)

1. **Native Android projesini oluştur**
   ```bash
   cd mobile
   npx expo prebuild --platform android
   ```

2. **APK’yı derle** (Android SDK ve Java kurulu olmalı)
   ```bash
   cd android
   ./gradlew assembleDebug
   ```
   - Windows’ta: `gradlew.bat assembleDebug`
   - APK çıktısı: `android/app/build/outputs/apk/debug/app-debug.apk`

3. Bu APK’yı telefona USB veya Google Drive vb. ile atıp yükle.

---

## Özet

| Amaç                         | Ne yapmalı                          |
|-----------------------------|-------------------------------------|
| Hızlıca telefonda denemek   | Expo Go + `npx expo start` (+ gerekirse `--tunnel`) |
| Aynı ağ yok                 | `npx expo start --tunnel`           |
| Tek başına yüklü uygulama   | EAS Build veya `expo prebuild` + Gradle ile APK |

İlk kez açmak için genelde **Expo Go + aynı Wi‑Fi** veya **Expo Go + `--tunnel`** yeterlidir.
