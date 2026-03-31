import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import {
  getGooglePlaceRatingParts,
  getPlaceDetails,
  searchPlaces,
} from '../services/places';
import type { PlaceDetails as PlaceDetailsType, PlacePrediction } from '../services/places';
import { fetchPresentationWebForPlaceSpotlight } from '../utils/stopWebEnrichment';
import type { StopPresentationPayload } from '../utils/presentationModel';
import { PresentationStopSlide } from '../screens/TripPresentationScreen';

const BG = '#0B1220';
const CARD = '#111827';
const TEXT = '#F1F5F9';
const MUTED = '#94A3B8';
const ACCENT = '#38BDF8';
const DEBOUNCE_MS = 420;

type Phase = 'search' | 'loading' | 'spotlight';

function buildSpotlightPayload(
  details: PlaceDetailsType,
  placeId: string | undefined,
  web: Awaited<ReturnType<typeof fetchPresentationWebForPlaceSpotlight>>
): StopPresentationPayload {
  const rating = details.rating != null && details.rating > 0 ? details.rating : undefined;
  const total =
    details.userRatingsTotal != null && details.userRatingsTotal > 0
      ? details.userRatingsTotal
      : undefined;
  return {
    stopId: placeId ?? 'spotlight',
    routeIndex: 1,
    title: details.name,
    dayLabel: '',
    stopRestDisplay: '—',
    legKm: undefined,
    legMin: undefined,
    extrasSummary: '—',
    stopTotalTl: 0,
    placeRating: rating,
    placeUserRatingsTotal: total,
    coords: { latitude: details.latitude, longitude: details.longitude },
    legModeLabel: 'Keşif',
    summaryBullets: web.summaryBullets,
    summarySourceLine: web.summarySourceLine,
    summarySourceUrl: web.summarySourceUrl,
    summaryWikipediaPageTitle: web.summaryWikipediaPageTitle,
    reviewBullets: web.reviewBullets,
    reviewSourceLine: web.reviewSourceLine,
    heroImageUrl: web.heroImageUrl,
    webFromGooglePlaces: web.fromGooglePlaces ?? false,
    webLoading: false,
  };
}

type Props = {
  visible: boolean;
  onClose: () => void;
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

  const styles = useMemo(() => createStyles(), []);

  const resetAll = useCallback(() => {
    setPhase('search');
    setQuery('');
    setSuggestions([]);
    setError(null);
    setSelectedPlaceId(null);
    setSelectedDetails(null);
    setSpotlightPayload(null);
    setLoadingSearch(false);
  }, []);

  useEffect(() => {
    if (!props.visible) {
      resetAll();
      return;
    }
  }, [props.visible, resetAll]);

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
      setSpotlightPayload(buildSpotlightPayload(details, placeId, web));
      setPhase('spotlight');
    } catch (e: any) {
      setError(e?.message || 'Yer yüklenemedi.');
      setPhase('search');
    }
  }, []);

  const goBackToSearch = useCallback(() => {
    setPhase('search');
    setSpotlightPayload(null);
    setSelectedDetails(null);
    setSelectedPlaceId(null);
    setSuggestions([]);
    setQuery('');
  }, []);

  const handleModalClose = useCallback(() => {
    props.onClose();
  }, [props]);

  const ratingParts = selectedDetails
    ? getGooglePlaceRatingParts(selectedDetails.rating, selectedDetails.userRatingsTotal)
    : null;

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
            showsVerticalScrollIndicator
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
            <PresentationStopSlide item={spotlightPayload} width={width} />
          </ScrollView>
        ) : null}
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
  });
}
