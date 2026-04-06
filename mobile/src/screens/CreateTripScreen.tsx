import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useRoute, type RouteProp } from '@react-navigation/native';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AddPlaceModal } from '../components/AddPlaceModal';
import { DatePickerField } from '../components/DatePickerField';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { TimePickerField } from '../components/TimePickerField';
import { auth } from '../lib/firebase';
import type { HomeStackParamList } from '../navigation/types';
import {
  consumeTripCreationCredit,
  effectiveTripCreationCredits,
  NoTripCreationCreditsError,
} from '../services/tripCreationCredits';
import { getUserProfile } from '../services/userProfile';
import { addStop, createTrip } from '../services/trips';
import type { PlacesSearchMode } from '../services/places';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';
import { normalizePlanTime } from '../utils/planTime';

export function CreateTripScreen(props: {
  onCreated: (tripId: string, opts?: { skipAddPlaceModal?: boolean }) => void;
  onBack: () => void;
}) {
  const route = useRoute<RouteProp<HomeStackParamList, 'CreateTrip'>>();
  const [secondStopFromDiscover, setSecondStopFromDiscover] = useState(
    () => route.params?.secondStopFromDiscover ?? null
  );
  useEffect(() => {
    const p = route.params?.secondStopFromDiscover;
    setSecondStopFromDiscover(p ?? null);
  }, [route.params?.secondStopFromDiscover]);

  const appTheme = useAppTheme();
  const styles = useMemo(() => createCreateTripStyles(appTheme), [appTheme]);
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [placePickerOpen, setPlacePickerOpen] = useState(false);
  const [placesMode, setPlacesMode] = useState<PlacesSearchMode>('all');
  const [firstStop, setFirstStop] = useState<{
    locationName: string;
    coords: { latitude: number; longitude: number };
    googlePlaceId?: string;
    placeRating?: number;
    placeUserRatingsTotal?: number;
  } | null>(null);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [creditsHint, setCreditsHint] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        setCreditsHint(null);
        return;
      }
      void getUserProfile(uid).then((p) => setCreditsHint(effectiveTripCreationCredits(p)));
    }, [])
  );

  function toISODate(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  async function submit() {
    setError(undefined);
    let tripTitle = title.trim();
    if (!tripTitle && firstStop && secondStopFromDiscover) {
      tripTitle = `${firstStop.locationName} → ${secondStopFromDiscover.locationName}`;
    }
    if (!tripTitle && firstStop) {
      tripTitle = firstStop.locationName;
    }
    if (secondStopFromDiscover && !firstStop) {
      setError('Yer keşfet’ten gelen rota için önce başlangıç noktasını (1. durak) seçin.');
      return;
    }
    if (!tripTitle) {
      setError('Rota adı girin veya aşağıdan bir başlangıç noktası seçin.');
      return;
    }
    if (!startDate) {
      setError('Başlangıç tarihi seçin.');
      return;
    }
    if (!endDate) {
      setError('Bitiş tarihi seçin.');
      return;
    }
    if (endDate.getTime() < startDate.getTime()) {
      setError('Bitiş tarihi başlangıçtan önce olamaz.');
      return;
    }
    const stNorm = startTime.trim() ? normalizePlanTime(startTime) : undefined;
    const etNorm = endTime.trim() ? normalizePlanTime(endTime) : undefined;
    if (startTime.trim() && !stNorm) {
      setError('Başlangıç saati HH:mm olmalı (örn. 09:00).');
      return;
    }
    if (endTime.trim() && !etNorm) {
      setError('Bitiş saati HH:mm olmalı (örn. 20:00).');
      return;
    }
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setError('Oturum bulunamadı.');
      return;
    }
    const profileCheck = await getUserProfile(uid);
    if (effectiveTripCreationCredits(profileCheck) < 1) {
      setError(
        'Rota oluşturma hakkın kalmadı. Ana sekmelerin üstündeki alandan «Reklam izle · +1 hak» ile hak kazanabilirsin.'
      );
      return;
    }
    setLoading(true);
    try {
      const tripId = await createTrip({
        adminId: uid,
        title: tripTitle,
        startDate: toISODate(startDate),
        endDate: toISODate(endDate),
        startTime: stNorm,
        endTime: etNorm,
      });
      if (firstStop) {
        await addStop({
          tripId,
          locationName: firstStop.locationName,
          createdBy: uid,
          status: 'approved',
          coords: firstStop.coords,
          order: 0,
          ...(firstStop.googlePlaceId?.trim() ? { googlePlaceId: firstStop.googlePlaceId.trim() } : {}),
          ...(firstStop.placeRating != null && firstStop.placeRating > 0
            ? { placeRating: firstStop.placeRating }
            : {}),
          ...(firstStop.placeUserRatingsTotal != null && firstStop.placeUserRatingsTotal > 0
            ? { placeUserRatingsTotal: firstStop.placeUserRatingsTotal }
            : {}),
        });
      }
      if (secondStopFromDiscover && firstStop) {
        await addStop({
          tripId,
          locationName: secondStopFromDiscover.locationName.trim(),
          createdBy: uid,
          status: 'approved',
          coords: secondStopFromDiscover.coords,
          order: 1,
          ...(secondStopFromDiscover.googlePlaceId?.trim()
            ? { googlePlaceId: secondStopFromDiscover.googlePlaceId.trim() }
            : {}),
          ...(secondStopFromDiscover.placeRating != null && secondStopFromDiscover.placeRating > 0
            ? { placeRating: secondStopFromDiscover.placeRating }
            : {}),
          ...(secondStopFromDiscover.placeUserRatingsTotal != null &&
          secondStopFromDiscover.placeUserRatingsTotal > 0
            ? { placeUserRatingsTotal: secondStopFromDiscover.placeUserRatingsTotal }
            : {}),
        });
      }
      try {
        await consumeTripCreationCredit(uid);
        setCreditsHint((c) => (c != null ? Math.max(0, c - 1) : c));
      } catch (ce: unknown) {
        if (!(ce instanceof NoTripCreationCreditsError)) {
          /* nadir yarış; rota zaten oluştu */
        }
      }
      props.onCreated(tripId, { skipAddPlaceModal: !!(firstStop || secondStopFromDiscover) });
    } catch (e: any) {
      setError(e?.message || 'Rota oluşturulamadı.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          <Pressable onPress={props.onBack} style={styles.backRow}>
            <Text style={styles.backText}>← Geri</Text>
          </Pressable>
          <View style={styles.header}>
            <Text style={styles.heroEmoji}>🎒</Text>
            <Text style={styles.title}>Yeni aktivite / rota</Text>
            <Text style={styles.sub}>
              Google Places ile işletme, şehir veya adres ara; ilk durağı seçebilirsin. Rota adı boşsa seçtiğin yer
              adı kullanılır.
            </Text>
          </View>

          {creditsHint != null && creditsHint < 1 ? (
            <View style={styles.creditWarn}>
              <Text style={styles.creditWarnText}>
                Rota hakkın bitti. Üstteki «Reklam izle · +1 hak» ile devam edebilirsin.
              </Text>
            </View>
          ) : creditsHint != null ? (
            <Text style={styles.creditOk}>Kalan rota hakkı: {creditsHint}</Text>
          ) : null}

          <View style={styles.card}>
          {secondStopFromDiscover ? (
            <View style={styles.secondStopBanner}>
              <Text style={styles.secondStopBannerTitle}>İkinci durak hazır</Text>
              <Text style={styles.secondStopBannerText}>
                «{secondStopFromDiscover.locationName}» rota oluşturulunca 2. durak olarak eklenecek. Aşağıdan 1.
                durağı (başlangıç) seçin — zorunlu.
              </Text>
            </View>
          ) : null}
          <Text style={styles.blockTitle}>
            {secondStopFromDiscover ? 'Başlangıç noktası (1. durak) — zorunlu' : 'Başlangıç noktası (isteğe bağlı)'}
          </Text>
          {firstStop ? (
            <View style={styles.selectedPlace}>
              <Text style={styles.selectedPlaceText}>{firstStop.locationName}</Text>
              <Pressable onPress={() => setFirstStop(null)}>
                <Text style={styles.clearPlace}>Kaldır</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={styles.modeRow}>
            {(
              [
                { key: 'all' as const, label: 'Tümü' },
                { key: 'regions' as const, label: 'İl / ilçe' },
                { key: 'geocode' as const, label: 'Adres' },
              ]
            ).map((m) => (
              <Pressable
                key={m.key}
                onPress={() => setPlacesMode(m.key)}
                style={[styles.modeChip, placesMode === m.key && styles.modeChipActive]}
              >
                <Text style={[styles.modeChipText, placesMode === m.key && styles.modeChipTextActive]}>
                  {m.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <PrimaryButton
            title="📍 Haritadan yer ara"
            variant="accent"
            onPress={() => setPlacePickerOpen(true)}
          />
          <View style={{ height: appTheme.space.md }} />

          <TextField
            label="Rota adı"
            value={title}
            placeholder="Örn. Bolu hafta sonu (veya sadece yer seç)"
            onChangeText={setTitle}
            errorText={error}
          />
          <View style={{ height: appTheme.space.sm }} />
          <DatePickerField
            label="Başlangıç tarihi"
            value={startDate}
            onChange={(d) => {
              setStartDate(d);
              if (d && endDate && endDate.getTime() < d.getTime()) setEndDate(d);
            }}
          />
          <View style={{ height: appTheme.space.sm }} />
          <DatePickerField
            label="Bitiş tarihi"
            value={endDate}
            minDate={startDate ?? undefined}
            onChange={setEndDate}
          />
          <View style={{ height: appTheme.space.sm }} />
          <TimePickerField
            label="Plan başlangıç saati (opsiyonel)"
            value={startTime}
            onChange={setStartTime}
            allowClear
            helperText="Bu gezi için günlük başlangıç saati."
          />
          <View style={{ height: appTheme.space.sm }} />
          <TimePickerField
            label="Plan bitiş saati (opsiyonel)"
            value={endTime}
            onChange={setEndTime}
            allowClear
            helperText="Gün içi bitiş veya dönüş."
          />
          <View style={{ height: appTheme.space.md }} />
          <PrimaryButton
            title="🚀 Planı oluştur"
            onPress={submit}
            loading={loading}
            disabled={creditsHint != null && creditsHint < 1}
          />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <AddPlaceModal
        visible={placePickerOpen}
        searchMode={placesMode}
        onClose={() => setPlacePickerOpen(false)}
        onAdd={async (params) => {
          setFirstStop(params);
          setPlacePickerOpen(false);
        }}
      />
    </Screen>
  );
}

function createCreateTripStyles(t: AppTheme) {
  return StyleSheet.create({
    scrollContent: {
      flexGrow: 1,
      paddingBottom: t.space.xl * 2,
    },
    backRow: { alignSelf: 'flex-start', paddingVertical: 4, paddingRight: 8, marginBottom: t.space.sm },
    backText: { color: t.color.primary, fontSize: t.font.body, fontWeight: '700' },
    header: { gap: 8, marginBottom: t.space.lg, alignItems: 'center' },
    heroEmoji: { fontSize: 44, marginBottom: 4 },
    title: { color: t.color.text, fontSize: t.font.hero, fontWeight: '900', textAlign: 'center' },
    creditWarn: {
      marginBottom: t.space.md,
      padding: t.space.md,
      borderRadius: t.radius.lg,
      backgroundColor: 'rgba(239, 68, 68, 0.12)',
      borderWidth: 1,
      borderColor: t.color.danger,
    },
    creditWarnText: { color: t.color.danger, fontSize: t.font.small, fontWeight: '700', lineHeight: 20 },
    creditOk: {
      marginBottom: t.space.sm,
      textAlign: 'center',
      color: t.color.primaryDark,
      fontSize: t.font.small,
      fontWeight: '800',
    },
    sub: {
      color: t.color.muted,
      fontSize: t.font.body,
      lineHeight: 22,
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
    blockTitle: { color: t.color.text, fontSize: t.font.body, fontWeight: '700', marginBottom: t.space.sm },
    secondStopBanner: {
      marginBottom: t.space.md,
      padding: t.space.md,
      borderRadius: t.radius.md,
      backgroundColor: t.color.primarySoft,
      borderWidth: 1,
      borderColor: t.color.cardBorderPrimary,
    },
    secondStopBannerTitle: { color: t.color.primaryDark, fontSize: t.font.small, fontWeight: '900', marginBottom: 6 },
    secondStopBannerText: { color: t.color.text, fontSize: t.font.small, lineHeight: 20, fontWeight: '600' },
    selectedPlace: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: t.space.sm,
      borderRadius: t.radius.md,
      backgroundColor: t.color.inputBg,
      marginBottom: t.space.sm,
    },
    selectedPlaceText: { color: t.color.text, fontSize: t.font.body, flex: 1 },
    clearPlace: { color: t.color.danger, fontSize: t.font.small, fontWeight: '700' },
    modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: t.space.sm },
    modeChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: t.radius.pill,
      borderWidth: 1,
      borderColor: t.color.border,
      backgroundColor: t.color.inputBg,
    },
    modeChipActive: { borderColor: t.color.primary, backgroundColor: t.color.primarySoft },
    modeChipText: { color: t.color.muted, fontSize: t.font.small, fontWeight: '600' },
    modeChipTextActive: { color: t.color.text },
  });
}
