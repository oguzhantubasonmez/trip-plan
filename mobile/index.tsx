import { registerRootComponent } from 'expo';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';

const EAS_FIREBASE_HELP = `
1) Tarayıcıda expo.dev → hesabın → bu proje (mobile) → Environment variables.

2) Şu 6 değişkeni ekle (isimler birebir aynı olsun, değerler Firebase Console → Proje ayarları):
   EXPO_PUBLIC_FIREBASE_API_KEY
   EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN
   EXPO_PUBLIC_FIREBASE_PROJECT_ID
   EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET
   EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
   EXPO_PUBLIC_FIREBASE_APP_ID

3) Her değişkeni "preview" (ve production kullanıyorsan "production") ortamına ata; Visibility: EAS Build sırasında bundle'a girmesi için uygun seçenek (Plain text / Sensitive — Expo'nun önerdiği).

4) Terminalde yeniden derle:
   npx eas-cli build --platform android --profile preview

Alternatif (CLI): mobile klasöründe
  eas secret:create --name EXPO_PUBLIC_FIREBASE_API_KEY --value "..." --type string
komutunu her anahtar için tekrarla; ardından yine build al.
`.trim();

function BootstrapError({ message }: { message: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#0B1220' }}>
      <ScrollView
        contentContainerStyle={{ padding: 24, paddingTop: 48, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ color: '#F8FAFC', fontSize: 22, fontWeight: '800', marginBottom: 12 }}>
          RouteWise
        </Text>
        <Text style={{ color: '#f87171', lineHeight: 22, marginBottom: 16, fontWeight: '700' }}>
          Firebase yapılandırması APK içinde yok
        </Text>
        <Text style={{ color: '#94a3b8', lineHeight: 22, marginBottom: 20 }}>{message}</Text>
        <Text style={{ color: '#CBD5E1', lineHeight: 22, fontSize: 14 }}>{EAS_FIREBASE_HELP}</Text>
      </ScrollView>
    </View>
  );
}

let Root: React.ComponentType;
try {
  require('./src/lib/firebase');
  Root = require('./App').default;
} catch (e: unknown) {
  const message =
    e instanceof Error ? e.message : typeof e === 'string' ? e : 'Uygulama başlatılamadı.';
  Root = () => <BootstrapError message={message} />;
}

registerRootComponent(Root);
