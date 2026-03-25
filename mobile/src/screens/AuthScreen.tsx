import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppLogo } from '../components/AppLogo';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { auth } from '../lib/firebase';
import { ensureUserDoc, ensureUserDocAfterSignIn } from '../services/userProfile';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';
import { normalizeE164 } from '../utils/phone';

function mapAuthError(e: unknown): string {
  const code = (e as { code?: string })?.code;
  switch (code) {
    case 'auth/email-already-in-use':
      return 'Bu e-posta ile zaten hesap var. Giriş yapmayı dene.';
    case 'auth/invalid-email':
      return 'Geçerli bir e-posta adresi gir.';
    case 'auth/weak-password':
      return 'Şifre en az 6 karakter olmalı.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'E-posta veya şifre hatalı.';
    case 'auth/too-many-requests':
      return 'Çok fazla deneme. Bir süre sonra tekrar dene.';
    default:
      return (e as Error)?.message || 'İşlem başarısız. Tekrar dene.';
  }
}

export function AuthScreen() {
  const appTheme = useAppTheme();
  const styles = useMemo(() => createAuthStyles(appTheme), [appTheme]);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [countryCode] = useState('+90');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(undefined);
    const mail = email.trim().toLowerCase();
    if (!mail) {
      setError('E-posta adresini gir.');
      return;
    }
    if (password.length < 6) {
      setError('Şifre en az 6 karakter olmalı.');
      return;
    }

    if (mode === 'register') {
      const name = displayName.trim();
      if (!name) {
        setError('Adını veya görünen adını gir.');
        return;
      }
      const phoneE164 = normalizeE164(`${countryCode}${phone}`);
      if (!phoneE164) {
        setError('Geçerli bir telefon numarası gir.');
        return;
      }

      setLoading(true);
      try {
        const cred = await createUserWithEmailAndPassword(auth, mail, password);
        await updateProfile(cred.user, { displayName: name });
        await ensureUserDoc({
          uid: cred.user.uid,
          phoneNumber: phoneE164,
          displayName: name,
          email: mail,
        });
      } catch (e) {
        setError(mapAuthError(e));
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, mail, password);
      await ensureUserDocAfterSignIn({
        uid: cred.user.uid,
        email: cred.user.email || mail,
      });
    } catch (e) {
      setError(mapAuthError(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          <View style={styles.header}>
            <AppLogo size={88} />
            <Text style={styles.title}>RouteWise</Text>
            <Text style={styles.sub}>
              Hesabın e-posta ile kalıcıdır. Telefon numaran rehberden arkadaş eşleştirmesi içindir; SMS
              gönderilmez.
            </Text>
          </View>

          <View style={styles.modeRow}>
            <Pressable
              onPress={() => {
                setMode('login');
                setError(undefined);
              }}
              style={[styles.modeBtn, mode === 'login' ? styles.modeBtnOn : null]}
            >
              <Text style={[styles.modeBtnText, mode === 'login' ? styles.modeBtnTextOn : null]}>Giriş</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setMode('register');
                setError(undefined);
              }}
              style={[styles.modeBtn, mode === 'register' ? styles.modeBtnOn : null]}
            >
              <Text style={[styles.modeBtnText, mode === 'register' ? styles.modeBtnTextOn : null]}>
                Kayıt ol
              </Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            {mode === 'register' ? (
              <>
                <TextField
                  label="Adın veya görünen adın"
                  value={displayName}
                  placeholder="Örn. Ayşe"
                  onChangeText={setDisplayName}
                  maxLength={80}
                  helperText="Katılımcı listesinde ve yorumlarda bu isim kullanılır."
                />
                <View style={{ height: appTheme.space.md }} />
              </>
            ) : null}

            <TextField
              label="E-posta"
              value={email}
              placeholder="ornek@mail.com"
              keyboardType="email-address"
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={{ height: appTheme.space.md }} />
            <TextField
              label="Şifre"
              value={password}
              placeholder="En az 6 karakter"
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />

            {mode === 'register' ? (
              <>
                <View style={{ height: appTheme.space.md }} />
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
                      onChangeText={setPhone}
                      helperText="Rehber eşleştirmesi için; doğrulama SMS’i yok."
                      maxLength={15}
                    />
                  </View>
                </View>
              </>
            ) : null}

            {error ? <Text style={styles.errorBelow}>{error}</Text> : null}

            <View style={{ height: appTheme.space.lg }} />
            <PrimaryButton
              title={mode === 'login' ? 'Giriş yap' : 'Hesap oluştur'}
              onPress={submit}
              loading={loading}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function createAuthStyles(t: AppTheme) {
  return StyleSheet.create({
    scroll: { flexGrow: 1, paddingBottom: t.space.xxl },
    header: { gap: 8, marginBottom: t.space.md, alignItems: 'center' },
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
    modeRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: t.space.md,
      backgroundColor: t.color.inputBg,
      borderRadius: t.radius.pill,
      padding: 4,
      borderWidth: 1,
      borderColor: t.color.border,
    },
    modeBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: t.radius.pill,
      alignItems: 'center',
    },
    modeBtnOn: { backgroundColor: t.color.surface, ...t.shadowSoft },
    modeBtnText: { color: t.color.muted, fontSize: t.font.small, fontWeight: '800' },
    modeBtnTextOn: { color: t.color.text },
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
    errorBelow: {
      color: t.color.danger,
      fontSize: t.font.small,
      fontWeight: '700',
      marginTop: t.space.sm,
    },
  });
}
