import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppLogo } from '../components/AppLogo';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { auth } from '../lib/firebase';
import { getTripListMetricsForHome, getTripsForUser, type TripListMetrics } from '../services/trips';
import type { Trip } from '../types/trip';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';
import { formatDrivingDurationMinutes, formatTripScheduleSummary } from '../utils/tripSchedule';

export function HomeScreen(props: {
  onCreateTrip: () => void;
  onOpenTrip: (tripId: string) => void;
  onOpenProfile: () => void;
  onOpenFriends: () => void;
}) {
  const theme = useAppTheme();
  const styles = useMemo(() => createHomeStyles(theme), [theme]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripMetrics, setTripMetrics] = useState<Map<string, TripListMetrics>>(new Map());
  const [loading, setLoading] = useState(true);
  const uid = auth.currentUser?.uid;

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const list = await getTripsForUser(uid);
      const metrics = await getTripListMetricsForHome(list.map((t) => t.tripId));
      setTrips(list);
      setTripMetrics(metrics);
    } catch (_) {
      setTrips([]);
      setTripMetrics(new Map());
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <AppLogo size={76} />
          <Text style={styles.heroTitle}>Nereye gidiyoruz?</Text>
          <Text style={styles.heroSub}>
            Rotalarını renklendir: duraklar, süreler, masraf ve yakıt tek ekranda. Arkadaşlarınla birlikte
            planla.
          </Text>
        </View>

        <PrimaryButton title="✨ Yeni gezi planı" onPress={props.onCreateTrip} />
        <View style={{ height: theme.space.sm }} />

        <View style={styles.quickRow}>
          <Pressable
            onPress={props.onOpenFriends}
            style={({ pressed }) => [styles.quickCard, pressed && styles.quickPressed]}
          >
            <Text style={styles.quickEmoji}>👥</Text>
            <Text style={styles.quickTitle}>Arkadaşlar</Text>
            <Text style={styles.quickSub}>Liste & gruplar</Text>
          </Pressable>
          <Pressable
            onPress={props.onOpenProfile}
            style={({ pressed }) => [styles.quickCard, pressed && styles.quickPressed]}
          >
            <Text style={styles.quickEmoji}>🚗</Text>
            <Text style={styles.quickTitle}>Profil</Text>
            <Text style={styles.quickSub}>Araç & tüketim</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>Senin planların</Text>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={theme.color.primary} />
            <Text style={styles.muted}>Rotalar yükleniyor...</Text>
          </View>
        ) : trips.length === 0 ? (
          <View style={[styles.emptyCard, theme.shadowCard]}>
            <Text style={styles.emptyEmoji}>🌴</Text>
            <Text style={styles.emptyTitle}>İlk maceranı oluştur</Text>
            <Text style={styles.emptySub}>
              Yukarıdaki butonla yeni bir gezi başlat. İstersen hemen bir şehir veya mekan da ekleyebilirsin.
            </Text>
          </View>
        ) : (
          <FlatList
            data={trips}
            scrollEnabled={false}
            keyExtractor={(item) => item.tripId}
            renderItem={({ item, index }) => {
              const stripe = theme.tripStripes[index % theme.tripStripes.length];
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
              return (
                <Pressable
                  onPress={() => props.onOpenTrip(item.tripId)}
                  style={({ pressed }) => [
                    styles.tripCard,
                    theme.shadowCard,
                    pressed && styles.tripPressed,
                  ]}
                >
                  <View style={[styles.tripStripe, { backgroundColor: stripe }]} />
                  <View style={styles.tripBody}>
                    <Text style={styles.tripTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={styles.tripScheduleMain}>📅 {sched.combinedLine}</Text>
                    {showExtraTimeLine ? (
                      <Text style={styles.tripTimes}>🕐 {sched.timeLine}</Text>
                    ) : null}
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
                  <View style={styles.chevronWrap}>
                    <Text style={styles.chevron}>›</Text>
                  </View>
                </Pressable>
              );
            }}
            ItemSeparatorComponent={() => <View style={{ height: theme.space.md }} />}
          />
        )}

        <Pressable onPress={() => auth.signOut()} style={styles.signOutWrap}>
          <Text style={styles.signOutText}>Çıkış yap</Text>
        </Pressable>
        <View style={{ height: theme.space.xl }} />
      </ScrollView>
    </Screen>
  );
}

function createHomeStyles(theme: AppTheme) {
  return StyleSheet.create({
    scrollContent: { paddingBottom: theme.space.xxl },
    hero: {
      marginBottom: theme.space.lg,
      alignItems: 'center',
    },
    heroTitle: {
      color: theme.color.text,
      fontSize: theme.font.hero,
      fontWeight: '900',
      textAlign: 'center',
      letterSpacing: -0.5,
      marginTop: theme.space.sm,
    },
    heroSub: {
      color: theme.color.muted,
      fontSize: theme.font.body,
      lineHeight: 24,
      textAlign: 'center',
      marginTop: theme.space.sm,
      paddingHorizontal: theme.space.sm,
    },
    quickRow: { flexDirection: 'row', gap: theme.space.sm, marginBottom: theme.space.xl },
    quickCard: {
      flex: 1,
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.lg,
      padding: theme.space.md,
      borderWidth: 1,
      borderColor: theme.color.border,
      alignItems: 'center',
      ...theme.shadowCard,
    },
    quickPressed: { opacity: 0.92, transform: [{ scale: 0.98 }] },
    quickEmoji: { fontSize: 28, marginBottom: 6 },
    quickTitle: { color: theme.color.text, fontSize: theme.font.body, fontWeight: '800' },
    quickSub: { color: theme.color.muted, fontSize: theme.font.tiny, marginTop: 2 },
    sectionLabel: {
      color: theme.color.textSecondary,
      fontSize: theme.font.small,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      marginBottom: theme.space.md,
    },
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
    tripPressed: { opacity: 0.95 },
    tripStripe: { width: 6, alignSelf: 'stretch', minHeight: 88 },
    tripBody: {
      flex: 1,
      minWidth: 0,
      flexShrink: 1,
      paddingVertical: theme.space.md,
      paddingHorizontal: theme.space.md,
    },
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
    signOutWrap: { marginTop: theme.space.xl, alignItems: 'center', paddingVertical: theme.space.md },
    signOutText: { color: theme.color.muted, fontSize: theme.font.small, fontWeight: '700' },
  });
}
