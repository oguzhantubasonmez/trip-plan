import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { signOut } from 'firebase/auth';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { auth } from '../lib/firebase';
import { getUserTripAggregateStats, type UserTripAggregateStats } from '../services/trips';
import type { ExpenseType } from '../services/userProfile';
import {
  DEFAULT_EXPENSE_TYPE_IDS,
  getUserProfile,
  updateUserProfile,
} from '../services/userProfile';
import { useAppTheme, useThemeMode, type ThemeMode } from '../ThemeContext';
import type { AppTheme } from '../theme';
import { nationalDigitsAfterTrCountry, normalizeE164 } from '../utils/phone';

export function ProfileScreen(props: {
  /** Sekme çubuğundan açıldığında geri satırı gösterilmez */
  variant?: 'stack' | 'tab';
  onBack?: () => void;
  onOpenFriends: () => void;
}) {
  const theme = useAppTheme();
  const { mode, setMode } = useThemeMode();
  const styles = useMemo(() => createProfileStyles(theme), [theme]);
  const uid = auth.currentUser?.uid;
  const authEmail = auth.currentUser?.email ?? '';
  const [countryCode] = useState('+90');
  const [displayName, setDisplayName] = useState('');
  const [phoneNational, setPhoneNational] = useState('');
  const [carConsumption, setCarConsumption] = useState('');
  const [defaultVehicleLabel, setDefaultVehicleLabel] = useState('');
  const [defaultFuelPricePerLiter, setDefaultFuelPricePerLiter] = useState('');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [newExpenseName, setNewExpenseName] = useState('');
  const [typesBusy, setTypesBusy] = useState(false);
  const [tripStats, setTripStats] = useState<UserTripAggregateStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!uid) return;
    const p = await getUserProfile(uid);
    setDisplayName(p?.displayName ?? '');
    setCarConsumption(p?.carConsumption ?? '');
    setDefaultVehicleLabel(p?.defaultVehicleLabel ?? '');
    setDefaultFuelPricePerLiter(p?.defaultFuelPricePerLiter ?? '');
    setExpenseTypes(p?.expenseTypes ?? []);
    setPhoneNational(nationalDigitsAfterTrCountry(p?.phoneNumber ?? ''));
  }, [uid]);

  const loadTripStats = useCallback(async () => {
    if (!uid) return;
    setStatsLoading(true);
    setStatsError(null);
    try {
      const s = await getUserTripAggregateStats(uid);
      setTripStats(s);
    } catch (e: any) {
      setStatsError(e?.message || 'Özet yüklenemedi.');
      setTripStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      void load();
      void loadTripStats();
    }, [load, loadTripStats])
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
        defaultVehicleLabel: defaultVehicleLabel.trim() || undefined,
        defaultFuelPricePerLiter: defaultFuelPricePerLiter.trim() || undefined,
        phoneNumber,
      });
      await load();
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
    if (DEFAULT_EXPENSE_TYPE_IDS.has(id)) return;
    void persistExpenseTypes(expenseTypes.filter((x) => x.id !== id));
  }

  const tripStatsSummary = useMemo(() => {
    if (statsLoading && !tripStats) return 'Özet yükleniyor…';
    if (statsError) return 'Özet alınamadı';
    if (!tripStats) return 'Veri yok';
    const cost =
      tripStats.totalCostTl > 0
        ? `${tripStats.totalCostTl.toLocaleString('tr-TR')} TL`
        : 'masraf —';
    return `${tripStats.tripCount} rota · ${tripStats.stopCount} durak · ${cost}`;
  }, [statsLoading, statsError, tripStats]);

  const profileSummary = useMemo(() => {
    const name = displayName.trim();
    if (name && authEmail) return `${name} · ${authEmail}`;
    if (name) return name;
    if (authEmail) return authEmail;
    return 'E-posta, ad, telefon';
  }, [displayName, authEmail]);

  const expenseTypesSummary = useMemo(() => {
    if (expenseTypes.length === 0) return 'Türler yükleniyor…';
    return `${expenseTypes.length} tür`;
  }, [expenseTypes.length]);

  const themeOptionLabel: Record<ThemeMode, string> = {
    light: 'Açık',
    dark: 'Koyu',
    ocean: 'Okyanus',
    sunset: 'Gün batımı',
    forest: 'Orman',
  };

  const themeSummary = `Tema: ${themeOptionLabel[mode]}`;

  return (
    <Screen>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
      {props.variant !== 'tab' && props.onBack ? (
        <Pressable onPress={props.onBack} style={styles.backRow}>
          <Text style={styles.backText}>← Geri</Text>
        </Pressable>
      ) : null}
      <View style={styles.header}>
        <Text style={styles.heroEmoji}>🚗</Text>
        <Text style={styles.title}>Profil</Text>
        <Text style={styles.sub}>
          Telefon rehber eşleşmesi için. Araç tüketimi, araç ismi ve yakıt fiyatı rota detayındaki «Araç ve yakıt»
          bölümüne varsayılan olarak düşer; her rotada farklı değer girebilirsin.
        </Text>
      </View>

      <CollapsibleSection
        title="Gezi özeti"
        collapsedSummary={tripStatsSummary}
        containerStyle={[styles.card, styles.sectionGap]}
      >
        <Text style={styles.blockSub}>
          Katıldığın rotalardaki duraklar, mesafe ve masrafların toplamı (tahmini değerler).
        </Text>
        <View style={{ height: theme.space.md }} />
        {statsLoading && !tripStats ? (
          <Text style={styles.statsMuted}>Özet yükleniyor…</Text>
        ) : statsError ? (
          <Text style={styles.statsError}>{statsError}</Text>
        ) : tripStats ? (
          <>
            <View style={styles.statsGrid}>
              <View style={styles.statCell}>
                <Text style={styles.statValue}>{tripStats.tripCount}</Text>
                <Text style={styles.statLabel}>Rota</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statValue}>{tripStats.stopCount}</Text>
                <Text style={styles.statLabel}>Durak</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statValue}>{tripStats.approvedStopCount}</Text>
                <Text style={styles.statLabel}>Onaylı durak</Text>
              </View>
            </View>
            <View style={styles.statsDivider} />
            <View style={styles.statRow}>
              <Text style={styles.statRowLabel}>Toplam km</Text>
              <Text style={styles.statRowValue}>
                {tripStats.totalKm > 0 ? `~${tripStats.totalKm} km` : '—'}
              </Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statRowLabel}>Tahmini yol süresi</Text>
              <Text style={styles.statRowValue}>{formatAggregateDrivingDuration(tripStats.totalDrivingMinutes)}</Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statRowLabel}>Durak masrafları</Text>
              <Text style={styles.statRowValue}>
                {tripStats.totalStopExtraTl > 0 ? `${tripStats.totalStopExtraTl} TL` : '—'}
              </Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statRowLabel}>Yakıt (rota tahmini)</Text>
              <Text style={styles.statRowValue}>
                {tripStats.totalFuelTl > 0 ? `${tripStats.totalFuelTl} TL` : '—'}
              </Text>
            </View>
            <View style={[styles.statRow, styles.statRowHighlight]}>
              <Text style={styles.statRowLabel}>Toplam masraf</Text>
              <Text style={styles.statRowValueStrong}>
                {tripStats.totalCostTl > 0 ? `${tripStats.totalCostTl} TL` : '—'}
              </Text>
            </View>
          </>
        ) : (
          <Text style={styles.statsMuted}>Özet yüklenemedi.</Text>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Profil bilgileri"
        collapsedSummary={profileSummary}
        containerStyle={[styles.card, styles.sectionGap]}
      >
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
          helperText="100 km’de kaç litre (örn. 7)."
        />
        <View style={{ height: theme.space.sm }} />
        <TextField
          label="Araç ismi (varsayılan etiket)"
          value={defaultVehicleLabel}
          placeholder="Örn. SUV, babanın arabası"
          onChangeText={setDefaultVehicleLabel}
          helperText="Yeni açılan veya etiketi boş rotada «Araç (etiket)» alanına bu metin gelir."
        />
        <View style={{ height: theme.space.sm }} />
        <TextField
          label="Yakıt fiyatı (TL/L, varsayılan)"
          value={defaultFuelPricePerLiter}
          placeholder="Örn. 38,5"
          keyboardType="decimal-pad"
          onChangeText={setDefaultFuelPricePerLiter}
          helperText="Rotada yakıt fiyatı kayıtlı değilse bu değer önerilir; virgül veya nokta kullanabilirsin."
        />
        <View style={{ height: theme.space.md }} />
        <PrimaryButton title="💾 Kaydet" onPress={save} loading={loading} />
        {saved ? <Text style={styles.saved}>Kaydedildi.</Text> : null}
      </CollapsibleSection>

      <CollapsibleSection
        title="Masraf türleri"
        collapsedSummary={expenseTypesSummary}
        containerStyle={[styles.card, styles.sectionGap]}
      >
        <Text style={styles.blockSub}>
          Yemek, İçecek, Konaklama ve Diğer her hesapta hazırdır. İstersen aşağıdan kendi türlerini de
          ekleyebilirsin.
        </Text>
        <View style={{ height: theme.space.sm }} />
        <TextField
          label="Yeni masraf türü"
          value={newExpenseName}
          placeholder="Örn. Park, müze, yakıt"
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
          <Text style={styles.typesEmpty}>Türler yükleniyor…</Text>
        ) : (
          expenseTypes.map((et) => (
            <View key={et.id} style={styles.typeRow}>
              <Text style={styles.typeName} numberOfLines={2}>
                {et.name}
              </Text>
              {DEFAULT_EXPENSE_TYPE_IDS.has(et.id) ? (
                <Text style={styles.typeBuiltin}>Standart</Text>
              ) : (
                <Pressable
                  onPress={() => removeExpenseType(et.id)}
                  disabled={typesBusy}
                  style={styles.typeRemove}
                >
                  <Text style={styles.typeRemoveText}>Sil</Text>
                </Pressable>
              )}
            </View>
          ))
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Görünüm"
        collapsedSummary={themeSummary}
        containerStyle={[styles.card, styles.sectionGap]}
      >
        <Text style={styles.themeSub}>Uygulama renk paleti — istediğin görünümü seç.</Text>
        <View style={{ height: theme.space.sm }} />
        <View style={styles.themeGrid}>
          {(
            [
              { id: 'light' as const, emoji: '☀️', title: 'Açık', sub: 'Gündüz, yüksek okunurluk' },
              { id: 'dark' as const, emoji: '🌙', title: 'Koyu', sub: 'Gece ve düşük ışık' },
              { id: 'ocean' as const, emoji: '🌊', title: 'Okyanus', sub: 'Camgöbeği tonları' },
              { id: 'sunset' as const, emoji: '🌅', title: 'Gün batımı', sub: 'Sıcak mor & mercan' },
              { id: 'forest' as const, emoji: '🌲', title: 'Orman', sub: 'Zümrüt yeşili' },
            ] as const
          ).map((opt) => {
            const active = mode === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setMode(opt.id)}
                style={({ pressed }) => [
                  styles.themeOption,
                  active && styles.themeOptionActive,
                  pressed && { opacity: 0.92 },
                ]}
              >
                <Text style={styles.themeOptionEmoji}>{opt.emoji}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.themeOptionTitle, active && styles.themeOptionTitleActive]}>
                    {opt.title}
                  </Text>
                  <Text style={styles.themeOptionSub} numberOfLines={2}>
                    {opt.sub}
                  </Text>
                </View>
                {active ? <Text style={styles.themeCheck}>✓</Text> : null}
              </Pressable>
            );
          })}
        </View>
      </CollapsibleSection>

      <CollapsibleSection
        title="Arkadaşlar ve gruplar"
        collapsedSummary="Liste, rehberden ekleme, gruplar"
        containerStyle={[styles.card, styles.sectionGap]}
      >
        <Pressable onPress={props.onOpenFriends} style={styles.extraBtnFlat}>
          <Text style={styles.extraBtnText}>Arkadaşlarım ve gruplar</Text>
          <Text style={styles.extraBtnSub}>Liste, rehberden ekleme, gruplar</Text>
        </Pressable>
      </CollapsibleSection>

      <CollapsibleSection
        title="Oturum"
        collapsedSummary="Güvenli çıkış"
        containerStyle={[styles.card, styles.sectionGap]}
      >
        <Pressable onPress={handleSignOut} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Çıkış yap</Text>
        </Pressable>
      </CollapsibleSection>
      </ScrollView>
    </Screen>
  );
}

function formatAggregateDrivingDuration(totalMin: number): string {
  if (totalMin <= 0) return '—';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `~${m} dk`;
  if (m === 0) return `~${h} sa`;
  return `~${h} sa ${m} dk`;
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
    sectionGap: { marginBottom: theme.space.md },
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
    blockSub: { color: theme.color.muted, fontSize: theme.font.small, lineHeight: 20 },
    statsMuted: { color: theme.color.muted, fontSize: theme.font.small, fontStyle: 'italic' },
    statsError: { color: theme.color.danger, fontSize: theme.font.small, fontWeight: '700' },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.space.sm,
    },
    statCell: {
      flexGrow: 1,
      flexBasis: '28%',
      minWidth: 88,
      paddingVertical: theme.space.sm,
      paddingHorizontal: theme.space.sm,
      borderRadius: theme.radius.md,
      backgroundColor: theme.color.inputBg,
      borderWidth: 1,
      borderColor: theme.color.subtle,
      alignItems: 'center',
    },
    statValue: { color: theme.color.text, fontSize: theme.font.h2, fontWeight: '900' },
    statLabel: {
      color: theme.color.muted,
      fontSize: theme.font.tiny,
      fontWeight: '700',
      marginTop: 4,
      textAlign: 'center',
    },
    statsDivider: {
      height: 1,
      backgroundColor: theme.color.subtle,
      marginVertical: theme.space.md,
    },
    statRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      gap: theme.space.md,
    },
    statRowHighlight: {
      marginTop: 4,
      paddingTop: theme.space.sm,
      borderTopWidth: 1,
      borderTopColor: theme.color.subtle,
    },
    statRowLabel: { color: theme.color.textSecondary, fontSize: theme.font.small, fontWeight: '600', flex: 1 },
    statRowValue: { color: theme.color.text, fontSize: theme.font.body, fontWeight: '700' },
    statRowValueStrong: { color: theme.color.primaryDark, fontSize: theme.font.body, fontWeight: '900' },
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
    typeBuiltin: {
      color: theme.color.muted,
      fontSize: theme.font.tiny,
      fontWeight: '700',
      paddingVertical: 6,
      paddingHorizontal: 8,
    },
    saved: { color: theme.color.success, fontSize: theme.font.small, marginTop: theme.space.sm, fontWeight: '700' },
    themeGrid: { gap: theme.space.sm },
    themeOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space.md,
      paddingVertical: 12,
      paddingHorizontal: theme.space.md,
      borderRadius: theme.radius.lg,
      borderWidth: 1.5,
      borderColor: theme.color.border,
      backgroundColor: theme.color.inputBg,
    },
    themeOptionActive: {
      borderColor: theme.color.primary,
      backgroundColor: theme.color.primarySoft,
    },
    themeOptionEmoji: { fontSize: 22 },
    themeOptionTitle: { color: theme.color.text, fontSize: theme.font.body, fontWeight: '800' },
    themeOptionTitleActive: { color: theme.color.primaryDark },
    themeOptionSub: { color: theme.color.muted, fontSize: theme.font.tiny, marginTop: 2, lineHeight: 16 },
    themeCheck: {
      color: theme.color.primary,
      fontSize: theme.font.h2,
      fontWeight: '900',
    },
    themeSub: { color: theme.color.muted, fontSize: theme.font.small, lineHeight: 20 },
    extraBtnFlat: {
      borderRadius: theme.radius.lg,
      padding: theme.space.lg,
      borderWidth: 1,
      borderColor: theme.color.cardBorderAccent,
      backgroundColor: theme.color.inputBg,
    },
    extraBtnText: { color: theme.color.text, fontSize: theme.font.body, fontWeight: '700' },
    extraBtnSub: { color: theme.color.muted, fontSize: theme.font.small, marginTop: 4 },
    signOutBtn: {
      alignSelf: 'stretch',
      alignItems: 'center',
      paddingVertical: theme.space.md,
      paddingHorizontal: theme.space.lg,
      borderRadius: theme.radius.md,
      backgroundColor: theme.color.inputBg,
      borderWidth: 1,
      borderColor: theme.color.border,
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
