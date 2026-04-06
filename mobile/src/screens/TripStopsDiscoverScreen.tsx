import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Screen } from '../components/Screen';
import { auth } from '../lib/firebase';
import { addDiscoverSuggestionToTrip, canUserAddStopToTrip } from '../services/addDiscoverSuggestionToTrip';
import { getStopsForTrip, getTrip } from '../services/trips';
import {
  type DiscoverRegionBlock,
  fetchTripStopsDiscoverData,
  isTripStopsDiscoverSupported,
  openDiscoverPlaceInMaps,
  type DiscoverPlaceSuggestion,
} from '../services/tripStopsDiscover';
import type { Stop, Trip } from '../types/trip';
import { formatGooglePlaceRatingLine } from '../services/places';
import { eachTripDayYmd, formatTripDayChipTr } from '../utils/tripDayRange';
import { sortStopsByRoute } from '../utils/tripSchedule';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';

type DiscoverTab = 'restaurant' | 'lodging' | 'activity';

function pickPlaces(block: DiscoverRegionBlock, tab: DiscoverTab): DiscoverPlaceSuggestion[] {
  if (tab === 'restaurant') return block.restaurants;
  if (tab === 'lodging') return block.hotels;
  return block.activities;
}

function PlaceRow(props: {
  place: DiscoverPlaceSuggestion;
  styles: ReturnType<typeof createStyles>;
  showAddButton: boolean;
  onAddToTrip: (place: DiscoverPlaceSuggestion) => void;
}) {
  const theme = useAppTheme();
  const { place, styles, showAddButton, onAddToTrip } = props;
  const ratingLine = formatGooglePlaceRatingLine(place.rating, place.userRatingsTotal);
  return (
    <View style={styles.placeCard}>
      <View style={styles.placeCardRow}>
        {place.photoUrl ? (
          <Image
            source={{ uri: place.photoUrl }}
            style={styles.placeThumbImage}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={styles.placeThumbPlaceholder}>
            <Ionicons name="image-outline" size={26} color={theme.color.muted} />
          </View>
        )}
        <View style={styles.placeCardBody}>
          <View style={styles.placeCardTop}>
            <Text style={styles.placeName} numberOfLines={2}>
              {place.name}
            </Text>
            {ratingLine ? (
              <View style={styles.ratingPill}>
                <Text style={styles.ratingPillText}>{ratingLine}</Text>
              </View>
            ) : null}
          </View>
          {place.vicinity ? (
            <Text style={styles.placeVicinity} numberOfLines={2}>
              {place.vicinity}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.placeActionsRow}>
        <Pressable
          onPress={() => void openDiscoverPlaceInMaps(place)}
          style={({ pressed }) => [styles.placeActionBtn, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel={`${place.name}, Google Haritalar’da aç`}
        >
          <Ionicons name="map-outline" size={16} color={theme.color.primary} />
          <Text style={styles.placeActionText}>Haritada aç</Text>
        </Pressable>
        {showAddButton ? (
          <Pressable
            onPress={() => onAddToTrip(place)}
            style={({ pressed }) => [styles.placeActionBtnPrimary, pressed && { opacity: 0.88 }]}
            accessibilityRole="button"
            accessibilityLabel={`${place.name}, rotaya ekle`}
          >
            <Ionicons name="add-circle-outline" size={17} color={theme.color.primaryDark} />
            <Text style={styles.placeActionTextPrimary}>Rotaya ekle</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function TripStopsDiscoverScreen(props: {
  tripId: string;
  onBack: () => void;
  /** Durak eklendikten sonra (ör. rota detayına dön) */
  onAfterStopAdded?: () => void;
}) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const uid = auth.currentUser?.uid;
  const [tab, setTab] = useState<DiscoverTab>('restaurant');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regions, setRegions] = useState<DiscoverRegionBlock[]>([]);
  const [stopsNoCoords, setStopsNoCoords] = useState(0);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [pendingAdd, setPendingAdd] = useState<DiscoverPlaceSuggestion | null>(null);
  const [addStopBusy, setAddStopBusy] = useState(false);

  const canAddStops = Boolean(trip && uid && canUserAddStopToTrip(trip, uid));

  const tripDayOptions = useMemo(() => {
    if (!trip) return [];
    return eachTripDayYmd(trip.startDate ?? '', trip.endDate ?? trip.startDate ?? '');
  }, [trip]);

  const load = useCallback(async () => {
    if (!isTripStopsDiscoverSupported()) {
      setError('Bu özellik web tarayıcısında desteklenmiyor. Android veya iOS uygulamasını kullanın.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const t = await getTrip(props.tripId);
      if (!t) {
        setError('Rota bulunamadı.');
        setRegions([]);
        setTrip(null);
        return;
      }
      setTrip(t);
      const rawStops: Stop[] = await getStopsForTrip(props.tripId);
      const ordered = sortStopsByRoute(rawStops, t.startDate ?? '');
      const noCoord = ordered.filter(
        (s) =>
          !s.coords ||
          !Number.isFinite(s.coords.latitude) ||
          !Number.isFinite(s.coords.longitude)
      ).length;
      setStopsNoCoords(noCoord);
      const data = await fetchTripStopsDiscoverData(props.tripId, ordered);
      setRegions(data);
    } catch (e: any) {
      setError(e?.message || 'Öneriler yüklenemedi.');
      setRegions([]);
      setTrip(null);
    } finally {
      setLoading(false);
    }
  }, [props.tripId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openAddModal = useCallback(
    (place: DiscoverPlaceSuggestion) => {
      if (!uid) {
        Alert.alert('Giriş', 'Durak eklemek için oturum açmalısınız.');
        return;
      }
      if (!trip) return;
      if (!canUserAddStopToTrip(trip, uid)) {
        Alert.alert('Yetki yok', 'Bu rotaya yalnızca yönetici veya editör durak ekleyebilir.');
        return;
      }
      if (tripDayOptions.length === 0) {
        Alert.alert('Tarih yok', 'Rotada geçerli başlangıç/bitiş tarihi olmadığı için gün seçilemiyor.');
        return;
      }
      setPendingAdd(place);
    },
    [uid, trip, tripDayOptions.length]
  );

  const confirmAddOnDay = useCallback(
    async (ymd: string) => {
      if (!uid || !pendingAdd) return;
      setAddStopBusy(true);
      try {
        await addDiscoverSuggestionToTrip({
          tripId: props.tripId,
          uid,
          stopDateYmd: ymd,
          suggestion: pendingAdd,
        });
        setPendingAdd(null);
        Alert.alert(
          'Eklendi',
          'Öneri seçtiğin güne eklendi. Sırayı ve onayı rota detayından düzenleyebilirsin.'
        );
        props.onAfterStopAdded?.();
      } catch (e: any) {
        Alert.alert('Hata', e?.message || 'Durak eklenemedi.');
      } finally {
        setAddStopBusy(false);
      }
    },
    [uid, pendingAdd, props.tripId, props.onAfterStopAdded]
  );

  const tabLabel: Record<DiscoverTab, string> = {
    restaurant: 'Restoran',
    lodging: 'Otel',
    activity: 'Aktivite',
  };

  return (
    <Screen safeAreaEdges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={props.onBack} style={styles.backBtn} accessibilityRole="button">
          <Text style={styles.backText}>← Geri</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Durakları keşfet</Text>
        <Text style={styles.headerSub}>
          En az 100 Google yorumu olan yerler; bölgelere göre öneriler. «Rotaya ekle» ile gün seçip durak
          oluşturabilirsin (yönetici/editör).
        </Text>
      </View>

      <View style={styles.tabRow}>
        {(['restaurant', 'lodging', 'activity'] as const).map((k) => (
          <Pressable
            key={k}
            onPress={() => setTab(k)}
            style={[styles.tabBtn, tab === k && styles.tabBtnActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === k }}
          >
            <Text style={[styles.tabBtnText, tab === k && styles.tabBtnTextActive]}>{tabLabel[k]}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.color.primary} />
          <Text style={styles.loadingHint}>Bölgeler ve öneriler yükleniyor…</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load()} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Yeniden dene</Text>
          </Pressable>
        </View>
      ) : regions.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Konumlu durak yok</Text>
          <Text style={styles.emptySub}>
            Öneriler için durakların haritadan seçilmiş konumu olmalı. Durak eklerken yer araması kullanın.
          </Text>
          {stopsNoCoords > 0 ? (
            <Text style={styles.emptyMeta}>{stopsNoCoords} durakta konum bilgisi eksik.</Text>
          ) : null}
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {stopsNoCoords > 0 ? (
            <View style={styles.warnBanner}>
              <Ionicons name="information-circle-outline" size={18} color={theme.color.primaryDark} />
              <Text style={styles.warnBannerText}>
                {stopsNoCoords} durak konumsuz; yalnızca haritadan seçilmiş duraklar bölgelere dahil edilir.
              </Text>
            </View>
          ) : null}
          {regions.map((block, ri) => {
            const places = pickPlaces(block, tab);
            return (
              <View key={`${block.title}-${ri}`} style={styles.regionBlock}>
                <Text style={styles.regionTitle}>{block.title}</Text>
                {block.stopNames.length > 0 ? (
                  <Text style={styles.regionStops} numberOfLines={4}>
                    Duraklar: {block.stopNames.join(' · ')}
                  </Text>
                ) : null}
                {places.length === 0 ? (
                  <Text style={styles.regionEmpty}>Bu kategoride 100+ yorumlu yakın yer bulunamadı.</Text>
                ) : (
                  places.map((p) => (
                    <PlaceRow
                      key={p.placeId}
                      place={p}
                      styles={styles}
                      showAddButton={canAddStops}
                      onAddToTrip={openAddModal}
                    />
                  ))
                )}
              </View>
            );
          })}
          {Platform.OS !== 'web' ? (
            <Text style={styles.legalFoot}>
              Sonuçlar Google tarafından sağlanır; sıralama ve puanlar anlık API verisine göredir.
            </Text>
          ) : null}
        </ScrollView>
      )}

      <Modal
        visible={pendingAdd != null}
        transparent
        animationType="fade"
        onRequestClose={() => !addStopBusy && setPendingAdd(null)}
      >
        <Pressable style={styles.addModalOverlay} onPress={() => !addStopBusy && setPendingAdd(null)}>
          <Pressable style={styles.addModalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.addModalTitle}>Hangi güne eklensin?</Text>
            {pendingAdd ? (
              <Text style={styles.addModalPlaceName} numberOfLines={2}>
                {pendingAdd.name}
              </Text>
            ) : null}
            <ScrollView style={styles.addModalDayList} showsVerticalScrollIndicator={false}>
              {tripDayOptions.map((ymd) => (
                <Pressable
                  key={ymd}
                  disabled={addStopBusy}
                  onPress={() => void confirmAddOnDay(ymd)}
                  style={({ pressed }) => [styles.addModalDayRow, pressed && { opacity: 0.88 }]}
                >
                  <Text style={styles.addModalDayLabel}>{formatTripDayChipTr(ymd)}</Text>
                  <Text style={styles.addModalDayYmd}>{ymd}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              disabled={addStopBusy}
              onPress={() => setPendingAdd(null)}
              style={styles.addModalCancel}
            >
              <Text style={styles.addModalCancelText}>Vazgeç</Text>
            </Pressable>
            {addStopBusy ? (
              <ActivityIndicator style={{ marginTop: 8 }} color={theme.color.primary} />
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    header: {
      paddingHorizontal: theme.space.md,
      paddingBottom: theme.space.sm,
    },
    backBtn: { alignSelf: 'flex-start', paddingVertical: 6, marginBottom: 4 },
    backText: { color: theme.color.primaryDark, fontSize: theme.font.body, fontWeight: '800' },
    headerTitle: {
      color: theme.color.text,
      fontSize: theme.font.h2,
      fontWeight: '900',
      marginBottom: 6,
    },
    headerSub: { color: theme.color.muted, fontSize: theme.font.small, lineHeight: 20 },
    tabRow: {
      flexDirection: 'row',
      marginHorizontal: theme.space.md,
      marginBottom: theme.space.md,
      gap: 8,
      backgroundColor: theme.color.inputBg,
      borderRadius: theme.radius.lg,
      padding: 4,
      borderWidth: 1,
      borderColor: theme.color.border,
    },
    tabBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: theme.radius.md,
      alignItems: 'center',
    },
    tabBtnActive: {
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.primary,
      ...theme.shadowSoft,
    },
    tabBtnText: {
      fontSize: theme.font.small,
      fontWeight: '800',
      color: theme.color.muted,
    },
    tabBtnTextActive: { color: theme.color.primaryDark },
    scroll: { flex: 1, alignSelf: 'stretch', width: '100%' },
    scrollContent: {
      paddingHorizontal: theme.space.md,
      paddingBottom: theme.space.xl,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: theme.space.lg,
    },
    loadingHint: {
      marginTop: theme.space.md,
      color: theme.color.muted,
      fontSize: theme.font.small,
      fontWeight: '600',
    },
    errorText: {
      color: theme.color.danger,
      textAlign: 'center',
      fontSize: theme.font.body,
      fontWeight: '700',
      marginBottom: theme.space.md,
    },
    retryBtn: {
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.primarySoft,
      borderWidth: 1,
      borderColor: theme.color.primary,
    },
    retryBtnText: { color: theme.color.primaryDark, fontWeight: '800' },
    emptyTitle: {
      fontSize: theme.font.h2,
      fontWeight: '900',
      color: theme.color.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    emptySub: {
      color: theme.color.muted,
      fontSize: theme.font.small,
      lineHeight: 22,
      textAlign: 'center',
    },
    emptyMeta: { marginTop: theme.space.sm, color: theme.color.textSecondary, fontSize: theme.font.tiny },
    warnBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      padding: theme.space.sm,
      borderRadius: theme.radius.md,
      backgroundColor: theme.color.primarySoft,
      borderWidth: 1,
      borderColor: theme.color.cardBorderPrimary,
      marginBottom: theme.space.md,
    },
    warnBannerText: {
      flex: 1,
      color: theme.color.textSecondary,
      fontSize: theme.font.tiny,
      fontWeight: '600',
      lineHeight: 18,
    },
    regionBlock: {
      marginBottom: theme.space.lg,
    },
    regionTitle: {
      fontSize: theme.font.body,
      fontWeight: '900',
      color: theme.color.text,
      marginBottom: 4,
    },
    regionStops: {
      fontSize: theme.font.tiny,
      color: theme.color.muted,
      marginBottom: theme.space.sm,
      lineHeight: 18,
    },
    regionEmpty: {
      fontSize: theme.font.small,
      color: theme.color.textSecondary,
      fontStyle: 'italic',
      marginTop: 4,
    },
    placeCard: {
      marginBottom: theme.space.sm,
      padding: theme.space.md,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.cardBorderPrimary,
      ...theme.shadowCard,
    },
    placeCardRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: theme.space.md,
    },
    placeThumbImage: {
      width: 72,
      height: 72,
      borderRadius: theme.radius.md,
      backgroundColor: theme.color.inputBg,
    },
    placeThumbPlaceholder: {
      width: 72,
      height: 72,
      borderRadius: theme.radius.md,
      backgroundColor: theme.color.inputBg,
      borderWidth: 1,
      borderColor: theme.color.subtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    placeCardBody: {
      flex: 1,
      minWidth: 0,
    },
    placeCardTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: theme.space.sm,
    },
    placeName: {
      flex: 1,
      fontSize: theme.font.body,
      fontWeight: '800',
      color: theme.color.text,
    },
    ratingPill: {
      backgroundColor: theme.color.inputBg,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.color.subtle,
    },
    ratingPillText: {
      fontSize: theme.font.tiny,
      fontWeight: '800',
      color: theme.color.primaryDark,
    },
    placeVicinity: {
      marginTop: 6,
      fontSize: theme.font.tiny,
      color: theme.color.muted,
      lineHeight: 18,
    },
    placeActionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.space.sm,
      marginTop: theme.space.sm,
      paddingTop: theme.space.sm,
      borderTopWidth: 1,
      borderTopColor: theme.color.subtle,
    },
    placeActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.color.primary,
      backgroundColor: theme.color.primarySoft,
    },
    placeActionBtnPrimary: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.color.cardBorderAccent,
      backgroundColor: theme.color.inputBg,
    },
    placeActionText: {
      fontSize: theme.font.small,
      fontWeight: '800',
      color: theme.color.primaryDark,
    },
    placeActionTextPrimary: {
      fontSize: theme.font.small,
      fontWeight: '900',
      color: theme.color.text,
    },
    legalFoot: {
      marginTop: theme.space.md,
      fontSize: 10,
      color: theme.color.muted,
      lineHeight: 15,
      textAlign: 'center',
    },
    addModalOverlay: {
      flex: 1,
      backgroundColor: theme.color.overlayDark,
      justifyContent: 'center',
      padding: theme.space.lg,
    },
    addModalSheet: {
      borderRadius: theme.radius.xl,
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.cardBorderPrimary,
      padding: theme.space.lg,
      maxHeight: '70%',
      ...theme.shadowCard,
    },
    addModalTitle: {
      fontSize: theme.font.body,
      fontWeight: '900',
      color: theme.color.text,
      marginBottom: 6,
    },
    addModalPlaceName: {
      fontSize: theme.font.small,
      color: theme.color.muted,
      marginBottom: theme.space.md,
      lineHeight: 20,
    },
    addModalDayList: {
      maxHeight: 280,
    },
    addModalDayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: theme.space.sm,
      borderRadius: theme.radius.md,
      backgroundColor: theme.color.inputBg,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: theme.color.subtle,
    },
    addModalDayLabel: {
      fontSize: theme.font.body,
      fontWeight: '800',
      color: theme.color.text,
    },
    addModalDayYmd: {
      fontSize: theme.font.tiny,
      color: theme.color.muted,
      fontWeight: '600',
    },
    addModalCancel: {
      alignSelf: 'center',
      marginTop: theme.space.sm,
      paddingVertical: 10,
    },
    addModalCancelText: {
      fontSize: theme.font.small,
      fontWeight: '800',
      color: theme.color.primaryDark,
    },
  });
}
