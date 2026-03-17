import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  ActivityIndicator,
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
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { StopCard } from '../components/StopCard';
import { TextField } from '../components/TextField';
import { auth } from '../lib/firebase';
import { getGroupsForUser } from '../services/groups';
import { getUserProfile } from '../services/userProfile';
import {
  addAttendeeToTrip,
  addStop,
  getStopsForTrip,
  getTrip,
  reorderStops,
  updateAttendeeRsvp,
  updateStopStatus,
  updateTripDistanceAndFuel,
} from '../services/trips';
import type { Group } from '../types/group';
import type { Stop as StopType, Trip } from '../types/trip';
import type { UserProfile } from '../services/userProfile';
import { theme } from '../theme';

function formatDate(s: string) {
  try {
    return new Date(s).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return s;
  }
}

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
  const [newStopName, setNewStopName] = useState('');
  const [adding, setAdding] = useState(false);
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
  const currentUid = auth.currentUser?.uid;

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

  const displayName = (uid: string) =>
    userProfiles.get(uid)?.displayName?.trim() || userProfiles.get(uid)?.phoneNumber || uid.slice(0, 8);

  async function handleAddStop() {
    const name = newStopName.trim();
    if (!name || !currentUid) return;
    setAdding(true);
    try {
      await addStop({
        tripId: props.tripId,
        locationName: name,
        createdBy: currentUid,
        status: trip?.adminId === currentUid ? 'approved' : 'pending',
        order: stops.length,
      });
      setNewStopName('');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Durak eklenemedi.');
    } finally {
      setAdding(false);
    }
  }

  async function handleAddPlace(params: {
    locationName: string;
    coords: { latitude: number; longitude: number };
  }) {
    if (!currentUid) return;
    await addStop({
      tripId: props.tripId,
      locationName: params.locationName,
      createdBy: currentUid,
      status: trip?.adminId === currentUid ? 'approved' : 'pending',
      coords: params.coords,
      order: stops.length,
    });
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
      await load();
    } catch (_) {}
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

  async function handleSaveCost() {
    const dist = parseFloat(distanceInput.replace(',', '.'));
    const fuelPrice = parseFloat(fuelPriceInput.replace(',', '.'));
    if (!trip || isNaN(dist) || dist < 0) return;
    const myProfile = currentUid ? await getUserProfile(currentUid) : null;
    const consumption = myProfile?.carConsumption ? parseFloat(String(myProfile.carConsumption).replace(',', '.')) : NaN;
    let totalFuelCost = 0;
    if (!isNaN(fuelPrice) && fuelPrice >= 0 && !isNaN(consumption) && consumption > 0) {
      totalFuelCost = (dist / 100) * consumption * fuelPrice;
    }
    setSavingCost(true);
    try {
      await updateTripDistanceAndFuel(props.tripId, dist, Math.round(totalFuelCost * 100) / 100);
      await load();
    } finally {
      setSavingCost(false);
    }
  }

  const perPersonFuel =
    goingCount > 0 && trip?.totalFuelCost != null && trip.totalFuelCost > 0
      ? Math.round((trip.totalFuelCost / goingCount) * 100) / 100
      : null;

  if (loading && !trip) {
    return (
      <Screen>
        <View style={styles.centered}>
          <ActivityIndicator />
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
          <View style={{ height: theme.space.md }} />
          <PrimaryButton title="Geri" onPress={props.onBack} />
        </View>
      </Screen>
    );
  }

  const isAdmin = trip.adminId === currentUid;

  return (
    <Screen>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: theme.space.xl }}>
        <View style={styles.header}>
          <Pressable onPress={props.onBack} style={styles.backRow}>
            <Text style={styles.backText}>← Geri</Text>
          </Pressable>
          <Text style={styles.title}>{trip.title}</Text>
          <Text style={styles.dates}>
            {formatDate(trip.startDate)} – {formatDate(trip.endDate)}
          </Text>
          {trip.totalDistance != null && trip.totalDistance > 0 && (
            <Text style={styles.muted}>Toplam: {trip.totalDistance} km</Text>
          )}
        </View>

        {error ? <Text style={styles.errorLine}>{error}</Text> : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Duraklar</Text>
          <View style={styles.mapAddRow}>
            <PrimaryButton
              title="Google Maps'tan yer ekle"
              onPress={() => setAddPlaceModalVisible(true)}
            />
          </View>
          <View style={styles.addRow}>
            <View style={{ flex: 1 }}>
              <TextField
                label=""
                value={newStopName}
                placeholder="Yeni durak adı"
                onChangeText={setNewStopName}
              />
            </View>
            <View style={{ width: theme.space.sm }} />
            <PrimaryButton
              title="Ekle"
              onPress={handleAddStop}
              loading={adding}
              disabled={!newStopName.trim()}
            />
          </View>
          {stops.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.muted}>Henüz durak yok. Yukarıdan ekleyebilirsin.</Text>
            </View>
          ) : (
            <>
              {stops.map((item, index) => (
                <View key={item.stopId} style={styles.stopRow}>
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
                  <View style={{ flex: 1 }}>
                    <StopCard
                      stop={item}
                      isAdmin={isAdmin}
                      currentUid={currentUid}
                      userProfiles={userProfiles}
                      displayName={displayName}
                      onToggleStatus={() => handleToggleStopStatus(item)}
                      onRefresh={load}
                    />
                  </View>
                </View>
              ))}
            </>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Katılımcılar</Text>
            {isAdmin && friendsNotInTrip.length > 0 && (
              <Pressable onPress={() => setAddAttendeeModal(true)} style={styles.linkBtn}>
                <Text style={styles.linkBtnText}>+ Ekle</Text>
              </Pressable>
            )}
          </View>
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
                      style={[
                        styles.rsvpBtn,
                        a.rsvp === r ? styles.rsvpBtnActive : null,
                      ]}
                    >
                      <Text style={styles.rsvpBtnText}>{RSVP_LABELS[r]}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Yakıt ve maliyet</Text>
          <Text style={styles.muted}>
            Toplam mesafe (km) ve yakıt fiyatı (TL/L) gir. Profildeki araç tüketimi (L/100 km) kullanılır.
          </Text>
          <View style={{ height: theme.space.sm }} />
          <TextField
            label="Toplam mesafe (km)"
            value={distanceInput}
            placeholder="Örn. 350"
            keyboardType="number-pad"
            onChangeText={setDistanceInput}
          />
          <View style={{ height: theme.space.sm }} />
          <TextField
            label="Yakıt fiyatı (TL/L)"
            value={fuelPriceInput}
            placeholder="Örn. 38"
            keyboardType="number-pad"
            onChangeText={setFuelPriceInput}
          />
          <View style={{ height: theme.space.sm }} />
          <PrimaryButton
            title="Hesapla ve kaydet"
            onPress={handleSaveCost}
            loading={savingCost}
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
        </View>

        {stops.some((s) => s.coords?.latitude != null && s.coords?.longitude != null) ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Harita</Text>
            {Platform.OS === 'web' ? (
              <View style={styles.mapPlaceholder}>
                <Text style={styles.muted}>
                  Harita görünümü Android ve iOS uygulamasında açılır. Web'de durak konumlarını
                  kaydettikten sonra mobilde rotayı haritada görebilirsin.
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
          </View>
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
              <Text style={styles.muted}>Eklenebilir arkadaş yok.</Text>
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
            <View style={{ height: theme.space.md }} />
            <PrimaryButton title="Kapat" onPress={() => setAddAttendeeModal(false)} />
          </Pressable>
        </Pressable>
      </Modal>

      <AddPlaceModal
        visible={addPlaceModalVisible}
        onClose={() => setAddPlaceModalVisible(false)}
        onAdd={handleAddPlace}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4, marginBottom: theme.space.lg },
  backRow: { alignSelf: 'flex-start', paddingVertical: 4, paddingRight: 8 },
  backText: { color: theme.color.primary, fontSize: theme.font.body, fontWeight: '700' },
  title: { color: theme.color.text, fontSize: theme.font.h1, fontWeight: '800' },
  dates: { color: theme.color.muted, fontSize: theme.font.body },
  section: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.space.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
    marginBottom: theme.space.md,
  },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.space.sm },
  sectionTitle: { color: theme.color.text, fontSize: theme.font.h2, fontWeight: '800' },
  mapAddRow: { marginBottom: theme.space.sm },
  linkBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  linkBtnText: { color: theme.color.primary, fontSize: theme.font.small, fontWeight: '700' },
  inviteRow: { flexDirection: 'row', gap: theme.space.sm, marginBottom: theme.space.sm, flexWrap: 'wrap' },
  inviteBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.inputBg,
  },
  inviteBtnText: { color: theme.color.primary, fontSize: theme.font.small, fontWeight: '700' },
  addRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: theme.space.sm },
  empty: { paddingVertical: theme.space.lg },
  stopRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: theme.space.sm, gap: theme.space.sm },
  orderBtns: { flexDirection: 'column', gap: 2 },
  orderBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.inputBg,
  },
  orderBtnDisabled: { opacity: 0.4 },
  orderBtnText: { color: theme.color.muted, fontSize: theme.font.small, fontWeight: '700' },
  attendeeRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.color.subtle },
  attendeeName: { color: theme.color.text, fontSize: theme.font.body, fontWeight: '700' },
  attendeeMeta: { color: theme.color.muted, fontSize: theme.font.small, marginTop: 2 },
  rsvpRow: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  rsvpBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.inputBg,
  },
  rsvpBtnActive: { backgroundColor: theme.color.primarySoft, borderColor: theme.color.primary },
  rsvpBtnText: { color: theme.color.text, fontSize: theme.font.small, fontWeight: '700' },
  costResult: { marginTop: theme.space.md, gap: 4 },
  costLine: { color: theme.color.text, fontSize: theme.font.body, fontWeight: '700' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { color: theme.color.muted, fontSize: theme.font.small },
  error: { color: theme.color.danger, fontSize: theme.font.body, fontWeight: '700' },
  errorLine: { color: theme.color.danger, fontSize: theme.font.small, marginBottom: theme.space.sm },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.space.lg,
  },
  modalContent: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.space.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: { color: theme.color.text, fontSize: theme.font.h2, fontWeight: '800', marginBottom: theme.space.sm },
  modalSectionTitle: { color: theme.color.text, fontSize: theme.font.body, fontWeight: '700', marginTop: theme.space.md, marginBottom: theme.space.xs },
  modalDivider: { height: 1, backgroundColor: theme.color.subtle, marginVertical: theme.space.sm },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm, marginBottom: theme.space.sm },
  groupRowName: { color: theme.color.text, fontSize: theme.font.body, fontWeight: '700' },
  roleRow: { flexDirection: 'row', gap: 8, marginBottom: theme.space.md },
  roleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.inputBg,
  },
  roleBtnActive: { backgroundColor: theme.color.primarySoft },
  roleBtnText: { color: theme.color.text, fontSize: theme.font.small, fontWeight: '700' },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.subtle,
  },
  friendName: { color: theme.color.text, fontSize: theme.font.body, fontWeight: '700' },
  friendAdd: { color: theme.color.primary, fontSize: theme.font.small, fontWeight: '700' },
  mapPlaceholder: { paddingVertical: theme.space.lg },
  mapContainer: { borderRadius: theme.radius.md, overflow: 'hidden' },
});
