import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { signOut } from 'firebase/auth';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { auth } from '../lib/firebase';
import type { ExpenseType } from '../services/userProfile';
import { getUserProfile, updateUserProfile } from '../services/userProfile';
import { useAppTheme, useThemeMode } from '../ThemeContext';
import type { AppTheme } from '../theme';
import { nationalDigitsAfterTrCountry, normalizeE164 } from '../utils/phone';

export function ProfileScreen(props: { onBack: () => void; onOpenFriends: () => void }) {
  const theme = useAppTheme();
  const { mode, setMode } = useThemeMode();
  const styles = useMemo(() => createProfileStyles(theme), [theme]);
  const uid = auth.currentUser?.uid;
  const authEmail = auth.currentUser?.email ?? '';
  const [countryCode] = useState('+90');
  const [displayName, setDisplayName] = useState('');
  const [phoneNational, setPhoneNational] = useState('');
  const [carConsumption, setCarConsumption] = useState('');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [newExpenseName, setNewExpenseName] = useState('');
  const [typesBusy, setTypesBusy] = useState(false);

  const load = useCallback(async () => {
    if (!uid) return;
    const p = await getUserProfile(uid);
    setDisplayName(p?.displayName ?? '');
    setCarConsumption(p?.carConsumption ?? '');
    setExpenseTypes(p?.expenseTypes ?? []);
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function save() {
    if (!uid) return;
    setSaveError(null);
    setLoading(true);
    setSaved(false);
    try {
      const rawPhone = phoneNational.trim();
      let phoneNumber: string;
      if (!rawPhone) {
        phoneNumber = '';
      } else {
        const e164 = normalizeE164(`${countryCode}${rawPhone}`);
        if (!e164) {
          setSaveError('Geçerli bir telefon numarası gir.');
          return;
        }
        phoneNumber = e164;
      }
      await updateUserProfile(uid, {
        displayName: displayName.trim() || undefined,
        carConsumption: carConsumption.trim() || undefined,
        phoneNumber,
      });
      setSaved(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    try {
      await signOut(auth);
    } catch {
      /* ignore */
    }
  }

  async function persistExpenseTypes(next: ExpenseType[]) {
    if (!uid) return;
    setTypesBusy(true);
    try {
      setExpenseTypes(next);
      await updateUserProfile(uid, { expenseTypes: next });
    } finally {
      setTypesBusy(false);
    }
  }

  function addExpenseType() {
    const name = newExpenseName.trim();
    if (!name) return;
    const id = `et_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    void persistExpenseTypes([...expenseTypes, { id, name }]);
    setNewExpenseName('');
  }

  function removeExpenseType(id: string) {
    void persistExpenseTypes(expenseTypes.filter((x) => x.id !== id));
  }

  return (
    <Screen>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
      <Pressable onPress={props.onBack} style={styles.backRow}>
        <Text style={styles.backText}>← Geri</Text>
      </Pressable>
      <View style={styles.header}>
        <Text style={styles.heroEmoji}>🚗</Text>
        <Text style={styles.title}>Profil</Text>
        <Text style={styles.sub}>Varsayılan araç tüketimin; rotada istersen farklı değer de girebilirsin.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.fieldLabel}>E-posta</Text>
        <Text style={styles.emailReadonly}>{authEmail || '—'}</Text>
        <Text style={styles.emailHint}>Giriş adresin; buradan değiştirilemez.</Text>
        <View style={{ height: theme.space.md }} />
        <TextField
          label="Ad / takma ad"
          value={displayName}
          placeholder="İsteğe bağlı"
          onChangeText={setDisplayName}
        />
        <View style={{ height: theme.space.md }} />
        <View style={styles.phoneRow}>
          <View style={styles.phoneCc}>
            <Text style={styles.phoneCcText}>{countryCode}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <TextField
              label="Telefon numarası"
              value={phoneNational}
              placeholder="5xx xxx xx xx"
              keyboardType="phone-pad"
              onChangeText={setPhoneNational}
              helperText="Rehberden arkadaş eşleştirmesi için. Boş bırakırsan eşleşme olmaz."
              maxLength={15}
            />
          </View>
        </View>
        <View style={{ height: theme.space.sm }} />
        <TextField
          label="Araç tüketimi (L/100 km)"
          value={carConsumption}
          placeholder="Örn. 7"
          keyboardType="number-pad"
          onChangeText={setCarConsumption}
          helperText="100 km'de kaç litre yakıt tükettiğini gir (örn. 7 = 100 km'de 7 lt)."
        />
        <View style={{ height: theme.space.md }} />
        <PrimaryButton title="💾 Kaydet" onPress={save} loading={loading} />
        {saved ? <Text style={styles.saved}>Kaydedildi.</Text> : null}
      </View>

      <View style={{ height: theme.space.md }} />

      <View style={styles.card}>
        <Text style={styles.blockTitle}>Masraf türleri</Text>
        <Text style={styles.blockSub}>
          Rotalarda durak ekstra masrafı girerken bu türlerden seçim yapılır. İstediğin kadar özel tür
          ekleyebilirsin.
        </Text>
        <View style={{ height: theme.space.sm }} />
        <TextField
          label="Yeni masraf türü"
          value={newExpenseName}
          placeholder="Örn. Konaklama, Park, Yemek"
          onChangeText={setNewExpenseName}
        />
        <View style={{ height: theme.space.sm }} />
        <PrimaryButton
          title={typesBusy ? '...' : '➕ Tür ekle'}
          onPress={addExpenseType}
          disabled={typesBusy || !newExpenseName.trim()}
        />
        <View style={{ height: theme.space.md }} />
        {expenseTypes.length === 0 ? (
          <Text style={styles.typesEmpty}>Henüz tür yok. Yukarıdan ekle.</Text>
        ) : (
          expenseTypes.map((et) => (
            <View key={et.id} style={styles.typeRow}>
              <Text style={styles.typeName} numberOfLines={2}>
                {et.name}
              </Text>
              <Pressable
                onPress={() => removeExpenseType(et.id)}
                disabled={typesBusy}
                style={styles.typeRemove}
              >
                <Text style={styles.typeRemoveText}>Sil</Text>
              </Pressable>
            </View>
          ))
        )}
      </View>

      <View style={[styles.themeRow, theme.shadowSoft]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.themeTitle}>Koyu tema</Text>
          <Text style={styles.themeSub}>Gece ve düşük ışık için</Text>
        </View>
        <Switch
          value={mode === 'dark'}
          onValueChange={(v) => setMode(v ? 'dark' : 'light')}
          trackColor={{ false: theme.color.border, true: theme.color.primarySoft }}
          thumbColor={mode === 'dark' ? theme.color.primary : theme.color.surface}
        />
      </View>

      <View style={{ height: theme.space.lg }} />
      <Pressable onPress={props.onOpenFriends} style={styles.extraBtn}>
        <Text style={styles.extraBtnText}>Arkadaşlarım ve gruplar</Text>
        <Text style={styles.extraBtnSub}>Liste, rehberden ekleme, gruplar</Text>
      </Pressable>

      <View style={{ height: theme.space.lg }} />
      <Pressable onPress={handleSignOut} style={styles.signOutBtn}>
        <Text style={styles.signOutText}>Çıkış yap</Text>
      </Pressable>
      </ScrollView>
    </Screen>
  );
}

function createProfileStyles(theme: AppTheme) {
  return StyleSheet.create({
    scroll: { flex: 1 },
    scrollContent: {
      flexGrow: 1,
      paddingBottom: theme.space.xl * 2,
    },
    backRow: { alignSelf: 'flex-start', paddingVertical: 4, paddingRight: 8, marginBottom: theme.space.sm },
    backText: { color: theme.color.primaryDark, fontSize: theme.font.body, fontWeight: '800' },
    header: { gap: 6, marginBottom: theme.space.lg, alignItems: 'center' },
    heroEmoji: { fontSize: 40, marginBottom: 4 },
    title: { color: theme.color.text, fontSize: theme.font.hero, fontWeight: '900' },
    sub: {
      color: theme.color.muted,
      fontSize: theme.font.body,
      lineHeight: 22,
      textAlign: 'center',
      paddingHorizontal: theme.space.sm,
    },
    card: {
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.xl,
      padding: theme.space.lg,
      borderWidth: 1,
      borderColor: theme.color.cardBorderPrimary,
      ...theme.shadowCard,
    },
    fieldLabel: {
      color: theme.color.textSecondary,
      fontSize: theme.font.small,
      fontWeight: '700',
      marginBottom: 6,
    },
    emailReadonly: { color: theme.color.text, fontSize: theme.font.body, fontWeight: '700' },
    emailHint: { color: theme.color.muted, fontSize: theme.font.tiny, marginTop: 4, lineHeight: 18 },
    phoneRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    phoneCc: {
      backgroundColor: theme.color.inputBg,
      borderWidth: 1,
      borderColor: theme.color.border,
      paddingHorizontal: 12,
      paddingVertical: 14,
      borderRadius: theme.radius.md,
    },
    phoneCcText: { color: theme.color.text, fontSize: theme.font.body, fontWeight: '700' },
    saveError: {
      color: theme.color.danger,
      fontSize: theme.font.small,
      fontWeight: '700',
      marginTop: theme.space.sm,
    },
    blockTitle: { color: theme.color.text, fontSize: theme.font.body, fontWeight: '800', marginBottom: 6 },
    blockSub: { color: theme.color.muted, fontSize: theme.font.small, lineHeight: 20 },
    typesEmpty: { color: theme.color.muted, fontSize: theme.font.small, fontStyle: 'italic' },
    typeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.space.sm,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.color.subtle,
    },
    typeName: { flex: 1, color: theme.color.text, fontSize: theme.font.body, fontWeight: '600' },
    typeRemove: { paddingVertical: 6, paddingHorizontal: 10 },
    typeRemoveText: { color: theme.color.danger, fontSize: theme.font.small, fontWeight: '800' },
    saved: { color: theme.color.success, fontSize: theme.font.small, marginTop: theme.space.sm, fontWeight: '700' },
    themeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.xl,
      padding: theme.space.md,
      borderWidth: 1,
      borderColor: theme.color.border,
      gap: theme.space.md,
    },
    themeTitle: { color: theme.color.text, fontSize: theme.font.body, fontWeight: '800' },
    themeSub: { color: theme.color.muted, fontSize: theme.font.tiny, marginTop: 2 },
    extraBtn: {
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.xl,
      padding: theme.space.lg,
      borderWidth: 1,
      borderColor: theme.color.cardBorderAccent,
      ...theme.shadowCard,
    },
    extraBtnText: { color: theme.color.text, fontSize: theme.font.body, fontWeight: '700' },
    extraBtnSub: { color: theme.color.muted, fontSize: theme.font.small, marginTop: 4 },
    signOutBtn: {
      alignSelf: 'center',
      paddingVertical: 12,
      paddingHorizontal: theme.space.lg,
    },
    signOutText: { color: theme.color.danger, fontSize: theme.font.body, fontWeight: '800' },
    versionLine: {
      marginTop: theme.space.xl,
      textAlign: 'center',
      color: theme.color.muted,
      fontSize: theme.font.tiny,
      fontWeight: '600',
    },
  });
}
