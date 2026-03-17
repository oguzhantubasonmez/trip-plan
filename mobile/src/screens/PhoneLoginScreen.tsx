import { signInAnonymously } from 'firebase/auth';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { auth } from '../lib/firebase';
import { ensureUserDoc } from '../services/userProfile';
import { theme } from '../theme';
import { normalizeE164 } from '../utils/phone';

export function PhoneLoginScreen() {
  const [countryCode] = useState('+90');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setError(undefined);
    const phoneE164 = normalizeE164(`${countryCode}${phone}`);
    if (!phoneE164) {
      setError('Geçerli bir telefon numarası gir.');
      return;
    }

    setLoading(true);
    try {
      const cred = await signInAnonymously(auth);
      await ensureUserDoc({ uid: cred.user.uid, phoneNumber: phoneE164 });
    } catch (e: any) {
      setError(e?.message || 'Giriş yapılamadı. Tekrar dene.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <Text style={styles.title}>RouteWise</Text>
          <Text style={styles.sub}>Telefon numaranla saniyeler içinde giriş yap.</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.cc}>
              <Text style={styles.ccText}>{countryCode}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <TextField
                label="Telefon numarası"
                value={phone}
                placeholder="5xx xxx xx xx"
                keyboardType="phone-pad"
                onChangeText={(v) => setPhone(v)}
                errorText={error}
                helperText="Numaranı arkadaş eşleştirmesi için kullanacağız."
                maxLength={15}
                autoFocus
              />
            </View>
          </View>

          <View style={{ height: theme.space.md }} />
          <PrimaryButton title="Devam et" onPress={signIn} loading={loading} />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Not: Bu akış SMS doğrulaması yapmaz. Telefon numarası yalnızca eşleştirme amaçlı kullanılır.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8, marginBottom: theme.space.lg },
  title: { color: theme.color.text, fontSize: theme.font.h1, fontWeight: '800', letterSpacing: 0.2 },
  sub: { color: theme.color.muted, fontSize: theme.font.body, lineHeight: 22 },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.space.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  cc: {
    backgroundColor: theme.color.inputBg,
    borderWidth: 1,
    borderColor: theme.color.border,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
  },
  ccText: { color: theme.color.text, fontSize: theme.font.body, fontWeight: '700' },
  footer: { marginTop: 'auto', paddingTop: theme.space.lg },
  footerText: { color: theme.color.muted, fontSize: theme.font.small, lineHeight: 18 },
});

