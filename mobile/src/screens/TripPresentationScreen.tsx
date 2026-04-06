import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ListRenderItem,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type ImageStyle,
  type ViewToken,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getStopsForTrip, getTrip } from '../services/trips';
import {
  formatDrivingDurationMinutes,
  formatTripScheduleSummary,
  sortStopsByRoute,
} from '../utils/tripSchedule';
import { buildPlanStopRows } from '../utils/planSummaryExport';
import { buildStopPresentationPayloads, type StopPresentationPayload } from '../utils/presentationModel';
import { NativeMapSection } from '../components/NativeMapSection';
import { enrichPresentationPayloads } from '../utils/stopPresentationEnrichment';
import { routeOverviewStaticMapUrl, staticMapPreviewUrlFallback } from '../utils/stopWebEnrichment';
import { GOOGLE_PLACE_RATING_STAR_COLOR } from '../services/places';
import type { Stop, Trip } from '../types/trip';

const BG = '#0B1220';
const CARD = '#111827';
const ACCENT = '#38BDF8';
const TEXT = '#F1F5F9';
const MUTED = '#94A3B8';
const CHIP_ORANGE = 'rgba(249, 115, 22, 0.28)';
const ORBIT_SIZE = 64;
const ORBIT_ACTIVE = 78;
const ORBIT_GAP = 10;
/** Daire + tek satır etiket + padding; dar ekranda taşmayı önler (kahraman görsel üst üste binmesin). */
const ORBIT_BAND_HEIGHT =
  16 + 4 + ORBIT_ACTIVE + 4 + 22 + 12;

const INTRO_ROW_KEY = '__presentation_intro__';

type PresentationRow =
  | { rowKey: typeof INTRO_ROW_KEY; kind: 'intro' }
  | { rowKey: string; kind: 'stop'; payload: StopPresentationPayload };

type TripTotalsForIntro = {
  stopCount: number;
  totalLegKm: number;
  totalLegMin: number;
  extrasSum: number;
  fuel: number;
  grand: number;
};

function buildTripTotals(trip: Trip, pages: StopPresentationPayload[]): TripTotalsForIntro {
  const totalLegKm = Math.round(pages.reduce((s, p) => s + (p.legKm ?? 0), 0) * 10) / 10;
  const totalLegMin = pages.reduce((s, p) => s + (p.legMin ?? 0), 0);
  const extrasSum = pages.reduce((s, p) => s + p.stopTotalTl, 0);
  const fuel = trip.totalFuelCost != null && trip.totalFuelCost > 0 ? trip.totalFuelCost : 0;
  return {
    stopCount: pages.length,
    totalLegKm,
    totalLegMin,
    extrasSum,
    fuel,
    grand: extrasSum + fuel,
  };
}

function ResilientHeroImage({
  uri,
  fallbackUri,
  style,
}: {
  uri: string | undefined;
  /** Birincil URL (ör. Google Static / Wikimedia) düşerse sıradaki harita önizlemesi. */
  fallbackUri?: string;
  style: ImageStyle;
}) {
  const candidates = useMemo(
    () => [uri, fallbackUri].filter((x): x is string => Boolean(x && String(x).trim())),
    [uri, fallbackUri]
  );
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [uri, fallbackUri]);

  if (index >= candidates.length) {
    return (
      <LinearGradient
        colors={['#1e3a5f', '#0f172a']}
        style={[style, { alignItems: 'center', justifyContent: 'center' }]}
      >
        <Ionicons name="image-outline" size={48} color={MUTED} />
      </LinearGradient>
    );
  }
  return (
    <Image
      source={{ uri: candidates[index] }}
      style={style}
      resizeMode="cover"
      onError={() => setIndex((k) => k + 1)}
    />
  );
}

function ResilientOrbitImage({
  uri,
  size,
  routeIndex,
  active,
}: {
  uri: string | undefined;
  size: number;
  routeIndex: number;
  active: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const inner = size - 6;
  const r = inner / 2;
  if (!uri || failed) {
    return (
      <LinearGradient
        colors={['#1e3a5f', '#0f172a']}
        style={{
          width: inner,
          height: inner,
          borderRadius: r,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: MUTED, fontWeight: '900', fontSize: active ? 16 : 13 }}>{routeIndex}</Text>
      </LinearGradient>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={{ width: inner, height: inner, borderRadius: r }}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  );
}

function stopHasCoords(s: Stop): boolean {
  return (
    s.coords?.latitude != null &&
    s.coords?.longitude != null &&
    Number.isFinite(s.coords.latitude) &&
    Number.isFinite(s.coords.longitude)
  );
}

function IntroSlide({
  width,
  trip,
  totals,
  routeOrderedStops,
  routeMapUri,
  routeMapFallbackUri,
}: {
  width: number;
  trip: Trip;
  totals: TripTotalsForIntro;
  routeOrderedStops: Stop[];
  routeMapUri?: string | null;
  routeMapFallbackUri?: string | null;
}) {
  const sched = formatTripScheduleSummary(
    trip.startDate,
    trip.endDate,
    trip.startTime,
    trip.endTime
  );
  const driveLabel =
    totals.totalLegMin > 0 ? formatDrivingDurationMinutes(totals.totalLegMin) : null;
  const kmLabel =
    totals.totalLegKm > 0
      ? `~${totals.totalLegKm} km`
      : trip.totalDistance != null && trip.totalDistance > 0
        ? `${trip.totalDistance} km`
        : null;

  const hasCoords = routeOrderedStops.some(stopHasCoords);
  const useNativeRouteMap = Platform.OS !== 'web' && hasCoords;

  return (
    <View style={[slideStyles.page, { width }]}>
      {useNativeRouteMap ? (
        <View style={slideStyles.introRouteMapWrap}>
          <NativeMapSection
            embeddedPreview
            previewHeight={176}
            stops={routeOrderedStops}
          />
          <Text style={slideStyles.introRouteMapCaption} numberOfLines={1}>
            Rota haritası (özet)
          </Text>
        </View>
      ) : hasCoords && routeMapUri ? (
        <View style={slideStyles.introRouteMapWrap}>
          <ResilientHeroImage
            uri={routeMapUri}
            fallbackUri={routeMapFallbackUri ?? undefined}
            style={slideStyles.introRouteMapImg}
          />
          <Text style={slideStyles.introRouteMapCaption} numberOfLines={1}>
            Rota haritası (özet)
          </Text>
        </View>
      ) : null}
      <LinearGradient
        colors={['rgba(56, 189, 248, 0.22)', 'rgba(15, 23, 42, 0.95)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={slideStyles.introHero}
      >
        <View style={slideStyles.introIconWrap}>
          <Ionicons name="navigate-circle" size={44} color={ACCENT} />
        </View>
        <Text style={slideStyles.introKicker}>Rota özeti</Text>
        <Text style={slideStyles.introTitle} numberOfLines={3}>
          {trip.title?.trim() || 'Rota'}
        </Text>
        <Text style={slideStyles.introSchedule} numberOfLines={2}>
          {sched.combinedLine}
        </Text>
        {sched.timeLine ? (
          <Text style={slideStyles.introTimeHint} numberOfLines={1}>
            {sched.timeLine}
          </Text>
        ) : null}
      </LinearGradient>

      <View style={slideStyles.introStatGrid}>
        <View style={[slideStyles.introStatPill, slideStyles.introStatPillWide]}>
          <Ionicons name="location-outline" size={18} color={ACCENT} />
          <Text style={slideStyles.introStatText}>{totals.stopCount} durak</Text>
        </View>
        {kmLabel ? (
          <View style={slideStyles.introStatPill}>
            <Ionicons name="trail-sign-outline" size={18} color={ACCENT} />
            <Text style={slideStyles.introStatText}>{kmLabel}</Text>
          </View>
        ) : null}
        {driveLabel ? (
          <View style={slideStyles.introStatPill}>
            <Ionicons name="car-outline" size={18} color={ACCENT} />
            <Text style={slideStyles.introStatText}>{driveLabel}</Text>
          </View>
        ) : null}
        <View style={slideStyles.introStatPill}>
          <Ionicons name="wallet-outline" size={18} color="#fb923c" />
          <Text style={slideStyles.introStatText}>Ekstra {totals.extrasSum.toFixed(2)} ₺</Text>
        </View>
        {totals.fuel > 0 ? (
          <View style={slideStyles.introStatPill}>
            <Ionicons name="flame-outline" size={18} color="#38bdf8" />
            <Text style={slideStyles.introStatText}>Yakıt {totals.fuel.toFixed(2)} ₺</Text>
          </View>
        ) : null}
        <View style={[slideStyles.introStatPill, slideStyles.introStatPillAccent]}>
          <Ionicons name="calculator-outline" size={18} color={TEXT} />
          <Text style={slideStyles.introStatStrong}>Toplam ~{totals.grand.toFixed(2)} ₺</Text>
        </View>
      </View>

      {trip.vehicleLabel?.trim() ? (
        <View style={slideStyles.introVehicleBar}>
          <Ionicons name="bus-outline" size={16} color={MUTED} />
          <Text style={slideStyles.introVehicleText} numberOfLines={1}>
            {trip.vehicleLabel.trim()}
          </Text>
        </View>
      ) : null}

      <Text style={slideStyles.introSwipeHint}>Duraklar için kaydırın →</Text>
    </View>
  );
}

/** Rota sunumu ve Yer keşfet ortak gövde (özet + yorumlar aynı akış). */
export function PresentationStopSlide({
  item,
  width,
  appInfoReplacement,
}: {
  item: StopPresentationPayload;
  width: number;
  /** Yer keşfet: rota dışıyken metrikler + Google puan satırı yerine (ör. aksiyon butonları). */
  appInfoReplacement?: ReactElement | null;
}) {
  const visitLine =
    item.arrival || item.departure
      ? `Ziyaret: ${item.arrival ?? '—'} – ${item.departure ?? '—'}`
      : null;

  const mapHeroFallback =
    item.coords?.latitude != null &&
    item.coords?.longitude != null &&
    Number.isFinite(item.coords.latitude) &&
    Number.isFinite(item.coords.longitude)
      ? staticMapPreviewUrlFallback(item.coords.latitude, item.coords.longitude)
      : undefined;

  return (
    <View style={[slideStyles.page, { width }]}>
      <View style={slideStyles.slideCard}>
      <View style={slideStyles.heroWrap}>
        <ResilientHeroImage
          uri={item.heroImageUrl}
          fallbackUri={mapHeroFallback}
          style={slideStyles.heroImg}
        />
        {item.webLoading ? (
          <View style={slideStyles.heroLoading}>
            <ActivityIndicator color={ACCENT} />
          </View>
        ) : null}
      </View>

      <Text style={slideStyles.counter}>{item.routeIndex}</Text>
      <Text style={slideStyles.title} numberOfLines={3}>
        {item.title}
      </Text>
      <Text style={slideStyles.dayLine}>{item.dayLabel}</Text>

      {item.stopTotalTl > 0 ? (
        <View style={slideStyles.chipRow}>
          <View style={[slideStyles.chip, { backgroundColor: CHIP_ORANGE }]}>
            <Text style={slideStyles.chipText}>Durak: {item.stopTotalTl.toFixed(2)} ₺</Text>
          </View>
        </View>
      ) : null}

      {visitLine ? (
        <View style={slideStyles.visitBar}>
          <Text style={slideStyles.visitBarText}>{visitLine}</Text>
        </View>
      ) : null}

      {appInfoReplacement ? (
        appInfoReplacement
      ) : (
        <>
          <Text style={slideStyles.sectionLabel}>Uygulama bilgileri</Text>
          <View style={slideStyles.metricsRow}>
            <View style={slideStyles.metricTile}>
              <Ionicons name="time-outline" size={22} color={ACCENT} />
              <Text style={slideStyles.metricValue}>{item.stopRestDisplay}</Text>
              <Text style={slideStyles.metricLabel}>Durakta</Text>
            </View>
            <View style={slideStyles.metricTile}>
              <Ionicons name="navigate-outline" size={22} color={ACCENT} />
              <Text style={slideStyles.metricValue}>
                {item.legKm != null ? `${item.legKm} km` : '—'}
              </Text>
              <Text style={slideStyles.metricLabel}>{item.legModeLabel}</Text>
            </View>
            <View style={slideStyles.metricTile}>
              <Ionicons name="car-outline" size={22} color={ACCENT} />
              <Text style={slideStyles.metricValue}>
                {item.legMin != null ? `${item.legMin} dk` : '—'}
              </Text>
              <Text style={slideStyles.metricLabel}>Önceki durak</Text>
            </View>
          </View>
          {item.placeRating != null && item.placeRating > 0 ? (
            <View style={slideStyles.ratingRow}>
              <Ionicons
                name="star"
                size={16}
                color={GOOGLE_PLACE_RATING_STAR_COLOR}
                style={slideStyles.ratingStarIcon}
              />
              <Text style={slideStyles.ratingLine}>
                Google puanı (durak eklenirken kayıtlı): {item.placeRating.toFixed(1)}
                {item.placeUserRatingsTotal != null && item.placeUserRatingsTotal > 0
                  ? ` · ${item.placeUserRatingsTotal} yorum`
                  : ''}
              </Text>
            </View>
          ) : null}
        </>
      )}

      <Text style={slideStyles.sectionLabel}>Özet bilgiler</Text>
      {item.webLoading ? (
        <View style={slideStyles.skeleton}>
          <View style={slideStyles.skeletonLine} />
          <View style={[slideStyles.skeletonLine, { width: '88%' }]} />
          <View style={[slideStyles.skeletonLine, { width: '72%' }]} />
        </View>
      ) : item.summaryBullets.length > 0 ? (
        <View style={slideStyles.bulletBlock}>
          {item.summaryBullets.map((b, i) => (
            <Text key={`sum-${i}`} style={slideStyles.bullet}>
              • {b}
            </Text>
          ))}
          {item.summarySourceUrl ? (
            <Pressable onPress={() => void Linking.openURL(item.summarySourceUrl!)} style={slideStyles.linkBtn}>
              <Text style={slideStyles.linkText}>Kaynağı aç</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (item.placeRating == null || item.placeRating <= 0) ? (
        <Text style={slideStyles.emptyWeb}>
          Bu durak için otomatik özet bulunamadı. Konum veya yer adını güncellemeyi deneyin.
        </Text>
      ) : null}

      {item.placeRating != null && item.placeRating > 0 ? (
        <>
          <Text style={[slideStyles.sectionLabel, slideStyles.sectionAfterReviews]}>Yorumlar</Text>
          <Text style={slideStyles.webDisclaimer}>
            Örnek kullanıcı yorumları Google Places’ten gelir; işletmeler zaman içinde değişebilir.
          </Text>
          {!item.webLoading && item.reviewBullets.length > 0 ? (
            <View style={slideStyles.bulletBlock}>
              {item.reviewBullets.map((b, i) => (
                <Text key={`rev-${i}`} style={slideStyles.bullet}>
                  • {b}
                </Text>
              ))}
              {item.reviewSourceLine ? (
                <Text style={slideStyles.source}>{item.reviewSourceLine}</Text>
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}
      </View>
    </View>
  );
}

const slideStyles = StyleSheet.create({
  page: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    paddingTop: 6,
  },
  slideCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.18)',
    backgroundColor: 'rgba(17, 24, 39, 0.65)',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 16,
    overflow: 'hidden',
  },
  introRouteMapWrap: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.22)',
    backgroundColor: CARD,
  },
  introRouteMapImg: {
    width: '100%',
    height: 176,
  },
  introRouteMapCaption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 10,
    fontWeight: '800',
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.12)',
  },
  introHero: {
    borderRadius: 22,
    paddingVertical: 28,
    paddingHorizontal: 20,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
  },
  introIconWrap: {
    marginBottom: 10,
    opacity: 0.95,
  },
  introKicker: {
    color: ACCENT,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  introTitle: {
    color: TEXT,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.4,
    marginBottom: 10,
  },
  introSchedule: {
    color: MUTED,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  introTimeHint: {
    color: 'rgba(148, 163, 184, 0.9)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center',
  },
  introStatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  introStatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
  },
  introStatPillWide: {
    minWidth: '47%',
    flexGrow: 1,
  },
  introStatPillAccent: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: 'rgba(56, 189, 248, 0.35)',
    width: '100%',
    justifyContent: 'center',
  },
  introStatText: {
    color: TEXT,
    fontSize: 13,
    fontWeight: '800',
  },
  introStatStrong: {
    color: TEXT,
    fontSize: 15,
    fontWeight: '900',
  },
  introVehicleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
    marginBottom: 12,
  },
  introVehicleText: {
    flex: 1,
    color: MUTED,
    fontSize: 13,
    fontWeight: '700',
  },
  introSwipeHint: {
    color: 'rgba(148, 163, 184, 0.85)',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  heroWrap: {
    borderRadius: 20,
    overflow: 'hidden',
    height: 220,
    marginTop: 4,
    marginBottom: 12,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.12)',
  },
  heroImg: { width: '100%', height: '100%' },
  heroLoading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    color: ACCENT,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  title: {
    color: TEXT,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  dayLine: {
    color: MUTED,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    maxWidth: '100%',
  },
  chipText: { color: TEXT, fontSize: 12, fontWeight: '700' },
  visitBar: {
    backgroundColor: 'rgba(56, 189, 248, 0.14)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.32)',
  },
  visitBarText: { color: ACCENT, fontSize: 14, fontWeight: '800' },
  sectionLabel: {
    color: ACCENT,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 10,
    marginTop: 6,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sectionAfterReviews: { marginTop: 18 },
  metricsRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  metricTile: {
    flex: 1,
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.14)',
  },
  metricValue: { color: TEXT, fontSize: 14, fontWeight: '800', marginTop: 6 },
  metricLabel: { color: MUTED, fontSize: 11, fontWeight: '600', marginTop: 2 },
    ratingRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    ratingStarIcon: { marginTop: 1, marginRight: 6 },
    ratingLine: { flex: 1, color: MUTED, fontSize: 12, lineHeight: 18 },
    webDisclaimer: {
      color: MUTED,
      fontSize: 11,
      fontWeight: '600',
      lineHeight: 16,
      marginBottom: 10,
      fontStyle: 'italic',
    },
    bulletBlock: {
    marginBottom: 8,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.12)',
  },
  bullet: { color: TEXT, fontSize: 14, lineHeight: 22, marginBottom: 6 },
  source: { color: MUTED, fontSize: 11, marginTop: 8 },
  linkBtn: { marginTop: 10, alignSelf: 'flex-start' },
  linkText: { color: ACCENT, fontSize: 14, fontWeight: '700' },
  emptyWeb: { color: MUTED, fontSize: 14, lineHeight: 21 },
  skeleton: { gap: 8 },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
    width: '100%',
  },
});

export function TripPresentationScreen(props: {
  tripId: string;
  initialIndex?: number;
  onBack: () => void;
}) {
  const { width } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [pages, setPages] = useState<StopPresentationPayload[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [pagerViewportHeight, setPagerViewportHeight] = useState(0);

  const pagerRef = useRef<FlatList<PresentationRow>>(null);
  const orbitRef = useRef<FlatList<PresentationRow>>(null);
  const enrichAbortRef = useRef<AbortController | null>(null);
  const didInitialPagerScroll = useRef(false);

  const routeOrderedStops = useMemo(() => {
    if (!trip) return [];
    return sortStopsByRoute(stops, trip.startDate ?? '');
  }, [trip, stops]);

  const listRows = useMemo((): PresentationRow[] => {
    if (pages.length === 0) return [];
    return [
      { rowKey: INTRO_ROW_KEY, kind: 'intro' },
      ...pages.map((p) => ({ rowKey: p.stopId, kind: 'stop' as const, payload: p })),
    ];
  }, [pages]);

  const tripTotals = useMemo(
    () => (trip && pages.length > 0 ? buildTripTotals(trip, pages) : null),
    [trip, pages]
  );

  const introRouteMapUri = useMemo(
    () => routeOverviewStaticMapUrl(routeOrderedStops, 640, 320, { preferOsmTiles: true }),
    [routeOrderedStops]
  );

  const introRouteMapFallbackUri = useMemo(() => {
    const s = routeOrderedStops.find(
      (x) =>
        x.coords?.latitude != null &&
        x.coords?.longitude != null &&
        Number.isFinite(x.coords.latitude) &&
        Number.isFinite(x.coords.longitude)
    );
    if (!s?.coords) return undefined;
    return staticMapPreviewUrlFallback(s.coords.latitude, s.coords.longitude, 640, 320);
  }, [routeOrderedStops]);

  useEffect(() => {
    let cancelled = false;
    didInitialPagerScroll.current = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const t = await getTrip(props.tripId);
        if (cancelled) return;
        if (!t) {
          setTrip(null);
          setStops([]);
          setError('Rota bulunamadı.');
          setLoading(false);
          return;
        }
        const s = await getStopsForTrip(props.tripId);
        if (cancelled) return;
        setTrip(t);
        setStops(s);
        const ordered = sortStopsByRoute(s, t.startDate ?? '');
        if (ordered.length === 0) {
          setPages([]);
          setError('Bu rotada durak yok.');
        } else {
          const base = buildStopPresentationPayloads(t.startDate ?? '', ordered);
          setPages(base);
          if (props.initialIndex != null && props.initialIndex >= 0) {
            const stopIdx = Math.min(Math.max(0, props.initialIndex), base.length - 1);
            setCurrentIndex(stopIdx + 1);
          } else {
            setCurrentIndex(0);
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Yüklenemedi.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.tripId, props.initialIndex]);

  useEffect(() => {
    if (loading || pages.length === 0 || !trip || didInitialPagerScroll.current) return;
    didInitialPagerScroll.current = true;
    const idx = Math.min(currentIndex, pages.length);
    requestAnimationFrame(() => {
      try {
        pagerRef.current?.scrollToIndex({ index: idx, animated: false });
      } catch {
        /* */
      }
    });
  }, [loading, pages.length, trip, currentIndex]);

  useEffect(() => {
    if (!trip || routeOrderedStops.length === 0) return;
    enrichAbortRef.current?.abort();
    const ac = new AbortController();
    enrichAbortRef.current = ac;

    const focusStopIndex =
      currentIndex <= 0 ? 0 : Math.min(currentIndex - 1, pages.length - 1);

    const planRows = buildPlanStopRows(trip.startDate ?? '', routeOrderedStops);
    void enrichPresentationPayloads({
      tripId: props.tripId,
      stops: routeOrderedStops,
      rows: planRows,
      focusIndex: focusStopIndex,
      signal: ac.signal,
      onIndexUpdated: (index, patch) => {
        if (ac.signal.aborted) return;
        setPages((prev) => {
          if (index < 0 || index >= prev.length) return prev;
          const next = [...prev];
          next[index] = { ...next[index]!, ...patch };
          return next;
        });
      },
    });

    return () => ac.abort();
  }, [props.tripId, trip, routeOrderedStops, currentIndex]);

  const onViewableItemsChanged = useRef(
    (info: { viewableItems: ViewToken<PresentationRow>[] }) => {
      const idx = info.viewableItems[0]?.index;
      if (idx != null && idx >= 0) {
        setCurrentIndex(idx);
      }
    }
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 55,
  }).current;

  const syncOrbitToIndex = useCallback((index: number) => {
    try {
      orbitRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.5,
      });
    } catch {
      /* */
    }
  }, []);

  useEffect(() => {
    syncOrbitToIndex(currentIndex);
  }, [currentIndex, listRows.length, syncOrbitToIndex]);

  const renderPagerItem: ListRenderItem<PresentationRow> = useCallback(
    ({ item }) => {
      const pageHeight = pagerViewportHeight > 0 ? pagerViewportHeight : undefined;
      const pageShell = (child: ReactNode) => (
        <View style={[styles.pagerPage, { width }, pageHeight != null ? { height: pageHeight } : { flex: 1 }]}>
          <ScrollView
            style={styles.pagerScroll}
            contentContainerStyle={styles.pagerScrollContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {child}
          </ScrollView>
        </View>
      );

      if (item.kind === 'intro') {
        if (!trip || !tripTotals) return <View style={{ width, flex: 1 }} />;
        return pageShell(
          <IntroSlide
            width={width}
            trip={trip}
            totals={tripTotals}
            routeOrderedStops={routeOrderedStops}
            routeMapUri={introRouteMapUri}
            routeMapFallbackUri={introRouteMapFallbackUri}
          />
        );
      }
      return pageShell(<PresentationStopSlide item={item.payload} width={width} />);
    },
    [
      width,
      trip,
      tripTotals,
      pagerViewportHeight,
      introRouteMapUri,
      introRouteMapFallbackUri,
      routeOrderedStops,
    ]
  );

  const renderOrbit: ListRenderItem<PresentationRow> = useCallback(
    ({ item, index }) => {
      const active = index === currentIndex;
      const size = active ? ORBIT_ACTIVE : ORBIT_SIZE;
      const isIntro = item.kind === 'intro';
      const uri = isIntro ? undefined : item.payload.heroImageUrl;
      const label = isIntro ? 'Özet' : item.payload.title;
      const routeIndex = isIntro ? 0 : item.payload.routeIndex;
      const inner = size - 6;
      const r = inner / 2;
      return (
        <Pressable
          onPress={() => {
            setCurrentIndex(index);
            try {
              pagerRef.current?.scrollToIndex({ index, animated: true });
            } catch {
              /* */
            }
          }}
          style={[orbitStyles.item, { width: ORBIT_ACTIVE + ORBIT_GAP, alignItems: 'center' }]}
        >
          <View
            style={[
              orbitStyles.ring,
              active && orbitStyles.ringActive,
              { width: size, height: size, borderRadius: size / 2 },
            ]}
          >
            {isIntro ? (
              <LinearGradient
                colors={['rgba(56, 189, 248, 0.35)', 'rgba(15, 23, 42, 0.95)']}
                style={{
                  width: inner,
                  height: inner,
                  borderRadius: r,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="map-outline" size={active ? 26 : 20} color={ACCENT} />
              </LinearGradient>
            ) : (
              <ResilientOrbitImage
                uri={uri}
                size={size}
                routeIndex={routeIndex}
                active={active}
              />
            )}
          </View>
          <Text style={[orbitStyles.label, active && orbitStyles.labelActive]} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
      );
    },
    [currentIndex]
  );

  const onPagerScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const i = Math.round(x / width);
      if (i >= 0 && i < listRows.length) setCurrentIndex(i);
    },
    [width, listRows.length]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={ACCENT} />
          <Text style={styles.muted}>Sunum yükleniyor…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || pages.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable onPress={props.onBack} style={styles.backBtn} accessibilityRole="button">
            <Ionicons name="chevron-back" size={24} color={TEXT} />
            <Text style={styles.backText}>Geri</Text>
          </Pressable>
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error || 'Durak yok.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={props.onBack} style={styles.backBtn} accessibilityRole="button">
          <Ionicons name="chevron-back" size={24} color={TEXT} />
          <Text style={styles.backText}>Geri</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Rota Sunumu
        </Text>
        <Text style={styles.progress}>
          {currentIndex + 1}/{listRows.length}
        </Text>
      </View>

      <FlatList
        ref={orbitRef}
        data={listRows}
        keyExtractor={(it) => it.rowKey}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={orbitStyles.listContent}
        renderItem={renderOrbit}
        style={orbitStyles.list}
        nestedScrollEnabled
      />

      <FlatList
        ref={pagerRef}
        data={listRows}
        keyExtractor={(it) => it.rowKey}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        style={styles.pagerList}
        onLayout={(e) => setPagerViewportHeight(e.nativeEvent.layout.height)}
        renderItem={renderPagerItem}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onMomentumScrollEnd={onPagerScrollEnd}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            pagerRef.current?.scrollToIndex({ index: info.index, animated: false });
          }, 100);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6 },
  backText: { color: TEXT, fontSize: 16, fontWeight: '700' },
  headerTitle: { flex: 1, color: TEXT, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  progress: { color: MUTED, fontSize: 14, fontWeight: '800', minWidth: 40, textAlign: 'right' },
  pagerList: { flex: 1, marginTop: 10 },
  pagerPage: { overflow: 'hidden' },
  pagerScroll: { flex: 1 },
  pagerScrollContent: { flexGrow: 1, paddingBottom: 8 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  muted: { color: MUTED, fontSize: 15 },
  errorText: { color: '#fca5a5', fontSize: 16, textAlign: 'center' },
});

const orbitStyles = StyleSheet.create({
  list: {
    height: ORBIT_BAND_HEIGHT,
    maxHeight: ORBIT_BAND_HEIGHT,
    flexGrow: 0,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'flex-start',
  },
  item: { justifyContent: 'flex-start', paddingTop: 4 },
  ring: {
    borderWidth: 2,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ringActive: {
    borderColor: ACCENT,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 6,
  },
  label: {
    color: MUTED,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
    maxWidth: ORBIT_ACTIVE + 8,
    textAlign: 'center',
  },
  labelActive: { color: TEXT },
});
