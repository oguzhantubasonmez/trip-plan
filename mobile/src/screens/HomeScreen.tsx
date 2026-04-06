import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { AppLogo } from '../components/AppLogo';
import { HomeWeatherCard } from '../components/HomeWeatherCard';
import { InboxBellMenu } from '../components/InboxBellMenu';
import { LeaveTripConfirmModal } from '../components/LeaveTripConfirmModal';
import { NoTripCreditsModal, type NoTripCreditsVariant } from '../components/NoTripCreditsModal';
import { PlaceDiscoverModal } from '../components/PlaceDiscoverModal';
import { Screen } from '../components/Screen';
import { TabRootSafeAreaTop } from '../components/TabRootScrollChrome';
import { TripPlanStatusChip } from '../components/TripPlanStatusChip';
import { useProEntitlement } from '../hooks/useProEntitlement';
import { useTripCreationCredits } from '../hooks/useTripCreationCredits';
import { auth } from '../lib/firebase';
import { getInboxSummary, type InboxSummary } from '../services/activityInbox';
import {
  EMPTY_HOME_SCREEN_COPY,
  subscribeHomeScreenCopy,
  type HomeScreenCopy,
} from '../services/homeScreenCopy';
import {
  getTripListMetricsForHome,
  getTripsForUser,
  leaveTripAsAttendee,
  updateTripPlanStatus,
  type TripListMetrics,
} from '../services/trips';
import {
  canCreateNewTrip,
  canUsePlaceDiscoverFlow,
} from '../services/tripCreationCredits';
import type { HomeStackParamList, MainTabParamList } from '../navigation/types';
import type { Trip, TripPlanStatus } from '../types/trip';
import { useAppTheme, useThemeMode } from '../ThemeContext';
import type { AppTheme } from '../theme';
import { formatDrivingDurationMinutes, formatTripScheduleSummary } from '../utils/tripSchedule';
import {
  nextTripPlanStatus,
  TRIP_PLAN_STATUS_LABEL_TR,
  TRIP_PLAN_STATUS_ORDER,
} from '../utils/tripPlanStatus';

const HERO_MARQUEE_TEXT = '✨ Planla · Paylaş · Keşfet ✨';
const MARQUEE_GAP = 40;

type TripListSort = 'dateAsc' | 'dateDesc' | 'priceAsc' | 'priceDesc';
type TripPlanFilter = 'all' | TripPlanStatus;

function tripStartSortKey(t: Trip): string {
  const s = (t.startDate || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return '9999-12-31';
}

function tripGrandCostTl(t: Trip, metrics: Map<string, TripListMetrics>): number {
  const m = metrics.get(t.tripId);
  const fuel = t.totalFuelCost ?? 0;
  const extra = m?.extraCostsTotal ?? 0;
  return Math.round((fuel + extra) * 100) / 100;
}

/** Anasayfa bölüm kartı için toplam özet satırı (kapalıyken görünür). */
function formatTripSectionSummaryLine(
  sectionTrips: Trip[],
  metrics: Map<string, TripListMetrics>
): string {
  const n = sectionTrips.length;
  if (n === 0) return 'Henüz rota yok';
  let kmSum = 0;
  let costSum = 0;
  let driveMinSum = 0;
  for (const t of sectionTrips) {
    const m = metrics.get(t.tripId);
    const kmFromLegs = m && m.distanceFromLegsKm > 0 ? m.distanceFromLegsKm : null;
    const kmStored =
      t.totalDistance != null && t.totalDistance > 0 ? t.totalDistance : null;
    const d = kmFromLegs ?? kmStored ?? 0;
    kmSum += d;
    costSum += tripGrandCostTl(t, metrics);
    driveMinSum += m?.drivingDurationMin ?? 0;
  }
  const parts: string[] = [`${n} rota`];
  if (kmSum > 0) parts.push(`~${Math.round(kmSum * 10) / 10} km`);
  if (driveMinSum > 0) parts.push(`${formatDrivingDurationMinutes(driveMinSum)} sürüş`);
  if (costSum > 0) {
    parts.push(
      `${costSum.toLocaleString('tr-TR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })} ₺`
    );
  }
  return parts.join(' · ');
}

function filterTripsBySearch(trips: Trip[], q: string): Trip[] {
  const qq = q.trim().toLocaleLowerCase('tr-TR');
  if (!qq) return trips;
  return trips.filter((t) => {
    if ((t.title || '').toLocaleLowerCase('tr-TR').includes(qq)) return true;
    const sched = formatTripScheduleSummary(t.startDate, t.endDate, t.startTime, t.endTime);
    const blob = [sched.combinedLine, sched.dateLine, sched.timeLine ?? '']
      .join(' ')
      .toLocaleLowerCase('tr-TR');
    return blob.includes(qq);
  });
}

function filterTripsByPlanStatus(trips: Trip[], filter: TripPlanFilter): Trip[] {
  if (filter === 'all') return trips;
  return trips.filter((t) => t.planStatus === filter);
}

function sortTripsList(
  list: Trip[],
  sort: TripListSort,
  metrics: Map<string, TripListMetrics>
): Trip[] {
  const out = [...list];
  const tie = (a: Trip, b: Trip) => a.tripId.localeCompare(b.tripId);
  switch (sort) {
    case 'dateAsc':
      out.sort((a, b) => tripStartSortKey(a).localeCompare(tripStartSortKey(b)) || tie(a, b));
      break;
    case 'dateDesc':
      out.sort((a, b) => tripStartSortKey(b).localeCompare(tripStartSortKey(a)) || tie(a, b));
      break;
    case 'priceAsc':
      out.sort(
        (a, b) => tripGrandCostTl(a, metrics) - tripGrandCostTl(b, metrics) || tie(a, b)
      );
      break;
    case 'priceDesc':
      out.sort(
        (a, b) => tripGrandCostTl(b, metrics) - tripGrandCostTl(a, metrics) || tie(a, b)
      );
      break;
    default:
      break;
  }
  return out;
}

function HeroMarquee({
  textStyle,
  containerStyle,
}: {
  textStyle: StyleProp<TextStyle>;
  containerStyle: StyleProp<ViewStyle>;
}) {
  const [segW, setSegW] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (segW <= 0) return;
    scrollX.setValue(0);
    const step = segW + MARQUEE_GAP;
    const duration = Math.min(Math.max(step * 42, 10000), 32000);
    const anim = Animated.loop(
      Animated.timing(scrollX, {
        toValue: -step,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [segW, scrollX]);

  return (
    <View style={containerStyle}>
      <Text
        style={[textStyle, { position: 'absolute', opacity: 0, zIndex: -1, left: -2000 }]}
        onLayout={(e) => {
          const w = Math.ceil(e.nativeEvent.layout.width);
          if (w > 0 && w !== segW) setSegW(w);
        }}
      >
        {HERO_MARQUEE_TEXT}
      </Text>
      {segW > 0 ? (
        <Animated.View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            transform: [{ translateX: scrollX }],
          }}
        >
          <Text style={textStyle}>{HERO_MARQUEE_TEXT}</Text>
          <Text style={[textStyle, { paddingLeft: MARQUEE_GAP }]}>{HERO_MARQUEE_TEXT}</Text>
        </Animated.View>
      ) : (
        <Text style={[textStyle, { textAlign: 'center' }]} numberOfLines={1}>
          {HERO_MARQUEE_TEXT}
        </Text>
      )}
    </View>
  );
}

type HomeScreenNav = CompositeNavigationProp<
  NativeStackNavigationProp<HomeStackParamList, 'Home'>,
  BottomTabNavigationProp<MainTabParamList>
>;

export function HomeScreen(props: {
  onCreateTrip: () => void;
  onOpenTrip: (tripId: string, opts?: { focusComments?: boolean }) => void;
  onOpenFriends: () => void;
  onOpenGroup: (groupId: string) => void;
  onOpenWeatherForecast?: (params?: {
    latitude?: number;
    longitude?: number;
    label?: string;
  }) => void;
}) {
  const navigation = useNavigation<HomeScreenNav>();
  const goToProfileTab = useCallback(() => {
    navigation.navigate('ProfileTab', { screen: 'Profile' });
  }, [navigation]);
  const route = useRoute<RouteProp<HomeStackParamList, 'Home'>>();
  const theme = useAppTheme();
  const { mode } = useThemeMode();
  const styles = useMemo(() => createHomeStyles(theme), [theme]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripMetrics, setTripMetrics] = useState<Map<string, TripListMetrics>>(new Map());
  const [inbox, setInbox] = useState<InboxSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [planStatusBusyTripId, setPlanStatusBusyTripId] = useState<string | null>(null);
  const [leaveTripTarget, setLeaveTripTarget] = useState<Trip | null>(null);
  const [leaveTripBusy, setLeaveTripBusy] = useState(false);
  const [leaveTripError, setLeaveTripError] = useState<string | null>(null);
  const [tripSearchQuery, setTripSearchQuery] = useState('');
  const [tripSort, setTripSort] = useState<TripListSort>('dateAsc');
  const [tripPlanFilter, setTripPlanFilter] = useState<TripPlanFilter>('all');
  const [createdTripsExpanded, setCreatedTripsExpanded] = useState(false);
  const [invitedTripsExpanded, setInvitedTripsExpanded] = useState(false);
  const [placeDiscoverOpen, setPlaceDiscoverOpen] = useState(false);
  const [discoverSeedPlaceId, setDiscoverSeedPlaceId] = useState<string | null>(null);
  const clearDiscoverSeed = useCallback(() => setDiscoverSeedPlaceId(null), []);
  const [homeCopy, setHomeCopy] = useState<HomeScreenCopy>(() => ({ ...EMPTY_HOME_SCREEN_COPY }));
  const uid = auth.currentUser?.uid;
  const tripCredits = useTripCreationCredits();
  const { isPro } = useProEntitlement();
  const [noCreditsOpen, setNoCreditsOpen] = useState(false);
  const [noCreditsVariant, setNoCreditsVariant] = useState<NoTripCreditsVariant>('createTrip');
  const pendingDiscoverPlaceRef = useRef<string | null>(null);

  useEffect(() => {
    const id = route.params?.openDiscoverPlaceId?.trim();
    if (!id) return;
    pendingDiscoverPlaceRef.current = id;
    navigation.setParams({ openDiscoverPlaceId: undefined });
  }, [route.params?.openDiscoverPlaceId, navigation]);

  useEffect(() => {
    const id = pendingDiscoverPlaceRef.current;
    if (!id || tripCredits == null) return;
    pendingDiscoverPlaceRef.current = null;
    if (!canUsePlaceDiscoverFlow(tripCredits, isPro)) {
      setNoCreditsVariant('discover');
      setNoCreditsOpen(true);
      return;
    }
    setDiscoverSeedPlaceId(id);
    setPlaceDiscoverOpen(true);
  }, [tripCredits, isPro]);

  const handleCreateTrip = useCallback(() => {
    if (tripCredits != null && !canCreateNewTrip(tripCredits, isPro)) {
      setNoCreditsVariant('createTrip');
      setNoCreditsOpen(true);
      return;
    }
    props.onCreateTrip();
  }, [tripCredits, isPro, props.onCreateTrip]);

  useEffect(() => {
    const unsub = subscribeHomeScreenCopy(setHomeCopy);
    return unsub;
  }, []);

  const contentFade = useRef(new Animated.Value(0)).current;
  const contentSlide = useRef(new Animated.Value(18)).current;
  const emptyEmojiScale = useRef(new Animated.Value(1)).current;

  const heroGrad = useMemo((): [string, string, string] => {
    switch (mode) {
      case 'ocean':
        return ['#1D4ED8', '#2563EB', '#0E7490'];
      case 'dark':
        return ['#0369A1', '#4F46E5', '#7C3AED'];
      case 'light':
        return ['#38BDF8', '#818CF8', '#F472B6'];
      case 'lavender':
        return ['#6D28D9', '#7C3AED', '#A21CAF'];
      case 'ember':
        return ['#B45309', '#D97706', '#CA8A04'];
      case 'ruby':
        return ['#BE123C', '#DB2777', '#A21CAF'];
      case 'sunset':
        return ['#DB2777', '#EA580C', '#9333EA'];
      case 'forest':
        return ['#166534', '#15803D', '#65A30D'];
      default:
        return ['#1D4ED8', '#2563EB', '#0E7490'];
    }
  }, [mode]);

  /** Keşif CTA — teal → mavi → mor */
  const discoverGrad = useMemo((): [string, string, string] => {
    switch (mode) {
      case 'ocean':
        return ['#22D3EE', '#3B82F6', '#6366F1'];
      case 'dark':
        return ['#0D9488', '#0284C7', '#A855F7'];
      case 'light':
        return ['#06B6D4', '#2563EB', '#DB2777'];
      case 'lavender':
        return ['#A78BFA', '#C084FC', '#E879F9'];
      case 'ember':
        return ['#FBBF24', '#FB923C', '#F97316'];
      case 'ruby':
        return ['#FB7185', '#F472B6', '#EC4899'];
      case 'sunset':
        return ['#F97316', '#EC4899', '#7C3AED'];
      case 'forest':
        return ['#22C55E', '#059669', '#0284C7'];
      default:
        return ['#22D3EE', '#3B82F6', '#6366F1'];
    }
  }, [mode]);

  /** Yeni rota CTA — indigo / mor / sıcak vurgu (keşfetten ayrışır) */
  const newTripGrad = useMemo((): [string, string, string] => {
    switch (mode) {
      case 'ocean':
        return ['#1E40AF', '#2563EB', '#0891B2'];
      case 'dark':
        return ['#4F46E5', '#7C3AED', '#DB2777'];
      case 'light':
        return ['#6366F1', '#A855F7', '#EC4899'];
      case 'lavender':
        return ['#5B21B6', '#7C3AED', '#C026D3'];
      case 'ember':
        return ['#EA580C', '#D97706', '#CA8A04'];
      case 'ruby':
        return ['#9D174D', '#BE123C', '#DB2777'];
      case 'sunset':
        return ['#7C3AED', '#DB2777', '#EA580C'];
      case 'forest':
        return ['#5B21B6', '#059669', '#CA8A04'];
      default:
        return ['#1E40AF', '#2563EB', '#0891B2'];
    }
  }, [mode]);

  const heroMiniBadges = useMemo(
    () =>
      ['🗓️', '🎒', '🧭', '🧑‍🤝‍🧑', '✈️'].map((emoji, i) => ({
        emoji,
        ring: theme.tripStripes[i % theme.tripStripes.length],
      })),
    [theme.tripStripes]
  );

  const cardRibbonColors = useMemo(
    (): [string, string, string] => [
      theme.tripStripes[0],
      theme.tripStripes[2],
      theme.tripStripes[4],
    ],
    [theme.tripStripes]
  );

  const visibleTrips = useMemo(() => {
    const bySearch = filterTripsBySearch(trips, tripSearchQuery);
    const byStatus = filterTripsByPlanStatus(bySearch, tripPlanFilter);
    return sortTripsList(byStatus, tripSort, tripMetrics);
  }, [trips, tripSearchQuery, tripPlanFilter, tripSort, tripMetrics]);

  const { tripsCreatedByMe, tripsInvitedJoined } = useMemo(() => {
    if (!uid) return { tripsCreatedByMe: [] as Trip[], tripsInvitedJoined: [] as Trip[] };
    const created = visibleTrips.filter((t) => t.adminId === uid);
    const invited = visibleTrips.filter((t) => t.adminId !== uid);
    return { tripsCreatedByMe: created, tripsInvitedJoined: invited };
  }, [visibleTrips, uid]);

  const createdSectionSummary = useMemo(
    () => formatTripSectionSummaryLine(tripsCreatedByMe, tripMetrics),
    [tripsCreatedByMe, tripMetrics]
  );
  const invitedSectionSummary = useMemo(
    () => formatTripSectionSummaryLine(tripsInvitedJoined, tripMetrics),
    [tripsInvitedJoined, tripMetrics]
  );

  const handleCyclePlanStatus = useCallback(
    async (tripId: string) => {
      if (!uid) return;
      const trip = trips.find((x) => x.tripId === tripId);
      if (!trip?.attendees.some((a) => a.uid === uid)) return;
      const current = trip.planStatus;
      const next = nextTripPlanStatus(current);
      setPlanStatusBusyTripId(tripId);
      setTrips((prev) =>
        prev.map((p) => (p.tripId === tripId ? { ...p, planStatus: next } : p))
      );
      try {
        await updateTripPlanStatus(tripId, next, uid);
      } catch {
        setTrips((prev) =>
          prev.map((p) => (p.tripId === tripId ? { ...p, planStatus: current } : p))
        );
      } finally {
        setPlanStatusBusyTripId(null);
      }
    },
    [uid, trips]
  );

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const list = await getTripsForUser(uid);
      const metrics = await getTripListMetricsForHome(list.map((t) => t.tripId));
      setTrips(list);
      setTripMetrics(metrics);
      const s = await getInboxSummary(uid, list);
      setInbox(s);
    } catch (_) {
      setTrips([]);
      setTripMetrics(new Map());
      setInbox(null);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  /** Zil paneli: tam sayfa yüklemeden gelen istek / yorum özetini tazele */
  const refreshInbox = useCallback(async () => {
    if (!uid) return;
    try {
      const s = await getInboxSummary(uid, trips);
      setInbox(s);
    } catch {
      setInbox(null);
    }
  }, [uid, trips]);

  const openLeaveTripModal = useCallback(
    (item: Trip) => {
      if (!uid) return;
      if (!item.attendees.some((a) => a.uid === uid)) return;
      setLeaveTripError(null);
      setLeaveTripTarget(item);
    },
    [uid]
  );

  const closeLeaveTripModal = useCallback(() => {
    if (leaveTripBusy) return;
    setLeaveTripTarget(null);
    setLeaveTripError(null);
  }, [leaveTripBusy]);

  const confirmLeaveTripAction = useCallback(async () => {
    if (!uid || !leaveTripTarget) return;
    setLeaveTripBusy(true);
    setLeaveTripError(null);
    try {
      await leaveTripAsAttendee(leaveTripTarget.tripId, uid);
      setLeaveTripTarget(null);
      await load();
    } catch (e: any) {
      setLeaveTripError(e?.message || 'Ayrılınamadı.');
    } finally {
      setLeaveTripBusy(false);
    }
  }, [uid, leaveTripTarget, load]);

  const renderTripPlanCard = useCallback(
    (item: Trip, stripeIndex: number) => {
      const stripe = theme.tripStripes[stripeIndex % theme.tripStripes.length];
      const sched = formatTripScheduleSummary(
        item.startDate,
        item.endDate,
        item.startTime,
        item.endTime
      );
      const showExtraTimeLine =
        sched.timeLine != null &&
        sched.combinedLine === sched.dateLine &&
        Boolean(item.startTime?.trim() || item.endTime?.trim());
      const m = tripMetrics.get(item.tripId);
      const kmFromLegs = m && m.distanceFromLegsKm > 0 ? m.distanceFromLegsKm : null;
      const kmStored =
        item.totalDistance != null && item.totalDistance > 0 ? item.totalDistance : null;
      const kmDisplay = kmFromLegs != null ? kmFromLegs : kmStored;
      const kmLabel =
        kmDisplay != null ? (kmFromLegs != null ? `~${kmDisplay} km` : `${kmDisplay} km`) : null;
      const fuel = item.totalFuelCost ?? 0;
      const extra = m?.extraCostsTotal ?? 0;
      const grandCost = Math.round((fuel + extra) * 100) / 100;
      const costLabel =
        grandCost > 0
          ? `${grandCost.toLocaleString('tr-TR', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            })} ₺`
          : null;
      const durationLabel =
        m && m.drivingDurationMin > 0 ? formatDrivingDurationMinutes(m.drivingDurationMin) : null;
      const showMetaBlock = Boolean(kmLabel || costLabel || durationLabel);
      const canChangeStatus = Boolean(uid && item.attendees.some((a) => a.uid === uid));
      const canLeaveTrip = Boolean(uid && item.attendees.some((a) => a.uid === uid));
      return (
        <Pressable
          onPress={() => props.onOpenTrip(item.tripId)}
          onLongPress={canLeaveTrip ? () => openLeaveTripModal(item) : undefined}
          delayLongPress={480}
          style={({ pressed }) => [
            styles.tripCard,
            theme.shadowCard,
            pressed && { opacity: 0.96 },
          ]}
        >
          <View style={[styles.tripStripe, { backgroundColor: stripe }]} />
          <View style={styles.tripCardMain}>
            <View style={styles.tripTitleRow}>
              <View style={styles.tripStatusChipWrap} pointerEvents="box-none">
                <TripPlanStatusChip
                  status={item.planStatus}
                  compact
                  interactive={canChangeStatus}
                  busy={planStatusBusyTripId === item.tripId}
                  onPressCycle={() => void handleCyclePlanStatus(item.tripId)}
                />
              </View>
              <View style={styles.tripTitlePressable}>
                <Text style={styles.tripTitle} numberOfLines={2}>
                  {item.title}
                </Text>
              </View>
            </View>
            <View>
              <Text style={styles.tripScheduleMain}>📅 {sched.combinedLine}</Text>
              {showExtraTimeLine ? <Text style={styles.tripTimes}>🕐 {sched.timeLine}</Text> : null}
              {showMetaBlock ? (
                <View style={styles.tripMetaRow}>
                  {kmLabel ? (
                    <View style={[styles.metaPill, styles.metaPillKm]}>
                      <Text style={styles.metaPillText}>🛣️ {kmLabel}</Text>
                    </View>
                  ) : null}
                  {costLabel ? (
                    <View style={[styles.metaPill, styles.metaPillCost]}>
                      <Text style={styles.metaPillText}>💰 {costLabel}</Text>
                    </View>
                  ) : null}
                  {durationLabel ? (
                    <View style={[styles.metaPill, styles.metaPillTime]}>
                      <Text style={styles.metaPillText}>⏱ {durationLabel}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
          <View style={styles.chevronWrap}>
            <Text style={styles.chevron}>›</Text>
          </View>
        </Pressable>
      );
    },
    [
      openLeaveTripModal,
      handleCyclePlanStatus,
      planStatusBusyTripId,
      props.onOpenTrip,
      styles,
      theme,
      tripMetrics,
      uid,
    ]
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    contentFade.setValue(0);
    contentSlide.setValue(18);
    Animated.parallel([
      Animated.timing(contentFade, {
        toValue: 1,
        duration: 480,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(contentSlide, {
        toValue: 0,
        duration: 480,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [contentFade, contentSlide, uid]);

  useEffect(() => {
    if (loading || trips.length > 0) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(emptyEmojiScale, {
          toValue: 1.08,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(emptyEmojiScale, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      emptyEmojiScale.setValue(1);
    };
  }, [emptyEmojiScale, loading, trips.length]);

  return (
    <Screen safeAreaEdges={['left', 'right', 'bottom']} contentTopPadding={0}>
      <NoTripCreditsModal
        visible={noCreditsOpen}
        variant={noCreditsVariant}
        onClose={() => setNoCreditsOpen(false)}
        onGoToProfile={goToProfileTab}
      />
      <LeaveTripConfirmModal
        visible={leaveTripTarget !== null}
        tripTitle={leaveTripTarget?.title ?? ''}
        isTripAdmin={Boolean(uid && leaveTripTarget && leaveTripTarget.adminId === uid)}
        busy={leaveTripBusy}
        error={leaveTripError}
        onClose={closeLeaveTripModal}
        onConfirmLeave={() => void confirmLeaveTripAction()}
      />
      <ScrollView
        style={styles.tabScrollFill}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <TabRootSafeAreaTop />
        <View style={styles.topBar}>
          <View style={styles.topBarLeft}>
            <AppLogo size={48} />
            <View style={styles.topBarText}>
              <Text style={styles.appName}>RouteWise</Text>
              <Text style={styles.appTagline}>Rotaların, tek yerde</Text>
            </View>
          </View>
          {uid ? (
            <InboxBellMenu
              uid={uid}
              inbox={inbox}
              onReload={() => void load()}
              onRefreshInbox={() => void refreshInbox()}
              onOpenTrip={props.onOpenTrip}
              onOpenFriends={props.onOpenFriends}
              onOpenGroup={props.onOpenGroup}
              onOpenDiscover={({ pollId }) => {
                navigation.getParent()?.navigate('DiscoverTab', {
                  screen: 'Discover',
                  params: { focusPollId: pollId },
                });
              }}
            />
          ) : null}
        </View>

        <Animated.View
          style={{
            opacity: contentFade,
            transform: [{ translateY: contentSlide }],
            width: '100%',
            maxWidth: '100%',
          }}
        >
          <HomeWeatherCard onOpenForecast={props.onOpenWeatherForecast} />

          <LinearGradient
            colors={heroGrad}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.heroShell, theme.shadowCard]}
          >
            <View style={styles.heroCanvas}>
              <View style={styles.heroFloatLayer} pointerEvents="none">
                <Text style={[styles.heroFloater, styles.heroFloaterTL]} allowFontScaling={false}>
                  🧭
                </Text>
                <Text style={[styles.heroFloater, styles.heroFloaterTR]} allowFontScaling={false}>
                  🗺️
                </Text>
                <Text style={[styles.heroFloater, styles.heroFloaterML]} allowFontScaling={false}>
                  🎒
                </Text>
                <Text style={[styles.heroFloater, styles.heroFloaterMR]} allowFontScaling={false}>
                  🧳
                </Text>
              </View>
              <View style={styles.heroMain}>
                <Text style={styles.heroKicker}>Bugün</Text>
                <View style={styles.heroMiniStrip}>
                  {heroMiniBadges.map((row, i) => (
                    <View
                      key={`${row.emoji}-${i}`}
                      style={[styles.heroMiniBubble, { borderColor: row.ring }]}
                    >
                      <Text style={styles.heroMiniEmoji} allowFontScaling={false}>
                        {row.emoji}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.heroTitleOnGrad}>{homeCopy.anasayfa_baslik}</Text>
                <Text style={styles.heroSubOnGrad}>{homeCopy.altmetin1}</Text>
                <Text style={[styles.heroSubOnGrad, styles.heroSubOnGradSecond]}>{homeCopy.altmetin2}</Text>
                <HeroMarquee textStyle={styles.heroSparkLabel} containerStyle={styles.heroMarqueeWrap} />
              </View>
            </View>
          </LinearGradient>

          <View style={{ width: '100%' }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Yeni gezi planı oluştur"
              onPress={handleCreateTrip}
              style={({ pressed }) => [
                styles.homeCtaPressable,
                styles.homeCtaPressablePlanShadow,
                pressed && styles.homeCtaPressed,
              ]}
            >
              <LinearGradient
                colors={newTripGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.homeCtaGradient}
              >
                <View style={styles.homeCtaInner}>
                  <Text style={styles.homeCtaBadge}>📍 YENİ ROTA</Text>
                  <Text style={styles.homeCtaTitle}>Yeni Gezi Planı</Text>
                  <Text style={styles.homeCtaSubtitle}>
                    Tarihler, duraklar ve arkadaşların — tek yerden planla
                  </Text>
                </View>
              </LinearGradient>
            </Pressable>
          </View>
          <View style={{ height: theme.space.sm }} />
          <View style={{ width: '100%' }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Yeni yer keşfet: yer ara ve sunumla incele"
              onPress={() => {
                if (tripCredits != null && !canUsePlaceDiscoverFlow(tripCredits, isPro)) {
                  setNoCreditsVariant('discover');
                  setNoCreditsOpen(true);
                  return;
                }
                setPlaceDiscoverOpen(true);
              }}
              style={({ pressed }) => [styles.homeCtaPressable, pressed && styles.homeCtaPressed]}
            >
              <LinearGradient
                colors={discoverGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.homeCtaGradient}
              >
                <View style={styles.homeCtaInner}>
                  <Text style={styles.homeCtaBadge}>✨ KEŞFET</Text>
                  <Text style={styles.homeCtaTitle}>Yeni bir yer keşfet</Text>
                  <Text style={styles.homeCtaSubtitle}>
                    Ara, seç — rota sunumu gibi görsel özet ve yorumlar
                  </Text>
                </View>
              </LinearGradient>
            </Pressable>
          </View>
          <PlaceDiscoverModal
            visible={placeDiscoverOpen}
            seedPlaceId={discoverSeedPlaceId}
            onSeedConsumed={clearDiscoverSeed}
            onClose={() => {
              setPlaceDiscoverOpen(false);
              setDiscoverSeedPlaceId(null);
            }}
            onNavigateCreateTripWithSecondStop={(p) => {
              if (tripCredits != null && !canCreateNewTrip(tripCredits, isPro)) {
                setPlaceDiscoverOpen(false);
                setDiscoverSeedPlaceId(null);
                setNoCreditsVariant('createTrip');
                setNoCreditsOpen(true);
                return;
              }
              setPlaceDiscoverOpen(false);
              setDiscoverSeedPlaceId(null);
              navigation.navigate('CreateTrip', { secondStopFromDiscover: p });
            }}
            onOpenTrip={(tripId) => {
              setPlaceDiscoverOpen(false);
              setDiscoverSeedPlaceId(null);
              props.onOpenTrip(tripId);
            }}
          />
          <View style={{ height: theme.space.md }} />

          <Pressable
            onPress={props.onOpenFriends}
            style={({ pressed }) => [styles.friendsCard, theme.shadowCard, pressed && styles.quickPressed]}
          >
            <LinearGradient
              colors={cardRibbonColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.friendsCardRibbon}
            />
            <Text style={styles.quickEmoji}>👥</Text>
            <Text style={styles.friendsTitle}>Arkadaşlar & gruplar</Text>
            <Text style={styles.friendsSub}>
              Gelen istekler, grup davetleri ve liste — Keşfet’te puan, sıralama ve topluluk anketi.
            </Text>
          </Pressable>

          {!loading && trips.length > 0 ? (
            <View style={[styles.plansToolsCard, theme.shadowCard]}>
              <LinearGradient
                colors={cardRibbonColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.plansToolsCardRibbon}
              />
              <Text style={styles.plansToolsCardTitle}>Senin planların</Text>
              <View style={styles.tripToolbar}>
                <View style={[styles.searchShell, styles.searchShellInCard, theme.shadowSoft]}>
                  <Text style={styles.searchIcon}>🔍</Text>
                  <TextInput
                    value={tripSearchQuery}
                    onChangeText={setTripSearchQuery}
                    placeholder="Rota ara — başlık veya tarih"
                    placeholderTextColor={theme.color.muted}
                    style={styles.searchInput}
                    returnKeyType="search"
                    autoCorrect={false}
                    autoCapitalize="none"
                    underlineColorAndroid="transparent"
                    {...(Platform.OS === 'ios' ? { clearButtonMode: 'while-editing' as const } : {})}
                  />
                </View>
              <Text style={styles.sortLabel}>Durum</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.sortChipsScroll}
                keyboardShouldPersistTaps="handled"
              >
                <Pressable
                  onPress={() => setTripPlanFilter('all')}
                  style={({ pressed }) => [
                    styles.sortChip,
                    tripPlanFilter === 'all' && styles.sortChipActive,
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <Text
                    style={[
                      styles.sortChipText,
                      tripPlanFilter === 'all' && styles.sortChipTextActive,
                    ]}
                  >
                    Tümü
                  </Text>
                </Pressable>
                {TRIP_PLAN_STATUS_ORDER.map((st) => {
                  const active = tripPlanFilter === st;
                  return (
                    <Pressable
                      key={st}
                      onPress={() => setTripPlanFilter(st)}
                      style={({ pressed }) => [
                        styles.sortChip,
                        active && styles.sortChipActive,
                        pressed && { opacity: 0.9 },
                      ]}
                    >
                      <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>
                        {TRIP_PLAN_STATUS_LABEL_TR[st]}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Text style={styles.sortLabel}>Sırala</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.sortChipsScroll}
                keyboardShouldPersistTaps="handled"
              >
                {(
                  [
                    { id: 'dateAsc' as const, label: 'Tarih ↑' },
                    { id: 'dateDesc' as const, label: 'Tarih ↓' },
                    { id: 'priceAsc' as const, label: 'Fiyat ↑' },
                    { id: 'priceDesc' as const, label: 'Fiyat ↓' },
                  ] as const
                ).map((chip) => {
                  const active = tripSort === chip.id;
                  return (
                    <Pressable
                      key={chip.id}
                      onPress={() => setTripSort(chip.id)}
                      style={({ pressed }) => [
                        styles.sortChip,
                        active && styles.sortChipActive,
                        pressed && { opacity: 0.9 },
                      ]}
                    >
                      <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>
                        {chip.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              </View>
            </View>
          ) : (
            <Text style={styles.sectionLabel}>Senin planların</Text>
          )}

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={theme.color.primary} />
              <Text style={styles.muted}>Rotalar yükleniyor...</Text>
            </View>
          ) : trips.length === 0 ? (
            <View style={[styles.emptyCard, theme.shadowCard]}>
              <LinearGradient
                colors={cardRibbonColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.emptyCardRibbon}
              />
              <Animated.Text style={[styles.emptyEmoji, { transform: [{ scale: emptyEmojiScale }] }]}>
                🌴
              </Animated.Text>
              <Text style={styles.emptyTitle}>İlk maceranı oluştur</Text>
              <Text style={styles.emptySub}>
                Yukarıdaki butonla yeni bir gezi başlat. İstersen hemen bir şehir veya mekan da ekleyebilirsin.
              </Text>
            </View>
          ) : visibleTrips.length === 0 && trips.length > 0 ? (
            <View style={[styles.emptyFilterCard, theme.shadowSoft]}>
              <Text style={styles.emptyFilterTitle}>Sonuç yok</Text>
              <Text style={styles.emptyFilterSub}>
                Arama, durum filtresi veya sıralama için eşleşen rota bulunamadı. Filtreleri veya metni
                değiştir.
              </Text>
            </View>
          ) : (
            <View style={styles.tripSections}>
              <View style={[styles.expandableTripCard, theme.shadowCard]}>
                <Pressable
                  onPress={() => setCreatedTripsExpanded((o) => !o)}
                  style={({ pressed }) => [
                    styles.expandableTripHeader,
                    pressed && { opacity: 0.92 },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: createdTripsExpanded }}
                  accessibilityLabel={`Oluşturduğun rotalar. ${createdSectionSummary}. ${
                    createdTripsExpanded ? 'Daralt' : 'Genişlet'
                  }`}
                >
                  <View style={styles.expandableTripHeaderText}>
                    <Text style={styles.expandableTripTitle}>Oluşturduğun rotalar</Text>
                    <Text style={styles.expandableTripSummary} numberOfLines={2}>
                      {createdSectionSummary}
                    </Text>
                  </View>
                  <Text style={styles.expandableTripChevron}>
                    {createdTripsExpanded ? '▲' : '▼'}
                  </Text>
                </Pressable>
                {createdTripsExpanded ? (
                  <View style={styles.expandableTripBody}>
                    {tripsCreatedByMe.length === 0 ? (
                      <Text style={styles.subSectionEmpty}>
                        Henüz oluşturduğun rota yok. Yukarıdan «Yeni Gezi Planı» ile başlayabilirsin.
                      </Text>
                    ) : (
                      <View style={styles.tripListGap}>
                        {tripsCreatedByMe.map((item, index) => (
                          <View key={item.tripId}>
                            {index > 0 ? <View style={{ height: theme.space.md }} /> : null}
                            {renderTripPlanCard(item, index)}
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                ) : null}
              </View>

              <View style={[styles.expandableTripCard, styles.expandableTripCardSpaced, theme.shadowCard]}>
                <Pressable
                  onPress={() => setInvitedTripsExpanded((o) => !o)}
                  style={({ pressed }) => [
                    styles.expandableTripHeader,
                    pressed && { opacity: 0.92 },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: invitedTripsExpanded }}
                  accessibilityLabel={`Davetle katıldıkların. ${invitedSectionSummary}. ${
                    invitedTripsExpanded ? 'Daralt' : 'Genişlet'
                  }`}
                >
                  <View style={styles.expandableTripHeaderText}>
                    <Text style={styles.expandableTripTitle}>Davetle katıldıkların</Text>
                    <Text style={styles.expandableTripSummary} numberOfLines={2}>
                      {invitedSectionSummary}
                    </Text>
                  </View>
                  <Text style={styles.expandableTripChevron}>
                    {invitedTripsExpanded ? '▲' : '▼'}
                  </Text>
                </Pressable>
                {invitedTripsExpanded ? (
                  <View style={styles.expandableTripBody}>
                    {tripsInvitedJoined.length === 0 ? (
                      <Text style={styles.subSectionEmpty}>
                        Başkasının rotasına davetle eklendiğinde burada listelenir.
                      </Text>
                    ) : (
                      <View style={styles.tripListGap}>
                        {tripsInvitedJoined.map((item, index) => (
                          <View key={item.tripId}>
                            {index > 0 ? <View style={{ height: theme.space.md }} /> : null}
                            {renderTripPlanCard(item, index)}
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                ) : null}
              </View>
            </View>
          )}

          <View style={{ height: theme.space.xl }} />
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

function createHomeStyles(theme: AppTheme) {
  return StyleSheet.create({
    tabScrollFill: {
      flex: 1,
      width: '100%',
      maxWidth: '100%',
      alignSelf: 'stretch',
    },
    scrollContent: {
      paddingBottom: theme.space.xxl,
      width: '100%',
      maxWidth: '100%',
      flexGrow: 1,
      alignItems: 'stretch',
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.space.sm,
      marginBottom: theme.space.lg,
      paddingHorizontal: theme.space.xs,
    },
    topBarLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space.md,
      flex: 1,
      minWidth: 0,
    },
    topBarText: { flex: 1, minWidth: 0 },
    appName: { color: theme.color.text, fontSize: theme.font.h2, fontWeight: '900', letterSpacing: -0.3 },
    appTagline: { color: theme.color.muted, fontSize: theme.font.tiny, fontWeight: '600', marginTop: 2 },
    heroShell: {
      borderRadius: theme.radius.xl,
      paddingVertical: theme.space.lg,
      paddingHorizontal: theme.space.lg,
      marginBottom: theme.space.lg,
      overflow: 'hidden',
    },
    heroCanvas: {
      position: 'relative',
      width: '100%',
    },
    heroFloatLayer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 1,
    },
    heroFloater: {
      position: 'absolute',
      opacity: 0.22,
      fontSize: 34,
    },
    heroFloaterTL: {
      top: 4,
      left: 2,
      transform: [{ rotate: '-14deg' }],
    },
    heroFloaterTR: {
      top: 8,
      right: 0,
      fontSize: 30,
      transform: [{ rotate: '11deg' }],
    },
    heroFloaterML: {
      top: 118,
      left: 4,
      fontSize: 28,
      transform: [{ rotate: '9deg' }],
    },
    heroFloaterMR: {
      top: 108,
      right: 2,
      fontSize: 32,
      transform: [{ rotate: '-11deg' }],
    },
    heroMain: {
      position: 'relative',
      zIndex: 2,
      alignItems: 'center',
      width: '100%',
    },
    heroMiniStrip: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 10,
      marginTop: 4,
      marginBottom: 2,
      paddingHorizontal: theme.space.xs,
    },
    heroMiniBubble: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.16)',
      borderWidth: 2,
    },
    heroMiniEmoji: {
      fontSize: 20,
    },
    heroKicker: {
      color: 'rgba(255,255,255,0.82)',
      fontSize: theme.font.tiny,
      fontWeight: '800',
      letterSpacing: 2,
      textTransform: 'uppercase',
      textAlign: 'center',
      marginBottom: 8,
    },
    heroTitleOnGrad: {
      color: '#FFFFFF',
      fontSize: theme.font.hero,
      fontWeight: '900',
      textAlign: 'center',
      letterSpacing: -0.6,
    },
    heroSubOnGrad: {
      color: 'rgba(255,255,255,0.9)',
      fontSize: theme.font.body,
      lineHeight: 24,
      textAlign: 'center',
      marginTop: theme.space.sm,
      paddingHorizontal: theme.space.xs,
      fontWeight: '600',
    },
    heroSubOnGradSecond: {
      marginTop: theme.space.xs,
    },
    heroMarqueeWrap: {
      marginTop: theme.space.md,
      minHeight: 28,
      justifyContent: 'center',
      width: '100%',
      overflow: 'hidden',
    },
    homeCtaPressable: {
      width: '100%',
      maxWidth: '100%',
      alignSelf: 'stretch',
      borderRadius: theme.radius.pill,
      overflow: 'hidden',
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.38)',
      shadowColor: theme.color.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 20,
      elevation: 14,
    },
    /** Yeni rota butonu — gölge rengi mor ton (keşfetten hafif ayrım) */
    homeCtaPressablePlanShadow: {
      shadowColor: theme.color.accentPurple,
      shadowOpacity: 0.38,
    },
    homeCtaPressed: {
      opacity: 0.92,
    },
    homeCtaGradient: {
      borderRadius: theme.radius.pill,
    },
    homeCtaInner: {
      paddingVertical: 16,
      paddingHorizontal: theme.space.lg,
      alignItems: 'center',
    },
    homeCtaBadge: {
      color: 'rgba(255,255,255,0.95)',
      fontSize: theme.font.tiny,
      fontWeight: '900',
      letterSpacing: 2,
      marginBottom: 6,
    },
    homeCtaTitle: {
      color: '#FFFFFF',
      fontSize: theme.font.h2,
      fontWeight: '900',
      letterSpacing: -0.35,
      textAlign: 'center',
    },
    homeCtaSubtitle: {
      color: 'rgba(255,255,255,0.9)',
      fontSize: theme.font.small,
      fontWeight: '600',
      marginTop: 8,
      textAlign: 'center',
      lineHeight: 20,
      paddingHorizontal: theme.space.sm,
    },
    heroSparkLabel: {
      color: 'rgba(255,255,255,0.95)',
      fontSize: theme.font.small,
      fontWeight: '800',
    },
    plansToolsCard: {
      width: '100%',
      maxWidth: '100%',
      alignSelf: 'stretch',
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.xl,
      borderWidth: 1,
      borderColor: theme.color.cardBorderPrimary,
      padding: theme.space.md,
      marginBottom: theme.space.md,
      overflow: 'hidden',
    },
    plansToolsCardRibbon: {
      height: 4,
      marginLeft: -theme.space.md,
      marginRight: -theme.space.md,
      marginTop: -theme.space.md,
      marginBottom: theme.space.sm,
      borderTopLeftRadius: theme.radius.xl,
      borderTopRightRadius: theme.radius.xl,
    },
    plansToolsCardTitle: {
      color: theme.color.textSecondary,
      fontSize: theme.font.small,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      marginBottom: theme.space.md,
    },
    tripToolbar: {
      gap: theme.space.sm,
    },
    searchShell: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: theme.space.md,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.cardBorderPrimary,
    },
    searchShellInCard: {
      backgroundColor: theme.color.inputBg,
      borderColor: theme.color.border,
    },
    searchIcon: { fontSize: theme.font.body },
    searchInput: {
      flex: 1,
      minWidth: 0,
      paddingVertical: 0,
      fontSize: theme.font.body,
      fontWeight: '600',
      color: theme.color.text,
    },
    sortLabel: {
      color: theme.color.muted,
      fontSize: theme.font.tiny,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginLeft: 2,
    },
    sortChipsScroll: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 4,
      paddingRight: theme.space.xs,
    },
    sortChip: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.inputBg,
    },
    sortChipActive: {
      borderColor: theme.color.primary,
      backgroundColor: theme.color.primarySoft,
    },
    sortChipText: {
      color: theme.color.textSecondary,
      fontSize: theme.font.tiny,
      fontWeight: '800',
    },
    sortChipTextActive: {
      color: theme.color.primaryDark,
    },
    emptyFilterCard: {
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.xl,
      padding: theme.space.lg,
      borderWidth: 1,
      borderColor: theme.color.border,
      marginBottom: theme.space.sm,
    },
    emptyFilterTitle: {
      color: theme.color.text,
      fontSize: theme.font.body,
      fontWeight: '800',
      marginBottom: 6,
    },
    emptyFilterSub: {
      color: theme.color.muted,
      fontSize: theme.font.small,
      lineHeight: 20,
    },
    friendsCard: {
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.xl,
      padding: theme.space.lg,
      borderWidth: 1,
      borderColor: theme.color.cardBorderPrimary,
      alignItems: 'center',
      marginBottom: theme.space.xl,
      overflow: 'hidden',
    },
    friendsCardRibbon: {
      height: 4,
      marginLeft: -theme.space.lg,
      marginRight: -theme.space.lg,
      marginTop: -theme.space.lg,
      marginBottom: theme.space.sm,
      borderTopLeftRadius: theme.radius.xl,
      borderTopRightRadius: theme.radius.xl,
    },
    quickPressed: { opacity: 0.92, transform: [{ scale: 0.98 }] },
    quickEmoji: { fontSize: 28, marginBottom: 6 },
    friendsTitle: { color: theme.color.text, fontSize: theme.font.body, fontWeight: '800' },
    friendsSub: {
      color: theme.color.muted,
      fontSize: theme.font.tiny,
      marginTop: 6,
      textAlign: 'center',
      lineHeight: 18,
      paddingHorizontal: theme.space.sm,
    },
    sectionLabel: {
      color: theme.color.textSecondary,
      fontSize: theme.font.small,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      marginBottom: theme.space.md,
    },
    tripSections: { width: '100%', maxWidth: '100%' },
    expandableTripCard: {
      width: '100%',
      maxWidth: '100%',
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.xl,
      borderWidth: 1,
      borderColor: theme.color.cardBorderPrimary,
      overflow: 'hidden',
    },
    expandableTripCardSpaced: { marginTop: theme.space.lg },
    expandableTripHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.space.md,
      paddingVertical: theme.space.md,
      paddingHorizontal: theme.space.md,
    },
    expandableTripHeaderText: { flex: 1, minWidth: 0 },
    expandableTripTitle: {
      color: theme.color.text,
      fontSize: theme.font.body,
      fontWeight: '900',
    },
    expandableTripSummary: {
      color: theme.color.muted,
      fontSize: theme.font.small,
      fontWeight: '600',
      marginTop: 6,
      lineHeight: 20,
    },
    expandableTripChevron: {
      color: theme.color.primary,
      fontSize: 14,
      fontWeight: '900',
      paddingTop: 2,
    },
    expandableTripBody: {
      paddingHorizontal: theme.space.md,
      paddingBottom: theme.space.md,
      borderTopWidth: 1,
      borderTopColor: theme.color.subtle,
    },
    subSectionLabel: {
      color: theme.color.text,
      fontSize: theme.font.body,
      fontWeight: '800',
      marginBottom: theme.space.sm,
    },
    subSectionLabelSpaced: { marginTop: theme.space.lg },
    subSectionEmpty: {
      color: theme.color.muted,
      fontSize: theme.font.small,
      fontStyle: 'italic',
      lineHeight: 20,
      marginBottom: theme.space.xs,
    },
    tripListGap: { width: '100%', maxWidth: '100%' },
    centered: { paddingVertical: theme.space.xl, alignItems: 'center', gap: 14 },
    muted: { color: theme.color.muted, fontSize: theme.font.small, fontWeight: '600' },
    emptyCard: {
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.xl,
      padding: theme.space.xl,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.color.border,
      overflow: 'hidden',
    },
    emptyCardRibbon: {
      height: 4,
      marginLeft: -theme.space.xl,
      marginRight: -theme.space.xl,
      marginTop: -theme.space.xl,
      marginBottom: theme.space.sm,
      borderTopLeftRadius: theme.radius.xl,
      borderTopRightRadius: theme.radius.xl,
    },
    emptyEmoji: { fontSize: 48, marginBottom: theme.space.sm },
    emptyTitle: { color: theme.color.text, fontSize: theme.font.h2, fontWeight: '800', textAlign: 'center' },
    emptySub: {
      color: theme.color.muted,
      fontSize: theme.font.small,
      lineHeight: 22,
      textAlign: 'center',
      marginTop: theme.space.sm,
    },
    tripCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.xl,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.color.cardBorderPrimary,
    },
    tripStripe: { width: 6, alignSelf: 'stretch', minHeight: 88 },
    tripCardMain: {
      flex: 1,
      minWidth: 0,
      flexShrink: 1,
      paddingVertical: theme.space.md,
      paddingLeft: theme.space.md,
      paddingRight: theme.space.xs,
    },
    tripTitleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      flexWrap: 'nowrap',
    },
    tripStatusChipWrap: { flexShrink: 0, paddingTop: 2 },
    tripTitlePressable: { flex: 1, minWidth: 0 },
    tripTitle: { color: theme.color.text, fontSize: theme.font.body, fontWeight: '800' },
    tripScheduleMain: {
      color: theme.color.text,
      fontSize: theme.font.body,
      marginTop: 8,
      fontWeight: '800',
      lineHeight: 24,
    },
    tripTimes: { color: theme.color.textSecondary, fontSize: theme.font.small, marginTop: 6, fontWeight: '700' },
    tripMetaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 10,
    },
    metaPill: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      maxWidth: '100%',
    },
    metaPillText: {
      color: theme.color.text,
      fontSize: theme.font.tiny,
      fontWeight: '700',
    },
    metaPillKm: {
      backgroundColor: theme.color.primarySoft,
      borderColor: theme.color.cardBorderPrimary,
    },
    metaPillCost: {
      backgroundColor: theme.color.accentSoft,
      borderColor: theme.color.cardBorderAccent,
    },
    metaPillTime: {
      backgroundColor: theme.color.inputBg,
      borderColor: theme.color.border,
    },
    chevronWrap: {
      justifyContent: 'center',
      paddingRight: theme.space.md,
      paddingLeft: 4,
    },
    chevron: {
      fontSize: 28,
      color: theme.color.primary,
      fontWeight: '300',
    },
  });
}
