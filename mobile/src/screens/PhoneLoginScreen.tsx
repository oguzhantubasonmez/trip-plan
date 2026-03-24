import { signInAnonymously } from 'firebase/auth';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { AppLogo } from '../components/AppLogo';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { auth } from '../lib/firebase';
import { ensureUserDoc } from '../services/userProfile';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';
import { normalizeE164 } from '../utils/phone';

export function PhoneLoginScreen() {
  const appTheme = useAppTheme();
  const styles = useMemo(() => createPhoneLoginStyles(appTheme), [appTheme]);
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
          <AppLogo size={72} />
          <Text style={styles.title}>RouteWise</Text>
          <Text style={styles.sub}>Gezi planlarını arkadaşlarınla paylaş. Hızlı giriş için numaranı gir.</Text>
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

          <View style={{ height: appTheme.space.md }} />
          <PrimaryButton title="✓ Devam et" onPress={signIn} loading={loading} />
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

function createPhoneLoginStyles(t: AppTheme) {
  return StyleSheet.create({
    header: { gap: 8, marginBottom: t.space.lg, alignItems: 'center' },
    title: {
      color: t.color.text,
      fontSize: t.font.hero,
      fontWeight: '900',
      letterSpacing: -0.5,
      textAlign: 'center',
      marginTop: t.space.xs,
    },
    sub: {
      color: t.color.muted,
      fontSize: t.font.body,
      lineHeight: 24,
      textAlign: 'center',
      paddingHorizontal: t.space.sm,
    },
    card: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.xl,
      padding: t.space.lg,
      borderWidth: 1,
      borderColor: t.color.cardBorderPrimary,
      ...t.shadowCard,
    },
    row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    cc: {
      backgroundColor: t.color.inputBg,
      borderWidth: 1,
      borderColor: t.color.border,
      paddingHorizontal: 12,
      paddingVertical: 14,
      borderRadius: t.radius.md,
    },
    ccText: { color: t.color.text, fontSize: t.font.body, fontWeight: '700' },
    footer: { marginTop: 'auto', paddingTop: t.space.lg },
    footerText: { color: t.color.muted, fontSize: t.font.small, lineHeight: 18 },
  });
}
