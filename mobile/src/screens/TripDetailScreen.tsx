import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useMemo, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AddPlaceModal } from '../components/AddPlaceModal';
import { DeleteStopConfirmModal } from '../components/DeleteStopConfirmModal';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { StopCard } from '../components/StopCard';
import { TextField } from '../components/TextField';
import { auth } from '../lib/firebase';
import { getGroupsForUser } from '../services/groups';
import { getUserProfile } from '../services/userProfile';
import {
  approveProposal,
  createEditStopProposal,
  getPendingProposalsForTrip,
  rejectProposal,
} from '../services/tripProposals';
import {
  addAttendeeToTrip,
  addStop,
  deleteStop,
  deleteTrip,
  getStopsForTrip,
  getTrip,
  recalculateLegsForTrip,
  reorderStops,
  updateAttendeeRsvp,
  updateStopFromPayload,
  updateStopStatus,
  updateTripDistanceAndFuel,
  updateTripVehiclePlanning,
} from '../services/trips';
import type { Group } from '../types/group';
import type { Stop as StopType, Trip } from '../types/trip';
import type { EditStopPayload, TripProposal } from '../types/tripProposal';
import type { ExpenseType, UserProfile } from '../services/userProfile';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import { formatTripScheduleSummary } from '../utils/tripSchedule';
import { normalizeStopExtraExpenses, stopExtraTotal } from '../utils/stopExpenses';

const RSVP_LABELS: Record<string, string> = {
  going: 'Katılıyorum',
  maybe: 'Belki',
  declined: 'Katılamıyorum',
};

export function TripDetailScreen(props: {
  tripId: string;
  openAddPlace?: boolean;
  onBack: () => void;
}) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [stops, setStops] = useState<StopType[]>([]);
  const [userProfiles, setUserProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [relocateStopId, setRelocateStopId] = useState<string | null>(null);
  const [addAttendeeModal, setAddAttendeeModal] = useState(false);
  const [friendUids, setFriendUids] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState<'editor' | 'viewer'>('editor');
  const [distanceInput, setDistanceInput] = useState('');
  const [fuelPriceInput, setFuelPriceInput] = useState('');
  const [savingCost, setSavingCost] = useState(false);
  const [addPlaceModalVisible, setAddPlaceModalVisible] = useState(Boolean(props.openAddPlace));
  const [copied, setCopied] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [addingGroupId, setAddingGroupId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<TripProposal[]>([]);
  const [vehicleLabelInput, setVehicleLabelInput] = useState('');
  const [tripConsumptionInput, setTripConsumptionInput] = useState('');
  const [fuelPriceTripInput, setFuelPriceTripInput] = useState('');
  const [recalculatingLegs, setRecalculatingLegs] = useState(false);
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [proposalBusy, setProposalBusy] = useState<string | null>(null);
  const [myExpenseTypes, setMyExpenseTypes] = useState<ExpenseType[]>([]);
  const [planExtraBreakdownOpen, setPlanExtraBreakdownOpen] = useState(false);
  const [deleteStopTarget, setDeleteStopTarget] = useState<StopType | null>(null);
  const [deleteStopBusy, setDeleteStopBusy] = useState(false);
  const currentUid = auth.currentUser?.uid;
  const appTheme = useAppTheme();
  const styles = useMemo(() => createTripDetailStyles(appTheme), [appTheme]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const inviteUrl =
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname || '/'}?invite=${props.tripId}`
      : `https://trip-plan.invite/${props.tripId}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, s] = await Promise.all([getTrip(props.tripId), getStopsForTrip(props.tripId)]);
      setTrip(t ?? null);
      setStops(s);
      if (t) {
        const pend = await getPendingProposalsForTrip(props.tripId);
        setProposals(pend);
        setVehicleLabelInput(t.vehicleLabel ?? '');
        const meForTrip = currentUid ? await getUserProfile(currentUid) : null;
        const cons =
          t.tripConsumptionLPer100km != null
            ? String(t.tripConsumptionLPer100km)
            : meForTrip?.carConsumption
              ? String(meForTrip.carConsumption)
              : '';
        setTripConsumptionInput(cons);
        setFuelPriceTripInput(
          t.fuelPricePerLiter != null ? String(t.fuelPricePerLiter) : ''
        );
      }
      if (t?.attendees?.length) {
        const uids = t.attendees.map((a) => a.uid);
        const myProfile = currentUid ? await getUserProfile(currentUid) : null;
        const allUids = [...uids];
        if (myProfile?.friends?.length) {
          myProfile.friends.forEach((f) => {
            if (!allUids.includes(f)) allUids.push(f);
          });
        }
        const map = new Map<string, UserProfile>();
        await Promise.all(
          allUids.map(async (id) => {
            const u = await getUserProfile(id);
            if (u) map.set(id, u);
          })
        );
        setUserProfiles(map);
      }
      if (currentUid && t) {
        const [me, groupList] = await Promise.all([
          getUserProfile(currentUid),
          getGroupsForUser(currentUid),
        ]);
        setFriendUids(me?.friends ?? []);
        setGroups(groupList);
        setMyExpenseTypes(me?.expenseTypes ?? []);
      } else if (currentUid) {
        const me = await getUserProfile(currentUid);
        setMyExpenseTypes(me?.expenseTypes ?? []);
      } else {
        setMyExpenseTypes([]);
      }
      if (t?.totalDistance != null && t.totalDistance > 0) setDistanceInput(String(t.totalDistance));
    } catch (e: any) {
      setError(e?.message || 'Yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [props.tripId, currentUid]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const friendsNotInTrip = useMemo(() => {
    if (!trip) return [];
    const inTrip = new Set(trip.attendees.map((a) => a.uid));
    return friendUids.filter((uid) => !inTrip.has(uid));
  }, [trip, friendUids]);

  const goingCount = useMemo(
    () => trip?.attendees.filter((a) => a.rsvp === 'going').length ?? 0,
    [trip]
  );

  const distanceFromLegs = useMemo(() => {
    let sum = 0;
    for (const st of stops) {
      if (st.legFromPrevious?.distanceKm != null) sum += st.legFromPrevious.distanceKm;
    }
    return Math.round(sum * 10) / 10;
  }, [stops]);

  const durationFromLegs = useMemo(() => {
    let sum = 0;
    for (const st of stops) {
      if (st.legFromPrevious?.durationMin != null) sum += st.legFromPrevious.durationMin;
    }
    return Math.round(sum);
  }, [stops]);

  const totalExtraCosts = useMemo(
    () =>
      Math.round(stops.reduce((s, st) => s + stopExtraTotal(st), 0) * 100) / 100,
    [stops]
  );

  const extraCostsByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const st of stops) {
      for (const e of normalizeStopExtraExpenses(st)) {
        const key =
          (e.extraExpenseTypeName && String(e.extraExpenseTypeName).trim()) || 'Tür belirtilmedi';
        map.set(key, Math.round(((map.get(key) ?? 0) + e.amount) * 100) / 100);
      }
    }
    return Array.from(map.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
  }, [stops]);

  const extraBreakdownSummary = useMemo(() => {
    if (extraCostsByCategory.length === 0) return 'Henüz ekstra masraf yok';
    const top = extraCostsByCategory.slice(0, 3);
    const parts = top.map((x) => `${x.name} ${x.total.toFixed(0)} ₺`);
    const more =
      extraCostsByCategory.length > 3 ? ` +${extraCostsByCategory.length - 3} tür` : '';
    return `${extraCostsByCategory.length} grup · ${parts.join(' · ')}${more}`;
  }, [extraCostsByCategory]);

  const planSummaryCollapsed = useMemo(() => {
    const fuel = trip?.totalFuelCost ?? 0;
    const grand = Math.round((fuel + totalExtraCosts) * 100) / 100;
    return `${stops.length} durak · ${totalExtraCosts.toFixed(0)} ₺ ekstra · ${grand.toFixed(0)} ₺ toplam`;
  }, [trip, stops.length, totalExtraCosts]);

  const stopsWithCoordsCount = useMemo(
    () =>
      stops.filter((s) => s.coords?.latitude != null && s.coords?.longitude != null).length,
    [stops]
  );

  const displayName = (uid: string) =>
    userProfiles.get(uid)?.displayName?.trim() || userProfiles.get(uid)?.phoneNumber || uid.slice(0, 8);

  async function handlePlacePicked(params: {
    locationName: string;
    coords: { latitude: number; longitude: number };
  }) {
    const relocating = relocateStopId;
    setRelocateStopId(null);
    setAddPlaceModalVisible(false);
    if (!currentUid || !trip) return;

    if (relocating) {
      const isTripAdmin = trip.adminId === currentUid;
      const myRole = trip.attendees.find((a) => a.uid === currentUid)?.role ?? 'viewer';
      const isEditor = myRole === 'editor';
      const canPropose = isEditor && !isTripAdmin;
      setError(null);
      try {
        if (isTripAdmin) {
          await updateStopFromPayload(relocating, {
            locationName: params.locationName,
            coords: params.coords,
          });
          await recalculateLegsForTrip(props.tripId);
        } else if (canPropose) {
          await handleProposeChange(relocating, {
            locationName: params.locationName,
            coords: params.coords,
          });
        }
      } catch (e: any) {
        setError(e?.message || 'Konum güncellenemedi.');
      }
      await load();
      return;
    }

    try {
      await addStop({
        tripId: props.tripId,
        locationName: params.locationName,
        createdBy: currentUid,
        status: trip.adminId === currentUid ? 'approved' : 'pending',
        coords: params.coords,
        order: stops.length,
      });
      try {
        await recalculateLegsForTrip(props.tripId);
      } catch (e: any) {
        setError(e?.message || 'Yol mesafeleri güncellenemedi (Routes API / anahtar).');
      }
    } catch (e: any) {
      setError(e?.message || 'Durak eklenemedi.');
    }
    await load();
  }

  async function handleToggleStopStatus(stop: StopType) {
    if (trip?.adminId !== currentUid) return;
    const next = stop.status === 'approved' ? 'pending' : 'approved';
    try {
      await updateStopStatus(stop.stopId, next);
      await load();
    } catch (_) {}
  }

  async function handleMoveStop(index: number, direction: 'up' | 'down') {
    if (trip?.adminId !== currentUid || stops.length < 2) return;
    const newOrder = [...stops];
    const swap = direction === 'up' ? index - 1 : index + 1;
    if (swap < 0 || swap >= newOrder.length) return;
    [newOrder[index], newOrder[swap]] = [newOrder[swap], newOrder[index]];
    try {
      await reorderStops(props.tripId, newOrder.map((s) => s.stopId));
      try {
        await recalculateLegsForTrip(props.tripId);
      } catch (e: any) {
        setError(e?.message || 'Yol mesafeleri güncellenemedi (Routes API / anahtar).');
      }
      await load();
    } catch (_) {}
  }

  function openDeleteStopModal(stop: StopType) {
    if (trip?.adminId !== currentUid) return;
    setDeleteStopTarget(stop);
  }

  async function executeDeleteStop() {
    const stop = deleteStopTarget;
    if (!stop || trip?.adminId !== currentUid) return;
    setDeleteStopBusy(true);
    setError(null);
    try {
      await deleteStop(stop.stopId);
      const rest = await getStopsForTrip(props.tripId);
      if (rest.length > 0) {
        await reorderStops(
          props.tripId,
          rest.map((s) => s.stopId)
        );
      }
      try {
        await recalculateLegsForTrip(props.tripId);
      } catch (e: any) {
        setError(e?.message || 'Yol mesafeleri güncellenemedi (Routes API / anahtar).');
      }
      setDeleteStopTarget(null);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Durak silinemedi.');
    } finally {
      setDeleteStopBusy(false);
    }
  }

  async function handleCopyInviteLink() {
    await Clipboard.setStringAsync(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShareInvite() {
    try {
      await Share.share({
        title: trip?.title ?? 'Rota daveti',
        message: `${trip?.title ?? 'Rota'} daveti: ${inviteUrl}`,
        url: inviteUrl,
      });
    } catch (_) {}
  }

  async function handleAddAttendee(uid: string) {
    try {
      await addAttendeeToTrip(props.tripId, uid, selectedRole);
      setAddAttendeeModal(false);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Eklenemedi.');
    }
  }

  async function handleAddGroupToTrip(group: Group) {
    if (!trip) return;
    const inTrip = new Set(trip.attendees.map((a) => a.uid));
    const toAdd = group.memberIds.filter((uid) => !inTrip.has(uid));
    if (toAdd.length === 0) return;
    setAddingGroupId(group.groupId);
    try {
      for (const uid of toAdd) {
        await addAttendeeToTrip(props.tripId, uid, selectedRole);
      }
      await load();
    } catch (e: any) {
      setError(e?.message || 'Grup eklenemedi.');
    } finally {
      setAddingGroupId(null);
    }
  }

  async function handleSetRsvp(rsvp: 'going' | 'maybe' | 'declined') {
    if (!currentUid) return;
    try {
      await updateAttendeeRsvp(props.tripId, currentUid, rsvp);
      await load();
    } catch (_) {}
  }

  async function handleProposeChange(stopId: string, payload: EditStopPayload) {
    if (!currentUid) return;
    await createEditStopProposal({
      tripId: props.tripId,
      stopId,
      proposedBy: currentUid,
      payload,
    });
  }

  async function handleApproveProposal(proposalId: string) {
    setProposalBusy(proposalId);
    try {
      await approveProposal(proposalId);
      try {
        await recalculateLegsForTrip(props.tripId);
      } catch (e: any) {
        setError(e?.message || 'Yol mesafeleri güncellenemedi (Routes API / anahtar).');
      }
      await load();
    } catch (e: any) {
      setError(e?.message || 'Onaylanamadı.');
    } finally {
      setProposalBusy(null);
    }
  }

  async function handleRejectProposal(proposalId: string) {
    setProposalBusy(proposalId);
    try {
      await rejectProposal(proposalId);
      await load();
    } catch (_) {
    } finally {
      setProposalBusy(null);
    }
  }

  async function handleRecalculateLegs() {
    setRecalculatingLegs(true);
    setError(null);
    try {
      const r = await recalculateLegsForTrip(props.tripId);
      if (!r) {
        setError('En az iki durakta haritadan seçilmiş konum olmalı. Durak eklerken yer araması kullan.');
      } else {
        setDistanceInput(String(r.totalKm));
      }
      await load();
    } catch (e: any) {
      setError(e?.message || 'Bacaklar hesaplanamadı.');
    } finally {
      setRecalculatingLegs(false);
    }
  }

  function confirmDeleteTrip() {
    Alert.alert(
      'Rotayı sil',
      'Bu rota ve tüm durakları kalıcı olarak silinir. Katılımcılar da erişemez. Emin misin?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTrip(props.tripId);
              navigation.navigate('Home');
            } catch (e: any) {
              setError(e?.message || 'Rota silinemedi.');
            }
          },
        },
      ]
    );
  }

  async function handleSaveVehicleAndFuel() {
    if (!trip) return;
    const distManual = parseFloat(distanceInput.replace(',', '.'));
    const fuelPrice = parseFloat(
      (fuelPriceTripInput || fuelPriceInput).replace(',', '.')
    );
    const consumption = parseFloat(tripConsumptionInput.replace(',', '.'));
    const dist =
      distanceFromLegs > 0 ? distanceFromLegs : !isNaN(distManual) && distManual > 0 ? distManual : NaN;
    if (isNaN(dist) || dist < 0) {
      setError('Mesafe: bacakları güncelle veya km gir.');
      return;
    }
    let totalFuelCost = trip.totalFuelCost ?? 0;
    if (!isNaN(fuelPrice) && fuelPrice >= 0 && !isNaN(consumption) && consumption > 0) {
      totalFuelCost = (dist / 100) * consumption * fuelPrice;
    }
    setSavingVehicle(true);
    setSavingCost(true);
    try {
      await updateTripVehiclePlanning(props.tripId, {
        vehicleLabel: vehicleLabelInput.trim() || undefined,
        tripConsumptionLPer100km: !isNaN(consumption) ? consumption : undefined,
        fuelPricePerLiter: !isNaN(fuelPrice) ? fuelPrice : undefined,
        totalDistance: dist,
        totalFuelCost: Math.round(totalFuelCost * 100) / 100,
      });
      await load();
    } finally {
      setSavingVehicle(false);
      setSavingCost(false);
    }
  }

  async function handleSaveCost() {
    await handleSaveVehicleAndFuel();
  }

  const perPersonFuel =
    goingCount > 0 && trip?.totalFuelCost != null && trip.totalFuelCost > 0
      ? Math.round((trip.totalFuelCost / goingCount) * 100) / 100
      : null;

  if (loading && !trip) {
    return (
      <Screen>
        <View style={styles.centered}>
          <ActivityIndicator color={appTheme.color.primary} />
          <Text style={styles.muted}>Yükleniyor...</Text>
        </View>
      </Screen>
    );
  }

  if (!trip) {
    return (
      <Screen>
        <View style={styles.centered}>
          <Text style={styles.error}>Rota bulunamadı.</Text>
          <View style={{ height: appTheme.space.md }} />
          <PrimaryButton title="Geri" onPress={props.onBack} />
        </View>
      </Screen>
    );
  }

  const isAdmin = trip.adminId === currentUid;
  const myRole = trip.attendees.find((a) => a.uid === currentUid)?.role ?? 'viewer';
  const isEditor = myRole === 'editor';
  const canAddStops = isAdmin || isEditor;
  const canManageParticipants = isAdmin || isEditor;
  const editorCanPropose = isEditor && !isAdmin;

  function formatDrivingDuration(totalMin: number): string {
    if (totalMin <= 0) return '–';
    if (totalMin < 60) return `~${totalMin} dk`;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return m > 0 ? `~${h} sa ${m} dk` : `~${h} sa`;
  }

  const fuelCostNum = trip.totalFuelCost ?? 0;
  const grandTotalCost = Math.round((fuelCostNum + totalExtraCosts) * 100) / 100;
  const perPersonGrand =
    goingCount > 0 && grandTotalCost > 0
      ? Math.round((grandTotalCost / goingCount) * 100) / 100
      : null;

  const kmDisplay =
    distanceFromLegs > 0
      ? `~${distanceFromLegs} km`
      : trip.totalDistance != null && trip.totalDistance > 0
        ? `${trip.totalDistance} km`
        : '–';
  const timeDisplay =
    durationFromLegs > 0 ? formatDrivingDuration(durationFromLegs) : '–';

  function proposalSummary(p: TripProposal): string {
    const x = p.payload;
    const parts: string[] = [];
    if (x.locationName) parts.push(`Ad: ${x.locationName}`);
    if (x.arrivalTime || x.departureTime)
      parts.push(`Saat: ${x.arrivalTime ?? '–'} – ${x.departureTime ?? '–'}`);
    if (x.extraExpenses && Array.isArray(x.extraExpenses) && x.extraExpenses.length > 0) {
      const t = x.extraExpenses.reduce(
        (s, e: { amount?: number }) => s + (typeof e?.amount === 'number' && !isNaN(e.amount) ? e.amount : 0),
        0
      );
      parts.push(`Masraf: ${x.extraExpenses.length} satır · ${Math.round(t * 100) / 100} TL`);
    } else if (x.cost != null) {
      parts.push(`Masraf: ${x.cost} TL`);
    }
    if (x.extraExpenseTypeName) parts.push(`Tür: ${x.extraExpenseTypeName}`);
    if (x.coords) parts.push(`Konum güncellemesi`);
    return parts.join(' · ') || 'Değişiklik';
  }

  function stopNameForProposal(stopId: string): string {
    return stops.find((s) => s.stopId === stopId)?.locationName ?? 'Durak';
  }

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={Platform.OS === 'android' ? false : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={props.onBack} style={styles.backRow}>
            <Text style={styles.backText}>‹ Geri</Text>
          </Pressable>
          <Text style={styles.tripEmoji}>🧭</Text>
          <Text style={styles.title} numberOfLines={3}>
            {trip.title}
          </Text>
          {(() => {
            const sched = formatTripScheduleSummary(
              trip.startDate,
              trip.endDate,
              trip.startTime,
              trip.endTime
            );
            const showExtraTimeLine =
              sched.timeLine != null &&
              sched.combinedLine === sched.dateLine &&
              Boolean(trip.startTime?.trim() || trip.endTime?.trim());
            return (
              <>
                <Text style={styles.scheduleCombined}>📅 {sched.combinedLine}</Text>
                {showExtraTimeLine ? (
                  <Text style={styles.planTimes}>🕐 {sched.timeLine}</Text>
                ) : null}
              </>
            );
          })()}
          {isAdmin && (
            <View style={styles.adminTripActions}>
              <View style={styles.adminTripBtnHalf}>
                <PrimaryButton
                  title="✏️ Düzenle"
                  onPress={() => navigation.navigate('EditTrip', { tripId: props.tripId })}
                />
              </View>
              <View style={styles.adminTripBtnHalf}>
                <PrimaryButton title="🗑️ Sil" variant="danger" onPress={confirmDeleteTrip} />
              </View>
            </View>
          )}
        </View>

        {error ? <Text style={styles.errorLine}>{error}</Text> : null}

        <CollapsibleSection
          title="Katılımcılar"
          collapsedSummary={`${trip.attendees.length} kişi · ${goingCount} katılıyor`}
          defaultOpen={false}
          compact
          smallTitle
          containerStyle={styles.section}
          headerRight={
            canManageParticipants ? (
              <Pressable onPress={() => setAddAttendeeModal(true)} style={styles.linkBtn}>
                <Text style={styles.linkBtnText}>+ Katılımcı ekle</Text>
              </Pressable>
            ) : null
          }
        >
          <View style={styles.inviteRow}>
            <Pressable onPress={handleCopyInviteLink} style={styles.inviteBtn}>
              <Text style={styles.inviteBtnText}>
                {copied ? 'Kopyalandı!' : 'Davet linkini kopyala'}
              </Text>
            </Pressable>
            <Pressable onPress={handleShareInvite} style={styles.inviteBtn}>
              <Text style={styles.inviteBtnText}>Paylaş</Text>
            </Pressable>
          </View>
          {trip.attendees.map((a) => (
            <View key={a.uid} style={styles.attendeeRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.attendeeName}>{displayName(a.uid)}</Text>
                <Text style={styles.attendeeMeta}>
                  {a.role === 'admin' ? 'Admin' : a.role === 'editor' ? 'Editör' : 'İzleyici'}
                  {a.rsvp ? ` · ${RSVP_LABELS[a.rsvp] ?? a.rsvp}` : ''}
                </Text>
              </View>
              {a.uid === currentUid && (
                <View style={styles.rsvpRow}>
                  {(['going', 'maybe', 'declined'] as const).map((r) => (
                    <Pressable
                      key={r}
                      onPress={() => handleSetRsvp(r)}
                      style={[styles.rsvpBtn, a.rsvp === r ? styles.rsvpBtnActive : null]}
                    >
                      <Text style={styles.rsvpBtnText}>{RSVP_LABELS[r]}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          ))}
        </CollapsibleSection>

        <CollapsibleSection
          title="Araç ve yakıt"
          collapsedSummary={
            trip.vehicleLabel?.trim()
              ? `${trip.vehicleLabel.trim()} · yakıt ${fuelCostNum.toFixed(0)} ₺`
              : `Yakıt ${fuelCostNum.toFixed(0)} ₺ · ${
                  distanceFromLegs > 0
                    ? `~${distanceFromLegs} km`
                    : trip.totalDistance != null && trip.totalDistance > 0
                      ? `${trip.totalDistance} km`
                      : 'mesafe —'
                }`
          }
          defaultOpen={false}
          compact
          containerStyle={styles.section}
        >
          <Text style={styles.mutedCompact}>
            Mesafe önce duraklardan; yoksa aşağıdaki km alanı kullanılır.
          </Text>
          <View style={styles.fieldSpacer} />
          <TextField
            label="Araç (etiket)"
            value={vehicleLabelInput}
            placeholder="Örn. SUV, babanın arabası"
            onChangeText={setVehicleLabelInput}
          />
          <View style={styles.fieldSpacer} />
          <TextField
            label="Tüketim (L/100 km)"
            value={tripConsumptionInput}
            placeholder="Örn. 7"
            keyboardType="number-pad"
            onChangeText={setTripConsumptionInput}
          />
          <View style={styles.fieldSpacer} />
          <TextField
            label="Yakıt fiyatı (TL/L)"
            value={fuelPriceTripInput || fuelPriceInput}
            placeholder="Örn. 38"
            keyboardType="number-pad"
            onChangeText={(v) => {
              setFuelPriceTripInput(v);
              setFuelPriceInput(v);
            }}
          />
          <View style={styles.fieldSpacer} />
          <TextField
            label="Toplam mesafe (km) — bacak yoksa"
            value={distanceInput}
            placeholder={distanceFromLegs > 0 ? `Bacaklar: ${distanceFromLegs} km` : 'Örn. 350'}
            keyboardType="number-pad"
            onChangeText={setDistanceInput}
          />
          <View style={styles.fieldSpacer} />
          <PrimaryButton
            title="Araç ve yakıtı kaydet"
            onPress={handleSaveCost}
            loading={savingCost || savingVehicle}
          />
          {trip.totalFuelCost != null && trip.totalFuelCost > 0 && (
            <View style={styles.costResult}>
              <Text style={styles.costLine}>Toplam yakıt: {trip.totalFuelCost.toFixed(2)} TL</Text>
              {goingCount > 0 && perPersonFuel != null && (
                <Text style={styles.costLine}>
                  Kişi başı ({goingCount} katılımcı): {perPersonFuel.toFixed(2)} TL
                </Text>
              )}
            </View>
          )}
        </CollapsibleSection>

        <CollapsibleSection
          title="Plan özeti"
          collapsedSummary={planSummaryCollapsed}
          defaultOpen={false}
          compact
          containerStyle={styles.section}
        >
          <Text style={styles.planStatsOneLine} numberOfLines={2}>
            {`📏 ${kmDisplay}  ·  ⏱ ${timeDisplay}  ·  📍 ${stops.length} durak`}
          </Text>
          <View style={styles.planCostRow}>
            <View style={[styles.planCostCard, styles.planCostCardExtra]}>
              <Text style={styles.planCostLabel}>Ekstra</Text>
              <Text style={styles.planCostValue}>{totalExtraCosts.toFixed(2)} ₺</Text>
            </View>
            <View style={[styles.planCostCard, styles.planCostCardFuel]}>
              <Text style={styles.planCostLabel}>Yakıt</Text>
              <Text style={styles.planCostValue}>{fuelCostNum.toFixed(2)} ₺</Text>
            </View>
            <View style={[styles.planCostCard, styles.planCostCardTotal]}>
              <Text style={styles.planCostLabel}>Toplam</Text>
              <Text style={styles.planCostValueStrong}>{grandTotalCost.toFixed(2)} ₺</Text>
            </View>
          </View>

          <Pressable
            onPress={() => setPlanExtraBreakdownOpen((o) => !o)}
            style={({ pressed }) => [
              styles.extraBreakdownHeader,
              pressed ? { opacity: 0.92 } : null,
            ]}
            accessibilityRole="button"
            accessibilityState={{ expanded: planExtraBreakdownOpen }}
          >
            <Text style={styles.extraBreakdownTitle}>
              Masraf türleri {planExtraBreakdownOpen ? '▲' : '▼'}
            </Text>
            {!planExtraBreakdownOpen ? (
              <Text style={styles.extraBreakdownPreview} numberOfLines={2}>
                {extraBreakdownSummary}
              </Text>
            ) : null}
          </Pressable>
          {planExtraBreakdownOpen && totalExtraCosts > 0 ? (
            <View style={styles.extraBreakdownList}>
              {extraCostsByCategory.map((row) => (
                <View key={row.name} style={styles.extraBreakdownRow}>
                  <Text style={styles.extraBreakdownName} numberOfLines={2}>
                    {row.name}
                  </Text>
                  <Text style={styles.extraBreakdownAmount}>{row.total.toFixed(2)} ₺</Text>
                </View>
              ))}
            </View>
          ) : planExtraBreakdownOpen && totalExtraCosts <= 0 ? (
            <Text style={styles.mutedCompact}>Bu rotada ekstra masraf yok.</Text>
          ) : null}

          {perPersonGrand != null && (
            <Text style={styles.planPerPerson}>
              Kişi başı · {goingCount} katılıyor: {perPersonGrand.toFixed(2)} ₺
            </Text>
          )}
          {(isAdmin || isEditor) && (
            <>
              <View style={styles.blockSpacer} />
              <PrimaryButton
                title={recalculatingLegs ? 'Hesaplanıyor...' : 'Duraklar arası mesafe/süre güncelle'}
                onPress={handleRecalculateLegs}
                loading={recalculatingLegs}
                disabled={recalculatingLegs}
              />
            </>
          )}
        </CollapsibleSection>

        {isAdmin && proposals.length > 0 && (
          <CollapsibleSection
            title="Onay bekleyen öneriler"
            collapsedSummary={`${proposals.length} öneri`}
            defaultOpen
            compact
            containerStyle={styles.section}
          >
            {proposals.map((p) => (
              <View key={p.proposalId} style={styles.proposalCard}>
                <Text style={styles.proposalTitle}>
                  {displayName(p.proposedBy)} · {stopNameForProposal(p.stopId)}
                </Text>
                <Text style={styles.mutedCompact}>{proposalSummary(p)}</Text>
                <View style={styles.proposalActions}>
                  <Pressable
                    onPress={() => handleApproveProposal(p.proposalId)}
                    disabled={proposalBusy !== null}
                    style={styles.approveBtn}
                  >
                    <Text style={styles.approveBtnText}>
                      {proposalBusy === p.proposalId ? '...' : 'Onayla'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleRejectProposal(p.proposalId)}
                    disabled={proposalBusy !== null}
                    style={styles.rejectBtn}
                  >
                    <Text style={styles.rejectBtnText}>Reddet</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </CollapsibleSection>
        )}

        <CollapsibleSection
          title="Duraklar"
          collapsedSummary={
            stops.length === 0 ? 'Henüz durak yok' : `${stops.length} durak`
          }
          defaultOpen={false}
          compact
          containerStyle={styles.section}
          headerRight={
            canAddStops ? (
              <Pressable onPress={() => setAddPlaceModalVisible(true)} style={styles.linkBtn}>
                <Text style={styles.linkBtnText}>+ Durak</Text>
              </Pressable>
            ) : null
          }
        >
          {canAddStops ? (
            <View style={styles.mapAddRow}>
              <PrimaryButton
                title="📍 Durak ekle"
                variant="accent"
                onPress={() => setAddPlaceModalVisible(true)}
              />
            </View>
          ) : (
            <Text style={styles.mutedCompact}>
              İzleyici olarak durak ekleyemezsin; yorum yapabilirsin.
            </Text>
          )}
          {stops.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.muted}>Henüz durak yok. Yukarıdan yer arayarak ekleyebilirsin.</Text>
            </View>
          ) : (
            <>
              {stops.map((item, index) => (
                <View key={item.stopId} style={styles.stopChainBlock}>
                  <View style={styles.stopBlock}>
                    <View style={styles.stopRow}>
                      {isAdmin && (
                        <View style={styles.orderBtns}>
                          <Pressable
                            onPress={() => handleMoveStop(index, 'up')}
                            disabled={index === 0}
                            style={[styles.orderBtn, index === 0 && styles.orderBtnDisabled]}
                          >
                            <Text style={styles.orderBtnText}>↑</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => handleMoveStop(index, 'down')}
                            disabled={index === stops.length - 1}
                            style={[
                              styles.orderBtn,
                              index === stops.length - 1 && styles.orderBtnDisabled,
                            ]}
                          >
                            <Text style={styles.orderBtnText}>↓</Text>
                          </Pressable>
                        </View>
                      )}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <StopCard
                          stop={item}
                          stopIndex={index}
                          expenseTypes={myExpenseTypes}
                          isAdmin={isAdmin}
                          canProposeChanges={editorCanPropose}
                          currentUid={currentUid}
                          userProfiles={userProfiles}
                          displayName={displayName}
                          onToggleStatus={() => handleToggleStopStatus(item)}
                          onRefresh={load}
                          onProposeChange={
                            editorCanPropose ? handleProposeChange : undefined
                          }
                          onRelocateWithSearch={
                            isAdmin || editorCanPropose
                              ? () => setRelocateStopId(item.stopId)
                              : undefined
                          }
                          onLongPressDelete={
                            isAdmin ? () => openDeleteStopModal(item) : undefined
                          }
                        />
                      </View>
                    </View>
                  </View>
                  {index < stops.length - 1 ? (
                    <View style={styles.stopRouteLink} pointerEvents="none">
                      <View style={styles.stopRouteLinkBar} />
                      <Text style={styles.stopRouteLinkArrow}>↓</Text>
                      <View style={styles.stopRouteLinkBar} />
                    </View>
                  ) : null}
                </View>
              ))}
            </>
          )}
        </CollapsibleSection>

        {stopsWithCoordsCount > 0 ? (
          <CollapsibleSection
            title="Harita"
            collapsedSummary={`${stopsWithCoordsCount} konum · dokunarak aç`}
            defaultOpen={false}
            compact
            containerStyle={styles.section}
          >
            {Platform.OS === 'web' ? (
              <View style={styles.mapPlaceholder}>
                <Text style={styles.mutedCompact}>
                  Harita Android ve iOS’ta. Web’de konumları kaydedip mobilde görebilirsin.
                </Text>
              </View>
            ) : (
              <View style={styles.mapContainer}>
                {(() => {
                  const { NativeMapSection } = require('../components/NativeMapSection');
                  return <NativeMapSection stops={stops} />;
                })()}
              </View>
            )}
          </CollapsibleSection>
        ) : null}
      </ScrollView>

      <Modal
        visible={addAttendeeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setAddAttendeeModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setAddAttendeeModal(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Katılımcı ekle</Text>
            <View style={styles.roleRow}>
              <Pressable
                onPress={() => setSelectedRole('editor')}
                style={[styles.roleBtn, selectedRole === 'editor' && styles.roleBtnActive]}
              >
                <Text style={styles.roleBtnText}>Editör</Text>
              </Pressable>
              <Pressable
                onPress={() => setSelectedRole('viewer')}
                style={[styles.roleBtn, selectedRole === 'viewer' && styles.roleBtnActive]}
              >
                <Text style={styles.roleBtnText}>İzleyici</Text>
              </Pressable>
            </View>

            {groups.length > 0 && (
              <>
                <Text style={styles.modalSectionTitle}>Gruplardan ekle</Text>
                {groups.map((group) => {
                  const inTrip = new Set(trip?.attendees.map((a) => a.uid) ?? []);
                  const toAddCount = group.memberIds.filter((uid) => !inTrip.has(uid)).length;
                  return (
                    <View key={group.groupId} style={styles.groupRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.groupRowName}>{group.name}</Text>
                        <Text style={styles.muted}>
                          {toAddCount > 0
                            ? `${toAddCount} kişi rotaya eklenebilir`
                            : 'Tüm üyeler zaten rotada'}
                        </Text>
                      </View>
                      <PrimaryButton
                        title={addingGroupId === group.groupId ? '...' : 'Rotaya ekle'}
                        onPress={() => handleAddGroupToTrip(group)}
                        disabled={toAddCount === 0 || addingGroupId !== null}
                        loading={addingGroupId === group.groupId}
                      />
                    </View>
                  );
                })}
                <View style={styles.modalDivider} />
              </>
            )}

            <Text style={styles.modalSectionTitle}>Tek tek arkadaş ekle</Text>
            {friendsNotInTrip.length === 0 ? (
              <Text style={styles.muted}>
                Arkadaş listende rotada olmayan kimse yok. Profilden arkadaş ekleyebilir veya davet linkiyle
                yeni kişileri çağırabilirsin.
              </Text>
            ) : (
              friendsNotInTrip.slice(0, 20).map((uid) => (
                <Pressable
                  key={uid}
                  onPress={() => handleAddAttendee(uid)}
                  style={styles.friendRow}
                >
                  <Text style={styles.friendName}>{displayName(uid)}</Text>
                  <Text style={styles.friendAdd}>Ekle</Text>
                </Pressable>
              ))
            )}
            <View style={{ height: appTheme.space.md }} />
            <PrimaryButton title="Kapat" onPress={() => setAddAttendeeModal(false)} />
          </Pressable>
        </Pressable>
      </Modal>

      <AddPlaceModal
        visible={addPlaceModalVisible || relocateStopId !== null}
        onClose={() => {
          setAddPlaceModalVisible(false);
          setRelocateStopId(null);
        }}
        onAdd={handlePlacePicked}
      />

      <DeleteStopConfirmModal
        visible={deleteStopTarget !== null}
        locationName={deleteStopTarget?.locationName ?? ''}
        busy={deleteStopBusy}
        onCancel={() => {
          if (!deleteStopBusy) setDeleteStopTarget(null);
        }}
        onConfirm={executeDeleteStop}
      />
    </Screen>
  );
}

function createTripDetailStyles(t: AppTheme) {
  return StyleSheet.create({
    scrollContent: {
      paddingBottom: t.space.lg,
      paddingHorizontal: t.space.xs,
    },
    header: { gap: 4, marginBottom: t.space.sm },
    backRow: { alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 4 },
    backText: { color: t.color.primaryDark, fontSize: t.font.body, fontWeight: '800' },
    tripEmoji: { fontSize: 28, marginTop: 2 },
    title: { color: t.color.text, fontSize: t.font.h1, fontWeight: '900', letterSpacing: -0.3 },
    scheduleCombined: {
      color: t.color.text,
      fontSize: t.font.small,
      fontWeight: '800',
      marginTop: 2,
      lineHeight: 20,
    },
    planTimes: { color: t.color.textSecondary, fontSize: t.font.tiny, fontWeight: '700', marginTop: 4 },
    adminTripActions: {
      marginTop: t.space.sm,
      alignSelf: 'stretch',
      width: '100%',
      maxWidth: 480,
      flexDirection: 'row',
      gap: 8,
    },
    adminTripBtnHalf: { flex: 1, minWidth: 0 },
    section: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      paddingVertical: t.space.sm,
      paddingHorizontal: t.space.md,
      borderWidth: 1,
      borderColor: t.color.sectionBorder,
      marginBottom: t.space.sm,
      ...t.shadowCard,
    },
    sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: t.space.sm },
    sectionTitle: {
      color: t.color.text,
      fontSize: t.font.h2,
      fontWeight: '900',
      letterSpacing: -0.2,
    },
    fieldSpacer: { height: 8 },
    blockSpacer: { height: t.space.sm },
    mutedCompact: {
      color: t.color.muted,
      fontSize: t.font.tiny,
      lineHeight: 18,
    },
    planStatsOneLine: {
      color: t.color.text,
      fontSize: t.font.small,
      fontWeight: '700',
      marginBottom: t.space.sm,
      lineHeight: 20,
    },
    summaryLine: { color: t.color.text, fontSize: t.font.body, marginTop: 4 },
    summaryStrong: {
      color: t.color.text,
      fontSize: t.font.h2,
      fontWeight: '800',
      marginTop: t.space.sm,
    },
    planCostRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
    planCostCard: {
      flex: 1,
      minWidth: 88,
      borderRadius: t.radius.md,
      paddingVertical: 10,
      paddingHorizontal: t.space.sm,
      borderWidth: 1,
    },
    planCostCardExtra: {
      backgroundColor: t.color.accentSoft,
      borderColor: t.color.accent,
    },
    planCostCardFuel: {
      backgroundColor: 'rgba(14, 165, 233, 0.12)',
      borderColor: t.color.ocean,
    },
    planCostCardTotal: {
      backgroundColor: t.color.inputBg,
      borderColor: t.color.primary,
    },
    planCostLabel: { fontSize: 10, fontWeight: '800', color: t.color.muted },
    planCostValue: { fontSize: t.font.small, fontWeight: '800', color: t.color.text, marginTop: 4 },
    planCostValueStrong: { fontSize: t.font.h2, fontWeight: '900', color: t.color.text, marginTop: 4 },
    planPerPerson: {
      marginTop: t.space.sm,
      fontSize: t.font.tiny,
      fontWeight: '700',
      color: t.color.textSecondary,
      textAlign: 'center',
    },
    extraBreakdownHeader: {
      marginTop: t.space.sm,
      paddingVertical: 8,
      paddingHorizontal: t.space.sm,
      borderRadius: t.radius.md,
      borderWidth: 1,
      borderColor: t.color.border,
      backgroundColor: t.color.inputBg,
    },
    extraBreakdownTitle: {
      color: t.color.text,
      fontSize: t.font.small,
      fontWeight: '800',
    },
    extraBreakdownPreview: {
      color: t.color.muted,
      fontSize: t.font.tiny,
      fontWeight: '600',
      marginTop: 4,
      lineHeight: 18,
    },
    extraBreakdownList: {
      marginTop: 8,
      gap: 6,
    },
    extraBreakdownRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.space.sm,
      paddingVertical: 8,
      paddingHorizontal: t.space.sm,
      borderRadius: t.radius.sm,
      borderWidth: 1,
      borderColor: t.color.subtle,
      backgroundColor: t.color.surface,
    },
    extraBreakdownName: {
      flex: 1,
      color: t.color.text,
      fontSize: t.font.small,
      fontWeight: '700',
    },
    extraBreakdownAmount: {
      color: t.color.text,
      fontSize: t.font.body,
      fontWeight: '900',
    },
    proposalCard: {
      borderWidth: 1,
      borderColor: t.color.border,
      borderRadius: t.radius.md,
      padding: t.space.sm,
      marginBottom: t.space.sm,
    },
    proposalTitle: { color: t.color.text, fontSize: t.font.body, fontWeight: '700' },
    proposalActions: { flexDirection: 'row', gap: t.space.sm, marginTop: t.space.sm },
    approveBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: t.radius.pill,
      backgroundColor: t.color.primarySoft,
      borderWidth: 1,
      borderColor: t.color.primary,
    },
    approveBtnText: { color: t.color.text, fontSize: t.font.small, fontWeight: '700' },
    rejectBtn: { paddingHorizontal: 14, paddingVertical: 8 },
    rejectBtnText: { color: t.color.danger, fontSize: t.font.small, fontWeight: '700' },
    mapAddRow: { marginTop: t.space.sm, marginBottom: t.space.xs },
    linkBtn: { paddingVertical: 4, paddingHorizontal: 8 },
    linkBtnText: { color: t.color.primary, fontSize: t.font.small, fontWeight: '700' },
    inviteRow: { flexDirection: 'row', gap: t.space.sm, marginBottom: t.space.sm, flexWrap: 'wrap' },
    inviteBtn: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: t.radius.pill,
      borderWidth: 1,
      borderColor: t.color.border,
      backgroundColor: t.color.inputBg,
    },
    inviteBtnText: { color: t.color.primary, fontSize: t.font.small, fontWeight: '700' },
    addRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: t.space.sm },
    empty: { paddingVertical: t.space.lg },
    stopChainBlock: { marginBottom: 0 },
    stopBlock: { marginBottom: 0 },
    stopRouteLink: {
      alignItems: 'center',
      paddingVertical: 2,
      marginBottom: 2,
    },
    stopRouteLinkBar: {
      width: 2,
      height: 10,
      borderRadius: 1,
      backgroundColor: t.color.primary,
      opacity: 0.45,
    },
    stopRouteLinkArrow: {
      color: t.color.primaryDark,
      fontSize: 16,
      fontWeight: '900',
      lineHeight: 20,
      marginVertical: -1,
    },
    stopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: t.space.sm },
    orderBtns: { flexDirection: 'column', gap: 2 },
    orderBtn: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: t.radius.sm,
      borderWidth: 1,
      borderColor: t.color.border,
      backgroundColor: t.color.inputBg,
    },
    orderBtnDisabled: { opacity: 0.4 },
    orderBtnText: { color: t.color.muted, fontSize: t.font.small, fontWeight: '700' },
    attendeeRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: t.color.subtle },
    attendeeName: { color: t.color.text, fontSize: t.font.body, fontWeight: '700' },
    attendeeMeta: { color: t.color.muted, fontSize: t.font.small, marginTop: 2 },
    rsvpRow: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
    rsvpBtn: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: t.radius.pill,
      borderWidth: 1,
      borderColor: t.color.border,
      backgroundColor: t.color.inputBg,
    },
    rsvpBtnActive: { backgroundColor: t.color.primarySoft, borderColor: t.color.primary },
    rsvpBtnText: { color: t.color.text, fontSize: t.font.small, fontWeight: '700' },
    costResult: {
      marginTop: t.space.md,
      gap: 6,
      padding: t.space.md,
      backgroundColor: t.color.accentSoft,
      borderRadius: t.radius.lg,
    },
    costLine: { color: t.color.text, fontSize: t.font.body, fontWeight: '800' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    muted: { color: t.color.muted, fontSize: t.font.small },
    error: { color: t.color.danger, fontSize: t.font.body, fontWeight: '700' },
    errorLine: { color: t.color.danger, fontSize: t.font.small, marginBottom: t.space.sm },
    modalOverlay: {
      flex: 1,
      backgroundColor: t.color.overlayDark,
      justifyContent: 'center',
      alignItems: 'center',
      padding: t.space.lg,
    },
    modalContent: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.xl,
      padding: t.space.lg,
      borderWidth: 1,
      borderColor: t.color.border,
      width: '100%',
      maxWidth: 400,
      ...t.shadowCard,
    },
    modalTitle: { color: t.color.text, fontSize: t.font.h2, fontWeight: '800', marginBottom: t.space.sm },
    modalSectionTitle: { color: t.color.text, fontSize: t.font.body, fontWeight: '700', marginTop: t.space.md, marginBottom: t.space.xs },
    modalDivider: { height: 1, backgroundColor: t.color.subtle, marginVertical: t.space.sm },
    groupRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm, marginBottom: t.space.sm },
    groupRowName: { color: t.color.text, fontSize: t.font.body, fontWeight: '700' },
    roleRow: { flexDirection: 'row', gap: 8, marginBottom: t.space.md },
    roleBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: t.radius.pill,
      borderWidth: 1,
      borderColor: t.color.border,
      backgroundColor: t.color.inputBg,
    },
    roleBtnActive: { backgroundColor: t.color.primarySoft },
    roleBtnText: { color: t.color.text, fontSize: t.font.small, fontWeight: '700' },
    friendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: t.color.subtle,
    },
    friendName: { color: t.color.text, fontSize: t.font.body, fontWeight: '700' },
    friendAdd: { color: t.color.primary, fontSize: t.font.small, fontWeight: '700' },
    mapPlaceholder: {
      paddingVertical: t.space.sm,
      paddingHorizontal: t.space.sm,
      backgroundColor: t.color.primarySoft,
      borderRadius: t.radius.md,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: t.color.mapDashBorder,
    },
    mapContainer: { borderRadius: t.radius.lg, overflow: 'hidden', borderWidth: 2, borderColor: t.color.primarySoft },
  });
}
