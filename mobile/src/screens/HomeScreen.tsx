import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppLogo } from '../components/AppLogo';
import { HomeWeatherCard } from '../components/HomeWeatherCard';
import { InboxBellMenu } from '../components/InboxBellMenu';
import { LeaveTripConfirmModal } from '../components/LeaveTripConfirmModal';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { TripPlanStatusChip } from '../components/TripPlanStatusChip';
import { auth } from '../lib/firebase';
import { getInboxSummary, type InboxSummary } from '../services/activityInbox';
import {
  getTripListMetricsForHome,
  getTripsForUser,
  leaveTripAsAttendee,
  updateTripPlanStatus,
  type TripListMetrics,
} from '../services/trips';
import type { HomeStackParamList, MainTabParamList } from '../navigation/types';
import type { Trip } from '../types/trip';
import { useAppTheme, useThemeMode } from '../ThemeContext';
import type { AppTheme } from '../theme';
import { formatDrivingDurationMinutes, formatTripScheduleSummary } from '../utils/tripSchedule';
import { nextTripPlanStatus } from '../utils/tripPlanStatus';

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
  const uid = auth.currentUser?.uid;

  const contentFade = useRef(new Animated.Value(0)).current;
  const contentSlide = useRef(new Animated.Value(18)).current;
  const emptyEmojiScale = useRef(new Animated.Value(1)).current;

  const heroGrad = useMemo((): [string, string, string] => {
    if (mode === 'dark') return ['#0369A1', '#4F46E5', '#7C3AED'];
    return ['#38BDF8', '#818CF8', '#F472B6'];
  }, [mode]);

  const { tripsCreatedByMe, tripsInvitedJoined } = useMemo(() => {
    if (!uid) return { tripsCreatedByMe: [] as Trip[], tripsInvitedJoined: [] as Trip[] };
    const created = trips.filter((t) => t.adminId === uid);
    const invited = trips.filter((t) => t.adminId !== uid);
    return { tripsCreatedByMe: created, tripsInvitedJoined: invited };
  }, [trips, uid]);

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
              <View style={styles.tripTitlePressable}>
                <Text style={styles.tripTitle} numberOfLines={2}>
                  {item.title}
                </Text>
              </View>
              <TripPlanStatusChip
                status={item.planStatus}
                compact
                interactive={canChangeStatus}
                busy={planStatusBusyTripId === item.tripId}
                onPressCycle={() => void handleCyclePlanStatus(item.tripId)}
              />
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
    <Screen>
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
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
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
            <Text style={styles.heroKicker}>Bugün</Text>
            <Text style={styles.heroTitleOnGrad}>Nereye gidiyoruz?</Text>
            <Text style={styles.heroSubOnGrad}>
              Duraklar, süre, masraf ve yakıt — arkadaşlarınla birlikte planla. Bildirimler sağ üstte.
            </Text>
            <View style={styles.heroSparkRow}>
              <Text style={styles.heroSpark}>✨</Text>
              <Text style={styles.heroSparkLabel}>Planla · Paylaş · Keşfet</Text>
              <Text style={styles.heroSpark}>✨</Text>
            </View>
          </LinearGradient>

          <PrimaryButton title="✨ Yeni gezi planı" onPress={props.onCreateTrip} />
          <View style={{ height: theme.space.sm }} />

          <View style={styles.quickChipsRow}>
            <Pressable
              onPress={() =>
                navigation.getParent()?.navigate('DiscoverTab', { screen: 'Discover', params: undefined })
              }
              style={({ pressed }) => [styles.quickChip, pressed && styles.quickChipPressed]}
            >
              <Text style={styles.quickChipEmoji}>🧭</Text>
              <Text style={styles.quickChipText}>Keşfet</Text>
            </Pressable>
            <Pressable
              onPress={props.onOpenFriends}
              style={({ pressed }) => [styles.quickChip, pressed && styles.quickChipPressed]}
            >
              <Text style={styles.quickChipEmoji}>👥</Text>
              <Text style={styles.quickChipText}>Arkadaşlar</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('Groups')}
              style={({ pressed }) => [styles.quickChip, pressed && styles.quickChipPressed]}
            >
              <Text style={styles.quickChipEmoji}>📁</Text>
              <Text style={styles.quickChipText}>Gruplar</Text>
            </Pressable>
          </View>
          <View style={{ height: theme.space.md }} />

          <Pressable
            onPress={props.onOpenFriends}
            style={({ pressed }) => [styles.friendsCard, theme.shadowCard, pressed && styles.quickPressed]}
          >
            <Text style={styles.quickEmoji}>👥</Text>
            <Text style={styles.friendsTitle}>Arkadaşlar & gruplar</Text>
            <Text style={styles.friendsSub}>
              Gelen istekler, grup davetleri ve liste — Keşfet’te puan, sıralama ve topluluk anketi.
            </Text>
          </Pressable>

          <Text style={styles.sectionLabel}>Senin planların</Text>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={theme.color.primary} />
              <Text style={styles.muted}>Rotalar yükleniyor...</Text>
            </View>
          ) : trips.length === 0 ? (
            <View style={[styles.emptyCard, theme.shadowCard]}>
              <Animated.Text style={[styles.emptyEmoji, { transform: [{ scale: emptyEmojiScale }] }]}>
                🌴
              </Animated.Text>
              <Text style={styles.emptyTitle}>İlk maceranı oluştur</Text>
              <Text style={styles.emptySub}>
                Yukarıdaki butonla yeni bir gezi başlat. İstersen hemen bir şehir veya mekan da ekleyebilirsin.
              </Text>
            </View>
          ) : (
            <View style={styles.tripSections}>
              <Text style={styles.subSectionLabel}>Oluşturduğun rotalar</Text>
              {tripsCreatedByMe.length === 0 ? (
                <Text style={styles.subSectionEmpty}>
                  Henüz oluşturduğun rota yok. Yukarıdan «Yeni gezi planı» ile başlayabilirsin.
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

              <Text style={[styles.subSectionLabel, styles.subSectionLabelSpaced]}>
                Davetle katıldıkların
              </Text>
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
          )}

          <View style={{ height: theme.space.xl }} />
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

function createHomeStyles(theme: AppTheme) {
  return StyleSheet.create({
    scrollContent: {
      paddingBottom: theme.space.xxl,
      width: '100%',
      maxWidth: '100%',
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
    heroSparkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      marginTop: theme.space.md,
    },
    heroSpark: { fontSize: theme.font.body },
    heroSparkLabel: {
      color: 'rgba(255,255,255,0.95)',
      fontSize: theme.font.small,
      fontWeight: '800',
    },
    quickChipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      justifyContent: 'center',
    },
    quickChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.cardBorderPrimary,
    },
    quickChipPressed: { opacity: 0.9, transform: [{ scale: 0.97 }] },
    quickChipEmoji: { fontSize: theme.font.body },
    quickChipText: {
      color: theme.color.text,
      fontSize: theme.font.small,
      fontWeight: '800',
    },
    friendsCard: {
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.xl,
      padding: theme.space.lg,
      borderWidth: 1,
      borderColor: theme.color.cardBorderPrimary,
      alignItems: 'center',
      marginBottom: theme.space.xl,
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
      gap: 8,
      flexWrap: 'wrap',
    },
    tripTitlePressable: { flex: 1, minWidth: 0 },
    tripTitle: { color: theme.color.text, fontSize: theme.font.h2, fontWeight: '800' },
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
