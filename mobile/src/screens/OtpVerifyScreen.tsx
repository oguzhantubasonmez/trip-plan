import { PhoneAuthProvider, signInWithCredential } from 'firebase/auth';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { auth } from '../lib/firebase';
import { ensureUserDoc } from '../services/userProfile';
import { theme } from '../theme';
import { maskPhone } from '../utils/phone';

export function OtpVerifyScreen(props: {
  phoneE164: string;
  verificationId: string;
  onVerified: () => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const phoneMasked = useMemo(() => maskPhone(props.phoneE164), [props.phoneE164]);

  async function verify() {
    setError(undefined);
    if (code.trim().length < 6) {
      setError('6 haneli kodu gir.');
      return;
    }

    setLoading(true);
    try {
      const cred = PhoneAuthProvider.credential(props.verificationId, code.trim());
      const userCred = await signInWithCredential(auth, cred);
      const uid = userCred.user.uid;
      const phoneNumber = userCred.user.phoneNumber || props.phoneE164;
      await ensureUserDoc({ uid, phoneNumber });
      props.onVerified();
    } catch (e: any) {
      setError(e?.message || 'Kod doğrulanamadı. Tekrar dene.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <Text style={styles.title}>Kodu doğrula</Text>
          <Text style={styles.sub}>{phoneMasked} numarasına gelen 6 haneli kodu gir.</Text>
        </View>

        <View style={styles.card}>
          <TextField
            label="Doğrulama kodu"
            value={code}
            placeholder="------"
            keyboardType="number-pad"
            onChangeText={(v) => setCode(v.replace(/[^\d]/g, '').slice(0, 6))}
            errorText={error}
            autoFocus
            maxLength={6}
          />

          <View style={{ height: theme.space.md }} />
          <PrimaryButton title="Devam et" onPress={verify} loading={loading} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8, marginBottom: theme.space.lg },
  title: { color: theme.color.text, fontSize: theme.font.h2, fontWeight: '800' },
  sub: { color: theme.color.muted, fontSize: theme.font.body, lineHeight: 22 },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.space.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
});

