import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../lib/firebase';
import type { DiscoverSecondStopPayload } from '../navigation/types';
import {
  getGooglePlaceRatingParts,
  getPlaceDetails,
  searchPlaces,
} from '../services/places';
import type { PlaceDetails as PlaceDetailsType, PlacePrediction } from '../services/places';
import {
  addStop,
  getStopsForTrip,
  getTrip,
  getTripsForUser,
  recalculateLegsForTrip,
  reorderStops,
} from '../services/trips';
import { getUserProfile, upsertSavedPlaceForUser } from '../services/userProfile';
import type { Trip } from '../types/trip';
import { buildDiscoverSpotlightPayload } from '../utils/discoverSpotlightPayload';
import { writeSavedPlaceDiscoverCache } from '../utils/savedPlacesDiscoverCache';
import { fetchPresentationWebForPlaceSpotlight } from '../utils/stopWebEnrichment';
import { parseTripYmd, sortStopsByRoute } from '../utils/tripSchedule';
import type { StopPresentationPayload } from '../utils/presentationModel';
import { PresentationStopSlide } from '../screens/TripPresentationScreen';

const BG = '#0B1220';
const CARD = '#111827';
const TEXT = '#F1F5F9';
const MUTED = '#94A3B8';
const ACCENT = '#38BDF8';
const DEBOUNCE_MS = 420;

type Phase = 'search' | 'loading' | 'spotlight';

function eachTripDayYmd(startYmd: string, endYmd: string): string[] {
  const a = parseTripYmd(startYmd);
  const b = parseTripYmd(endYmd);
  if (!a || !b) {
    const s = String(startYmd ?? '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? [s] : [];
  }
  const out: string[] = [];
  const cur = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function canUserAddStopToTrip(trip: Trip, uid: string): boolean {
  if (trip.adminId === uid) return true;
  return trip.attendees.some((a) => a.uid === uid && a.role === 'editor');
}

function formatDayChip(ymd: string): string {
  const dt = parseTripYmd(ymd);
  if (!dt) return ymd;
  return dt.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function buildSecondStopPayload(details: PlaceDetailsType, placeId: string): DiscoverSecondStopPayload {
  return {
    locationName: details.name.trim(),
    coords: { latitude: details.latitude, longitude: details.longitude },
    googlePlaceId: placeId.trim() || undefined,
    placeRating:
      details.rating != null && details.rating > 0 ? details.rating : undefined,
    placeUserRatingsTotal:
      details.userRatingsTotal != null && details.userRatingsTotal > 0
        ? details.userRatingsTotal
        : undefined,
  };
}

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Profil / dış yönlendirme: açılınca bu place ile doğrudan sunum */
  seedPlaceId?: string | null;
  /** Önbellekten (Keşfet listesi vb.): tam yeniden çekmeden spotlight göster */
  seedInitialPayload?: StopPresentationPayload | null;
  onSeedConsumed?: () => void;
  onNavigateCreateTripWithSecondStop: (payload: DiscoverSecondStopPayload) => void;
  onOpenTrip: (tripId: string) => void;
};

export function PlaceDiscoverModal(props: Props) {
  const { width } = useWindowDimensions();
  const [phase, setPhase] = useState<Phase>('search');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<PlaceDetailsType | null>(null);
  const [spotlightPayload, setSpotlightPayload] = useState<StopPresentationPayload | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [savedPlaceIds, setSavedPlaceIds] = useState<Set<string>>(new Set());
  const [addTripModalOpen, setAddTripModalOpen] = useState(false);
  const [tripsForPicker, setTripsForPicker] = useState<Trip[]>([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [pickerTrip, setPickerTrip] = useState<Trip | null>(null);
  const [addStopBusy, setAddStopBusy] = useState(false);
  const seedHandledRef = useRef<string | null>(null);

  const styles = useMemo(() => createStyles(), []);
  const uid = auth.currentUser?.uid;

  const resetAll = useCallback(() => {
    setPhase('search');
    setQuery('');
    setSuggestions([]);
    setError(null);
    setSelectedPlaceId(null);
    setSelectedDetails(null);
    setSpotlightPayload(null);
    setLoadingSearch(false);
    setSaveBusy(false);
    setAddTripModalOpen(false);
    setPickerTrip(null);
    setTripsForPicker([]);
    seedHandledRef.current = null;
  }, []);

  useEffect(() => {
    if (!props.visible) {
      resetAll();
      return;
    }
  }, [props.visible, resetAll]);

  const handleSelectPrediction = useCallback(async (placeId: string) => {
    Keyboard.dismiss();
    setError(null);
    setPhase('loading');
    try {
      const details = await getPlaceDetails(placeId);
      setSelectedPlaceId(placeId);
      setSelectedDetails(details);
      const web = await fetchPresentationWebForPlaceSpotlight({
        locationName: details.name,
        coords: { latitude: details.latitude, longitude: details.longitude },
        googlePlaceId: placeId,
        placeRating: details.rating != null && details.rating > 0 ? details.rating : undefined,
        placeUserRatingsTotal:
          details.userRatingsTotal != null && details.userRatingsTotal > 0
            ? details.userRatingsTotal
            : undefined,
      });
      const spotlight = buildDiscoverSpotlightPayload(details, placeId, web);
      setSpotlightPayload(spotlight);
      void writeSavedPlaceDiscoverCache(placeId, spotlight);
      setPhase('spotlight');
    } catch (e: any) {
      setError(e?.message || 'Yer yüklenemedi.');
      setPhase('search');
    }
  }, []);

  useEffect(() => {
    if (!props.visible || !props.seedPlaceId?.trim()) return;
    const id = props.seedPlaceId.trim();
    if (seedHandledRef.current === id) return;
    const pre = props.seedInitialPayload;
    if (pre && pre.stopId === id) {
      seedHandledRef.current = id;
      setSelectedPlaceId(id);
      setSpotlightPayload(pre);
      setPhase('spotlight');
      props.onSeedConsumed?.();
      void getPlaceDetails(id)
        .then((d) => setSelectedDetails(d))
        .catch(() => setSelectedDetails(null));
      return;
    }
    seedHandledRef.current = id;
    void handleSelectPrediction(id).finally(() => {
      props.onSeedConsumed?.();
    });
  }, [
    props.visible,
    props.seedPlaceId,
    props.seedInitialPayload,
    props.onSeedConsumed,
    handleSelectPrediction,
  ]);

  useEffect(() => {
    if (!props.visible || phase !== 'spotlight' || !uid) return;
    void getUserProfile(uid).then((p) => {
      const s = new Set((p?.savedPlaces ?? []).map((x) => x.googlePlaceId));
      setSavedPlaceIds(s);
    });
  }, [props.visible, phase, uid, selectedPlaceId]);

  useEffect(() => {
    if (!props.visible || phase !== 'search') return;
    const t = setTimeout(() => {
      if (!query.trim()) {
        setSuggestions([]);
        setLoadingSearch(false);
        return;
      }
      setLoadingSearch(true);
      setError(null);
      searchPlaces(query, 'all')
        .then(setSuggestions)
        .catch((e) => {
          setError(e?.message || 'Arama başarısız.');
          setSuggestions([]);
        })
        .finally(() => setLoadingSearch(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [props.visible, phase, query]);

  const goBackToSearch = useCallback(() => {
    setPhase('search');
    setSpotlightPayload(null);
    setSelectedDetails(null);
    setSelectedPlaceId(null);
    setSuggestions([]);
    setQuery('');
    seedHandledRef.current = null;
  }, []);

  const handleModalClose = useCallback(() => {
    props.onClose();
  }, [props]);

  const openAddToTripModal = useCallback(async () => {
    if (!uid) {
      Alert.alert('Giriş gerekli', 'Bu işlem için oturum açmalısınız.');
      return;
    }
    setAddTripModalOpen(true);
    setPickerTrip(null);
    setTripsLoading(true);
    try {
      const all = await getTripsForUser(uid);
      const allowed = all.filter((t) => canUserAddStopToTrip(t, uid));
      setTripsForPicker(allowed);
    } catch {
      setTripsForPicker([]);
      Alert.alert('Hata', 'Rotalar yüklenemedi.');
    } finally {
      setTripsLoading(false);
    }
  }, [uid]);

  const confirmAddStopToTrip = useCallback(
    async (trip: Trip, stopDateYmd: string) => {
      if (!uid || !selectedDetails || !selectedPlaceId) return;
      setAddStopBusy(true);
      try {
        const freshTrip = await getTrip(trip.tripId);
        if (!freshTrip) {
          Alert.alert('Hata', 'Rota bulunamadı.');
          return;
        }
        if (!canUserAddStopToTrip(freshTrip, uid)) {
          Alert.alert('Yetki yok', 'Bu rotaya durak ekleyemezsiniz.');
          return;
        }
        const isAdmin = freshTrip.adminId === uid;
        const stops = await getStopsForTrip(trip.tripId);
        const status = isAdmin ? 'approved' : 'pending';
        await addStop({
          tripId: trip.tripId,
          locationName: selectedDetails.name,
          createdBy: uid,
          status,
          coords: { latitude: selectedDetails.latitude, longitude: selectedDetails.longitude },
          order: stops.length,
          stopDate: stopDateYmd,
          ...(selectedDetails.rating != null && selectedDetails.rating > 0
            ? { placeRating: selectedDetails.rating }
            : {}),
          ...(selectedDetails.userRatingsTotal != null && selectedDetails.userRatingsTotal > 0
            ? { placeUserRatingsTotal: selectedDetails.userRatingsTotal }
            : {}),
          googlePlaceId: selectedPlaceId,
        });
        const merged = await getStopsForTrip(trip.tripId);
        const sorted = sortStopsByRoute(merged, freshTrip.startDate ?? '');
        await reorderStops(trip.tripId, sorted.map((s) => s.stopId), uid);
        try {
          await recalculateLegsForTrip(trip.tripId);
        } catch {
          /* mesafe güncellenemese de durak eklendi */
        }
        setAddTripModalOpen(false);
        props.onClose();
        props.onOpenTrip(trip.tripId);
        Alert.alert('Eklendi', 'Durak seçtiğin güne ve rotanın sonuna eklendi. Gerekirse sırayı rota detayından değiştir.');
      } catch (e: any) {
        Alert.alert('Hata', e?.message || 'Durak eklenemedi.');
      } finally {
        setAddStopBusy(false);
      }
    },
    [uid, selectedDetails, selectedPlaceId, props]
  );

  const handleSavePlace = useCallback(async () => {
    if (!uid) {
      Alert.alert('Giriş gerekli', 'Kaydetmek için oturum açın.');
      return;
    }
    if (!selectedDetails || !selectedPlaceId) {
      Alert.alert('Eksik', 'Yer bilgisi yok.');
      return;
    }
    setSaveBusy(true);
    try {
      await upsertSavedPlaceForUser(uid, {
        googlePlaceId: selectedPlaceId,
        displayName: selectedDetails.name,
        latitude: selectedDetails.latitude,
        longitude: selectedDetails.longitude,
        formattedAddress: selectedDetails.formattedAddress,
      });
      setSavedPlaceIds((prev) => new Set(prev).add(selectedPlaceId));
      Alert.alert('Kaydedildi', 'Profil → Kaydedilen yerler bölümünden tekrar açabilirsin.');
    } catch (e: any) {
      Alert.alert('Hata', e?.message || 'Kaydedilemedi.');
    } finally {
      setSaveBusy(false);
    }
  }, [uid, selectedDetails, selectedPlaceId]);

  const handleNewRoute = useCallback(() => {
    if (!selectedDetails || !selectedPlaceId) return;
    const payload = buildSecondStopPayload(selectedDetails, selectedPlaceId);
    props.onClose();
    props.onNavigateCreateTripWithSecondStop(payload);
  }, [selectedDetails, selectedPlaceId, props]);

  const ratingParts = selectedDetails
    ? getGooglePlaceRatingParts(selectedDetails.rating, selectedDetails.userRatingsTotal)
    : null;

  const discoverActions =
    phase === 'spotlight' && selectedDetails && selectedPlaceId ? (
      <View style={styles.discoverActions}>
        <Text style={styles.discoverActionsTitle}>Ne yapmak istersin?</Text>
        <Pressable
          onPress={() => void handleSavePlace()}
          disabled={saveBusy || savedPlaceIds.has(selectedPlaceId)}
          style={({ pressed }) => [
            styles.actionBtn,
            (saveBusy || savedPlaceIds.has(selectedPlaceId)) && styles.actionBtnDisabled,
            pressed && { opacity: 0.9 },
          ]}
        >
          <Ionicons name="bookmark-outline" size={20} color={ACCENT} />
          <Text style={styles.actionBtnText}>
            {savedPlaceIds.has(selectedPlaceId) ? 'Zaten kayıtlı' : saveBusy ? 'Kaydediliyor…' : 'Kaydet'}
          </Text>
        </Pressable>
        <Pressable
          onPress={handleNewRoute}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.9 }]}
        >
          <Ionicons name="map-outline" size={20} color={ACCENT} />
          <Text style={styles.actionBtnText}>Yeni rota oluştur</Text>
        </Pressable>
        <Pressable
          onPress={() => void openAddToTripModal()}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.9 }]}
        >
          <Ionicons name="git-merge-outline" size={20} color={ACCENT} />
          <Text style={styles.actionBtnText}>Mevcut rotaya ekle</Text>
        </Pressable>
      </View>
    ) : null;

  return (
    <Modal
      visible={props.visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'fullScreen' : undefined}
      onRequestClose={handleModalClose}
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            onPress={handleModalClose}
            style={({ pressed }) => [styles.headerIconBtn, pressed && { opacity: 0.85 }]}
            accessibilityLabel="Kapat"
          >
            <Ionicons name="close" size={26} color={TEXT} />
          </Pressable>
          <View style={styles.headerTitleBlock}>
            <Text style={styles.headerTitle}>Yer keşfet</Text>
            {phase === 'search' ? (
              <Text style={styles.headerSub}>Yer ara, seç; sunum açılır</Text>
            ) : null}
          </View>
          {phase === 'spotlight' ? (
            <Pressable
              onPress={goBackToSearch}
              style={({ pressed }) => [styles.headerTextBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.headerTextBtnLabel}>Başka yer</Text>
            </Pressable>
          ) : (
            <View style={{ width: 44 }} />
          )}
        </View>

        {phase === 'search' ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={styles.searchScroll}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.searchHint}>
              Mekân veya adres yaz; listeden seç. Özet ve yorumlar rota sunumundaki gibi yüklenir.
            </Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Örn. Galata Kulesi, İstanbul"
              placeholderTextColor="rgba(148, 163, 184, 0.65)"
              style={styles.input}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {loadingSearch ? <ActivityIndicator color={ACCENT} style={{ marginVertical: 12 }} /> : null}
            {suggestions.map((p) => (
              <Pressable
                key={p.placeId}
                onPress={() => void handleSelectPrediction(p.placeId)}
                style={({ pressed }) => [styles.suggestionRow, pressed && { opacity: 0.88 }]}
              >
                <Ionicons name="location-outline" size={18} color={ACCENT} style={{ marginRight: 10 }} />
                <Text style={styles.suggestionText}>{p.description}</Text>
              </Pressable>
            ))}
            {query.trim() && !loadingSearch && suggestions.length === 0 && !error ? (
              <Text style={styles.muted}>Sonuç yok; farklı anahtar kelime deneyin.</Text>
            ) : null}
          </ScrollView>
        ) : null}

        {phase === 'loading' ? (
          <View style={styles.centerBlock}>
            <ActivityIndicator size="large" color={ACCENT} />
            <Text style={styles.loadingText}>Özet ve görseller hazırlanıyor…</Text>
          </View>
        ) : null}

        {phase === 'spotlight' && spotlightPayload ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.spotlightScroll}
          >
            {selectedDetails?.formattedAddress ? (
              <View style={styles.addrBar}>
                <Text style={styles.addrText} numberOfLines={3}>
                  {selectedDetails.formattedAddress}
                </Text>
                {ratingParts ? (
                  <Text style={styles.ratingMini}>
                    <Text style={styles.star}>★</Text> {ratingParts.valueText}
                  </Text>
                ) : null}
              </View>
            ) : null}
            <PresentationStopSlide
              item={spotlightPayload}
              width={width}
              appInfoReplacement={discoverActions}
            />
          </ScrollView>
        ) : null}

        <Modal
          visible={addTripModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => !addStopBusy && setAddTripModalOpen(false)}
        >
          <Pressable style={styles.addTripOverlay} onPress={() => !addStopBusy && setAddTripModalOpen(false)}>
            <Pressable style={styles.addTripSheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.addTripTitle}>
                {pickerTrip ? 'Gün seçin' : 'Rotaya ekle'}
              </Text>
              {tripsLoading ? (
                <ActivityIndicator color={ACCENT} style={{ marginVertical: 20 }} />
              ) : pickerTrip ? (
                <>
                  <Text style={styles.addTripSub} numberOfLines={2}>
                    {pickerTrip.title?.trim() || 'Rota'}
                  </Text>
                  <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                    {eachTripDayYmd(pickerTrip.startDate ?? '', pickerTrip.endDate ?? pickerTrip.startDate ?? '').map(
                      (ymd) => (
                        <Pressable
                          key={ymd}
                          disabled={addStopBusy}
                          onPress={() => void confirmAddStopToTrip(pickerTrip, ymd)}
                          style={({ pressed }) => [styles.dayRow, pressed && { opacity: 0.85 }]}
                        >
                          <Text style={styles.dayRowText}>{formatDayChip(ymd)}</Text>
                          <Text style={styles.dayRowYmd}>{ymd}</Text>
                        </Pressable>
                      )
                    )}
                  </ScrollView>
                  <Pressable
                    onPress={() => setPickerTrip(null)}
                    disabled={addStopBusy}
                    style={styles.addTripBack}
                  >
                    <Text style={styles.addTripBackText}>← Rota listesi</Text>
                  </Pressable>
                </>
              ) : tripsForPicker.length === 0 ? (
                <Text style={styles.addTripEmpty}>Önce ana sayfadan bir rota oluşturun.</Text>
              ) : (
                <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                  {tripsForPicker.map((t) => (
                    <Pressable
                      key={t.tripId}
                      onPress={() => setPickerTrip(t)}
                      style={({ pressed }) => [styles.tripPickRow, pressed && { opacity: 0.88 }]}
                    >
                      <Text style={styles.tripPickTitle} numberOfLines={2}>
                        {t.title?.trim() || 'Adsız rota'}
                      </Text>
                      <Text style={styles.tripPickMeta} numberOfLines={1}>
                        {t.startDate} → {t.endDate}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              {addStopBusy ? (
                <ActivityIndicator color={ACCENT} style={{ marginTop: 12 }} />
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </Modal>
  );
}

function createStyles() {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: BG },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(148, 163, 184, 0.15)',
    },
    headerIconBtn: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleBlock: { flex: 1, alignItems: 'center' },
    headerTitle: { color: TEXT, fontSize: 17, fontWeight: '900' },
    headerSub: { color: MUTED, fontSize: 11, fontWeight: '600', marginTop: 2 },
    headerTextBtn: { paddingVertical: 10, paddingHorizontal: 8, minWidth: 88, alignItems: 'flex-end' },
    headerTextBtnLabel: { color: ACCENT, fontSize: 13, fontWeight: '800' },
    searchScroll: { padding: 20, paddingBottom: 40 },
    searchHint: { color: MUTED, fontSize: 13, lineHeight: 20, marginBottom: 16 },
    input: {
      backgroundColor: CARD,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: 'rgba(56, 189, 248, 0.22)',
      paddingVertical: 14,
      paddingHorizontal: 16,
      color: TEXT,
      fontSize: 16,
      fontWeight: '600',
    },
    error: { color: '#fca5a5', marginTop: 12, fontSize: 14 },
    muted: { color: MUTED, marginTop: 16, fontSize: 14 },
    suggestionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 12,
      marginTop: 8,
      borderRadius: 14,
      backgroundColor: CARD,
      borderWidth: 1,
      borderColor: 'rgba(148, 163, 184, 0.12)',
    },
    suggestionText: { flex: 1, color: TEXT, fontSize: 15, fontWeight: '600' },
    centerBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
    loadingText: { color: MUTED, fontSize: 15, fontWeight: '600' },
    spotlightScroll: { paddingBottom: 32 },
    addrBar: {
      marginHorizontal: 20,
      marginTop: 8,
      marginBottom: 4,
      padding: 14,
      borderRadius: 16,
      backgroundColor: 'rgba(30, 41, 59, 0.85)',
      borderWidth: 1,
      borderColor: 'rgba(56, 189, 248, 0.14)',
    },
    addrText: { color: MUTED, fontSize: 13, lineHeight: 19, fontWeight: '600' },
    ratingMini: { color: MUTED, fontSize: 12, marginTop: 8, fontWeight: '700' },
    star: { color: '#fbbf24' },
    discoverActions: {
      marginTop: 4,
      marginBottom: 8,
      gap: 10,
    },
    discoverActionsTitle: {
      color: ACCENT,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 16,
      backgroundColor: 'rgba(30, 41, 59, 0.85)',
      borderWidth: 1,
      borderColor: 'rgba(56, 189, 248, 0.22)',
    },
    actionBtnDisabled: { opacity: 0.55 },
    actionBtnText: { color: TEXT, fontSize: 15, fontWeight: '800', flex: 1 },
    addTripOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      padding: 24,
    },
    addTripSheet: {
      backgroundColor: CARD,
      borderRadius: 20,
      padding: 20,
      borderWidth: 1,
      borderColor: 'rgba(56, 189, 248, 0.2)',
    },
    addTripTitle: { color: TEXT, fontSize: 18, fontWeight: '900', marginBottom: 8 },
    addTripSub: { color: MUTED, fontSize: 14, fontWeight: '600', marginBottom: 12 },
    addTripEmpty: { color: MUTED, fontSize: 15, marginVertical: 16 },
    tripPickRow: {
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderRadius: 14,
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      marginBottom: 10,
      borderWidth: 1,
      borderColor: 'rgba(148, 163, 184, 0.12)',
    },
    tripPickTitle: { color: TEXT, fontSize: 16, fontWeight: '800' },
    tripPickMeta: { color: MUTED, fontSize: 12, marginTop: 4, fontWeight: '600' },
    dayRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      marginBottom: 8,
      borderWidth: 1,
      borderColor: 'rgba(56, 189, 248, 0.12)',
    },
    dayRowText: { color: TEXT, fontSize: 15, fontWeight: '800' },
    dayRowYmd: { color: MUTED, fontSize: 12, fontWeight: '600' },
    addTripBack: { marginTop: 12, paddingVertical: 8 },
    addTripBackText: { color: ACCENT, fontSize: 14, fontWeight: '800' },
  });
}
