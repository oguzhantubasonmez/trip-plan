# RouteWise (rota)

Expo uygulaması **`mobile/`** klasöründedir.

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
