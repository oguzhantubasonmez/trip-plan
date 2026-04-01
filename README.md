# RouteWise (rota)

Expo uygulaması **`mobile/`** klasöründedir.

Gezi planlama, rota sunumu, **Yer keşfet** (arama ile tam ekran özet/yorum), **Keşfet** sekmesinde puan/sıralama/anket ve **kaydettiğin yerler** (önbellekli özet kartlar; uzun basarak silme), hava özeti ve arkadaş/grup özellikleri içerir. Sürüm notları uygulama içinde `mobile/src/constants/releaseNotes.ts` ve `expo.version` ile eşlenir.

## Komutlar

**Kökten (`rota/`):**

```bash
npm start          # expo start
npm run web        # web
npm run android    # Android
```

**Doğrudan uygulama klasöründe:**

```bash
cd mobile
npx expo start
eas build --platform android --profile preview
```

`npx expo` veya `eas` komutlarını **`rota`** içinde ( `mobile` olmadan) çalıştırırsan yapılandırma bulunamaz; her zaman `cd mobile` kullan veya yukarıdaki `npm run` script’lerini kullan.
