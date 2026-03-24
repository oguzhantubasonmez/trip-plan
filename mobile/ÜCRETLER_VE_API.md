# Ücretler ve harici servisler

Bu uygulama **Expo / React Native** ile **Android** ve **web** üzerinde çalışır. Aşağıdaki servislerin çoğu **ücretsiz kotayla** başlar; bazıları için Google Cloud’da **faturalandırma hesabı** açman gerekir (otomatik ücret alınmaz, kota içinde kalırsan genelde 0 TL).

## Tamamen ücretsiz (kota içi)

| Servis | Not |
|--------|-----|
| **Firebase Authentication** | Anonim giriş vb. |
| **Firebase Firestore** | Okuma/yazma kotası; geliştirme için genelde yeterli |
| **Expo / EAS** | Expo hesabı ücretsiz; **EAS Build** için build dakikaları sınırlı olabilir (ücretli plan isteğe bağlı) |

## Google Cloud (API anahtarı: `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`)

| API | Kullanım | Ücret |
|-----|----------|--------|
| **Places API** (klasik REST) | **Android/iOS:** yer arama `autocomplete` + `details` JSON. | Ücretsiz dilim / kullanıma göre |
| **Places API (New)** + **Maps JavaScript API** | **Web** yer araması. | Aynı |
| **Directions API** | Duraklar arası mesafe/süre; yoksa uygulama Haversine kullanır. | Aynı |
| **Maps SDK for Android** | Harita ekranı (native). | Console kısıtları |

### “This API key is not authorized to use this service or API” (mobil)

Bu, anahtarın **API kısıtlaması** veya **uygulama kısıtlaması** yüzünden Places çağrısının reddedildiği anlamına gelir.

1. **API’ler etkin mi**  
   [API Kitaplığı](https://console.cloud.google.com/apis/library) → projende şunlar **Etkin** olsun:  
   - **Places API** (Android/iOS’taki yer araması bunu kullanır)  
   - **Places API (New)** (web ve bazı yeni ürünler)  
   - **Maps JavaScript API** (sadece web)  
   - İstersen: **Directions API**, **Geocoding API**, **Maps SDK for Android**

2. **Anahtar → API kısıtlamaları**  
   Kimlik bilgileri → API anahtarı → **API kısıtlamaları** = “Anahtarı kısıtla” ise listede mutlaka **Places API** (ve kullandığın diğer Maps API’ler) işaretli olsun. Hızlı test için geçici olarak **Kısıtlama yok** seçip deneyebilirsin (üretimde daralt).

3. **Android uygulama kısıtı**  
   Anahtarda **Android uygulamaları** seçiliyse **paket adı + SHA-1** eşleşmeli:  
   - **EAS / kendi APK’n:** `app.json` içindeki paket → örn. **`com.routewise.tripplan`** + o build’in **debug/release SHA-1** fingerprint’i.  
   - **Expo Go ile test:** Paket **`host.exp.exponent`** ve Expo’nun debug sertifikası SHA-1’i gerekir — bu yüzden geliştirmede çoğu kişi **ayrı bir “sınırsız” veya web+Android ayrı anahtar** kullanır.  
   SHA-1: `cd android && ./gradlew signingReport` veya `keytool -list -v -keystore ~/.android/debug.keystore` (varsayılan debug).

4. **Web** için ayrıca anahtarda **HTTP referrer** (`http://localhost:8081/*` vb.) tanımlı olmalı.

| Ortam | Tipik kısıt |
|--------|----------------|
| Web | HTTP referrer + Maps JS + Places (New) |
| Android APK (kendi paketin) | Android app: `com.routewise.tripplan` + SHA-1 + Places API |
| Expo Go | Ya kısıtsız test anahtarı ya da `host.exp.exponent` + ilgili SHA-1 |

**Özet:** Faturalandırma hesabı bağlaman gerekir; **ücretsiz dilim** ve sonrası ücret Google’ın güncel fiyat listesine göre hesaplanır. Detay: [Maps Platform pricing](https://mapsplatform.google.com/pricing/), [fiyatlandırma SSS (Mart 2025 güncellemesi)](https://developers.google.com/maps/billing-and-pricing/faq).

### Kota / ücretsiz kullanım ne kadar? (Google Maps Platform, Mart 2025 sonrası)

Google, **1 Mart 2025** itibarıyla eski **aylık 200 USD kredi** modelini, **SKU başına aylık ücretsiz kullanım** ile değiştirdi. Özet (çoğu **Core Services** SKU için; istisnalar fiyat sayfasında):

| Kategori | Aylık ücretsiz “billable event” (çoğu SKU için) |
|----------|---------------------------------------------------|
| **Essentials** | 10.000 |
| **Pro** | 5.000 |
| **Enterprise** | 1.000 |

Örnek istisna: bazı **Map Tiles** SKU’ları için ayda **100.000** ücretsiz çağrı.

**Önemli:** Autocomplete önerisi ile yer detayı **farklı SKU**’lar olabilir; her birinin kendi ücretsiz kotası ve birim fiyatı vardır. Tam isimler ve rakamlar için: [Pricing sheet / SKU listesi](https://developers.google.com/maps/billing-and-pricing/pricing) ve faturanda **SKU bazlı** kullanım raporu.

### “Event” ne demek? 10.000 = 10.000 arama mı?

- **Billable event (faturalanan olay):** Google’ın o **SKU** için faturada **1 birim** olarak saydığı işlem. Tam tanım **SKU’ya göre** değişir; fiyat listesinde “ne 1 birim sayılır” yazar.
- **“10.000 ücretsiz”** demek: O SKU için ayda **10.000 birim** bedava — bu, “uygulamada 10.000 kez arama yaptım” ile **bire bir aynı** olmayabilir, çünkü:
  - **Öneri listesi** (autocomplete / suggestion isteği) ile **yer detayı** (seçimden sonra konum/adres) genelde **farklı SKU**’lardır → ikisi **ayrı** 10.000’lik (veya Pro ise 5.000’lik) havuzlardan düşebilir.
  - Bazı ürünlerde **oturum (session)** veya özel sayım kuralları olabilir; kesin sayım için yine **Console’daki kullanım raporu** doğru kaynaktır.

**Bu projede (Rota) kabaca:**

| Kullanıcı aksiyonu | Tipik olarak |
|--------------------|----------------|
| Yazıyor; ~400 ms sonra öneri isteği gider (`searchPlaces`) | Autocomplete/suggestion tarafında **genelde bir API çağrısı** = o SKU için **birim tüketimi** (çoğu senaryoda 1 istek ≈ 1 event gibi düşün) |
| Listeden yer seçer; konum çekilir (`getPlaceDetails`) | **Ayrı** bir çağrı = genelde **farklı SKU**, ayrı kota |

Yani **her tuşta değil** (debounce sayesinde), ama **her başarılı öneri isteği** kotaya yaklaşır; **her seçim + detay** de ayrıca sayılır. “10.000 arama ücretsiz” yerine doğru ifade: **“Bu SKU için ayda 10.000 ücretsiz faturalanan birim; autocomplete ve detay ayrı SKU olabilir.”**

### Kota aşınca ne olur? Uygulama bildirim gönderir mi?

- **Aylık ücretsiz dilimi aşmak:** Genelde API **sessizce kesilmez**; kullanım **ücretlendirilir** (fiyat tablosuna göre). Yani “kota doldu, uyarı” diye bu uygulama içinden otomatik bildirim **yok** — bu Google Cloud / faturalandırma tarafında takip edilir.
- **Teknik kota (rate limit / günlük istek limiti):** API’lerin ve projelerin **Google Cloud Console → APIs & Services → Quotas** altında ayrı limitleri olabilir; bunlar aşılırsa istek **hata** döner (`RESOURCE_EXHAUSTED`, `OVER_QUERY_LIMIT` vb.).
- **Bilgilendirme istiyorsan:** [Google Cloud Billing → Budgets & alerts](https://console.cloud.google.com/billing) üzerinden **bütçe ve e-posta uyarıları** kur (ör. %50 / %90 / %100). İsteğe bağlı **usage cap** ile harcamayı sınırlama seçenekleri de vardır; detay: [Consumption optimization (budget alerts)](https://developers.google.com/maps/optimization-guide#consumption_optimization).

Yeni müşteriler için Google’ın **deneme kredisi** (ör. **300 USD**) kampanyaya göre değişebilir; güncel metin: [mapsplatform.google.com/pricing](https://mapsplatform.google.com/pricing/).

### "Places API (New) has not been used… / it is disabled" hatası

Web’de yer araması **Places API (New)** (`places.googleapis.com`) üzerinden çalışır. Bu API, eski “Places API” ile **aynı değildir**; Console’da ayrıca açman gerekir.

1. Hata mesajındaki linke tıkla (örnek):  
   `https://console.developers.google.com/apis/api/places.googleapis.com/overview?project=538879711160`  
   veya [API Kitaplığı — Places API](https://console.cloud.google.com/apis/library/places.googleapis.com) → doğru **projeyi** seç.
2. **Etkinleştir** (Enable).
3. Aynı projede şunlar da açık olsun: **Maps JavaScript API**; Android kullanıyorsan ilgili **Maps SDK**.
4. **Faturalandırma** hesabı projeye bağlı olmalı (çoğu Maps API için zorunlu; kota içinde ücret çıkmayabilir).
5. Az önce açtıysan **2–5 dakika** bekleip sayfayı yenile.

API anahtarının bu **aynı projeden** üretildiğinden emin ol (`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`). Web için anahtar kısıtında **HTTP referrer** (örn. `http://localhost:8081/*`) ekle.

## Üyelik gerektiren bir şey var mı?

- **Uygulama içi “premium üyelik” yok** — bu repoda abonelik satışı yok.
- **Expo:** Hesap ücretsiz; çok build alırsan EAS ücretli plan düşünebilirsin.
- **Firebase / Google:** Kendi projenin kotası; Firebase Blaze planı yüksek kullanımda ücret doğurabilir.

## Öneri

- Geliştirmede Directions’ı az kullanmak için uygulama zaten hata olunca **Haversine** kullanabiliyor.
- **Ücret / kota uyarısı** için: Cloud Console’da **Billing → Budgets** ile e-posta uyarısı aç; kullanımı **Maps Platform raporları**ndan SKU bazlı izle.
- Tahmini fatura için: [Fiyat hesaplayıcı](https://mapsplatform.google.com/pricing-calculator/) (İngilizce).
