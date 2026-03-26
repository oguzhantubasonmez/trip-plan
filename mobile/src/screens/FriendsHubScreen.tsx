import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { auth } from '../lib/firebase';
import {
  acceptFriendRequest,
  cancelOutgoingFriendRequest,
  declineFriendRequest,
  listIncomingFriendRequests,
  listOutgoingFriendRequestTargetUids,
  removeFriendBothWays,
  removeFriendFromMyListOnly,
  type FriendRequest,
} from '../services/friends';
import {
  acceptGroupInvite,
  declineGroupInvite,
  getGroup,
  listPendingGroupInvitesForUser,
  type GroupInvite,
} from '../services/groups';
import { markFriendsHubVisited } from '../services/activityInbox';
import { getUserProfile } from '../services/userProfile';
import type { UserProfile } from '../services/userProfile';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';
import { maskPhone } from '../utils/phone';

function initialFromName(name: string): string {
  const t = name.trim();
  return (t[0] || '?').toUpperCase();
}

export function FriendsHubScreen(props: {
  onBack: () => void;
  onOpenGroups: () => void;
  onOpenContactInvite: () => void;
}) {
  const appTheme = useAppTheme();
  const styles = useMemo(() => createFriendsHubStyles(appTheme), [appTheme]);
  const uid = auth.currentUser?.uid;
  const [friendUids, setFriendUids] = useState<string[]>([]);
  const [outgoingPendingUids, setOutgoingPendingUids] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [incomingFriends, setIncomingFriends] = useState<FriendRequest[]>([]);
  const [groupInvites, setGroupInvites] = useState<GroupInvite[]>([]);
  const [groupNames, setGroupNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [removingUid, setRemovingUid] = useState<string | null>(null);
  const [cancellingOutgoingUid, setCancellingOutgoingUid] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const [me, incoming, gInv, outgoingSet] = await Promise.all([
        getUserProfile(uid),
        listIncomingFriendRequests(uid),
        listPendingGroupInvitesForUser(uid),
        listOutgoingFriendRequestTargetUids(uid),
      ]);
      const friends = me?.friends ?? [];
      const friendSet = new Set(friends);
      const outgoing = [...outgoingSet].filter((id) => id && !friendSet.has(id));
      setFriendUids(friends);
      setOutgoingPendingUids(outgoing);
      setIncomingFriends(incoming);
      setGroupInvites(gInv);

      const map = new Map<string, UserProfile>();
      const ids = new Set<string>([
        ...friends,
        ...outgoing,
        ...incoming.map((r) => r.fromUid),
        ...gInv.map((i) => i.fromUid),
      ]);
      await Promise.all(
        [...ids].map(async (id) => {
          const u = await getUserProfile(id);
          if (u) map.set(id, u);
        })
      );
      setProfiles(map);

      const gMap = new Map<string, string>();
      await Promise.all(
        gInv.map(async (inv) => {
          const g = await getGroup(inv.groupId);
          if (g) gMap.set(inv.groupId, g.name);
        })
      );
      setGroupNames(gMap);
      void markFriendsHubVisited(uid);
    } catch (_) {
      setFriendUids([]);
      setOutgoingPendingUids([]);
      setProfiles(new Map());
      setIncomingFriends([]);
      setGroupInvites([]);
      setGroupNames(new Map());
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const displayName = useCallback(
    (id: string) =>
      profiles.get(id)?.displayName?.trim() || profiles.get(id)?.phoneNumber || `Kullanıcı ${id.slice(0, 6)}`,
    [profiles]
  );

  /** Profil yüklendiyse ve karşı taraf seni listede tutmuyorsa tek yönlü / bozuk kayıt — listede gösterme. */
  const verifiedFriendIds = useMemo(() => {
    if (!uid) return [];
    return friendUids.filter((id) => {
      const p = profiles.get(id);
      if (!p) return true;
      return Array.isArray(p.friends) && p.friends.includes(uid);
    });
  }, [friendUids, profiles, uid]);

  /** Profili geldi; seni karşı listede görmüyor — tek yönlü veya eski bozuk kayıt. */
  const orphanFriendIds = useMemo(() => {
    if (!uid) return [];
    return friendUids.filter((id) => {
      const p = profiles.get(id);
      if (!p) return false;
      return !p.friends?.includes(uid);
    });
  }, [friendUids, profiles, uid]);

  const sortedFriendIds = useMemo(() => {
    return [...verifiedFriendIds].sort((a, b) =>
      displayName(a).localeCompare(displayName(b), 'tr', { sensitivity: 'base' })
    );
  }, [verifiedFriendIds, displayName]);

  const sortedOutgoingPendingIds = useMemo(() => {
    return [...outgoingPendingUids].sort((a, b) =>
      displayName(a).localeCompare(displayName(b), 'tr', { sensitivity: 'base' })
    );
  }, [outgoingPendingUids, displayName]);

  /** Karşılıklı arkadaş olduysan ama eski istek belgesi kaldıysa gelen kutusunda gösterme. */
  const visibleIncomingFriends = useMemo(() => {
    if (!uid) return [];
    return incomingFriends.filter((r) => {
      const p = profiles.get(r.fromUid);
      const mutual =
        friendUids.includes(r.fromUid) &&
        p != null &&
        Array.isArray(p.friends) &&
        p.friends.includes(uid);
      return !mutual;
    });
  }, [incomingFriends, friendUids, profiles, uid]);

  function subtitleForProfile(p: UserProfile | undefined): string | null {
    if (!p?.phoneNumber) return null;
    return maskPhone(p.phoneNumber);
  }

  async function handleAcceptFriend(fromUid: string) {
    if (!uid) return;
    const key = `f-${fromUid}`;
    setBusyKey(key);
    try {
      await acceptFriendRequest({ fromUid, toUid: uid });
      await load();
    } catch (e: any) {
      Alert.alert('Arkadaşlık isteği', e?.message || 'Onaylanamadı. İnternet veya Firestore izinlerini kontrol et.');
      await load();
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDeclineFriend(fromUid: string) {
    if (!uid) return;
    const key = `fd-${fromUid}`;
    setBusyKey(key);
    try {
      await declineFriendRequest({ fromUid, toUid: uid });
      await load();
    } catch {
      await load();
    } finally {
      setBusyKey(null);
    }
  }

  async function handleAcceptGroup(groupId: string) {
    if (!uid) return;
    const key = `g-${groupId}`;
    setBusyKey(key);
    try {
      await acceptGroupInvite({ groupId, memberUid: uid });
      await load();
    } catch {
      await load();
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDeclineGroup(groupId: string) {
    if (!uid) return;
    const key = `gd-${groupId}`;
    setBusyKey(key);
    try {
      await declineGroupInvite({ groupId, memberUid: uid });
      await load();
    } catch {
      await load();
    } finally {
      setBusyKey(null);
    }
  }

  async function runRemoveFriendBothWays(friendUid: string) {
    if (!uid) return;
    setRemovingUid(friendUid);
    try {
      await removeFriendBothWays({ currentUid: uid, friendUid });
      await load();
    } catch (e: any) {
      const msg = e?.message || 'İşlem tamamlanamadı. İnternet veya Firestore izinlerini kontrol et.';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Arkadaşlık', msg);
      }
      await load();
    } finally {
      setRemovingUid(null);
    }
  }

  function confirmRemoveFriend(friendUid: string) {
    if (!uid) return;
    const name = displayName(friendUid);
    const title = 'Arkadaşlıktan çıkar';
    const message = `“${name}” arkadaş listenden kaldırılacak. Karşı tarafta da listen güncellenir. Emin misin?`;
    if (Platform.OS === 'web') {
      if (typeof globalThis.confirm === 'function') {
        if (globalThis.confirm(`${title}\n\n${message}`)) void runRemoveFriendBothWays(friendUid);
      } else {
        void runRemoveFriendBothWays(friendUid);
      }
      return;
    }
    Alert.alert(title, message, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Çıkar', style: 'destructive', onPress: () => void runRemoveFriendBothWays(friendUid) },
    ]);
  }

  async function runRemoveOrphanFromMyList(orphanUid: string) {
    if (!uid) return;
    setRemovingUid(orphanUid);
    try {
      await removeFriendFromMyListOnly({ currentUid: uid, friendUid: orphanUid });
      await load();
    } catch (e: any) {
      const msg = e?.message || 'Kayıt kaldırılamadı. İnternet veya Firestore izinlerini kontrol et.';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Arkadaş listesi', msg);
      }
      await load();
    } finally {
      setRemovingUid(null);
    }
  }

  /** Tek yönlü kayıt: yalnızca kendi listeni günceller; web’de Alert yerine confirm kullanılır. */
  function confirmRemoveOrphanFriend(orphanUid: string) {
    if (!uid) return;
    const name = displayName(orphanUid);
    const title = 'Tek yönlü kaydı kaldır';
    const message = `“${name}” yalnızca senin listenden çıkarılır.`;
    if (Platform.OS === 'web') {
      if (typeof globalThis.confirm === 'function') {
        if (globalThis.confirm(`${title}\n\n${message}`)) void runRemoveOrphanFromMyList(orphanUid);
      } else {
        void runRemoveOrphanFromMyList(orphanUid);
      }
      return;
    }
    Alert.alert(title, message, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Kaldır', style: 'destructive', onPress: () => void runRemoveOrphanFromMyList(orphanUid) },
    ]);
  }

  function confirmCancelOutgoing(toUid: string) {
    if (!uid) return;
    const name = displayName(toUid);
    Alert.alert(
      'İsteği geri al',
      `“${name}” kullanıcısına gönderdiğin arkadaşlık isteği silinecek.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Geri al',
          style: 'destructive',
          onPress: async () => {
            setCancellingOutgoingUid(toUid);
            try {
              await cancelOutgoingFriendRequest({ fromUid: uid, toUid });
              await load();
            } catch {
              await load();
            } finally {
              setCancellingOutgoingUid(null);
            }
          },
        },
      ]
    );
  }

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={props.onBack} style={styles.backRow}>
          <Text style={styles.backText}>← Geri</Text>
        </Pressable>
        <View style={styles.header}>
          <Text style={styles.heroEmoji}>👥</Text>
          <Text style={styles.title}>Arkadaşlarım</Text>
          <Text style={styles.sub}>
            Onay bekleyen ve onaylı arkadaşların aşağıda listelenir. Gelen istekler ve grup davetleri üstte.
          </Text>
        </View>

        <PrimaryButton title="➕ Arkadaş ekle" onPress={props.onOpenContactInvite} />
        <View style={{ height: appTheme.space.sm }} />
        <Pressable onPress={props.onOpenGroups} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>Arkadaş gruplarım</Text>
          <Text style={styles.secondaryBtnSub}>Grupları oluştur, rotaya tek tıkla ekle</Text>
        </Pressable>

        <View style={{ height: appTheme.space.lg }} />

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={appTheme.color.primary} />
          </View>
        ) : (
          <>
            {visibleIncomingFriends.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.sectionTitleWrap}>
                  <Text style={styles.sectionTitle}>Gelen arkadaşlık istekleri</Text>
                </View>
                {visibleIncomingFriends.map((r) => {
                  const p = profiles.get(r.fromUid);
                  const sub = subtitleForProfile(p);
                  return (
                    <View key={r.id} style={styles.inboxRow}>
                      <View style={styles.avatarSm}>
                        <Text style={styles.avatarSmText}>{initialFromName(displayName(r.fromUid))}</Text>
                      </View>
                      <View style={styles.inboxBody}>
                        <Text style={styles.rowTitle}>{displayName(r.fromUid)}</Text>
                        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
                        <Text style={styles.mutedSmall}>Seni arkadaş olarak eklemek istiyor.</Text>
                      </View>
                      <View style={styles.requestActions}>
                        <Pressable
                          onPress={() => handleDeclineFriend(r.fromUid)}
                          disabled={busyKey !== null}
                          style={styles.declineBtn}
                        >
                          <Text style={styles.declineBtnText}>
                            {busyKey === `fd-${r.fromUid}` ? '...' : 'Reddet'}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleAcceptFriend(r.fromUid)}
                          disabled={busyKey !== null}
                          style={styles.acceptBtn}
                        >
                          <Text style={styles.acceptBtnText}>
                            {busyKey === `f-${r.fromUid}` ? '...' : 'Onayla'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {groupInvites.length > 0 ? (
              <View style={[styles.section, { marginTop: appTheme.space.md }]}>
                <View style={styles.sectionTitleWrap}>
                  <Text style={styles.sectionTitle}>Grup davetleri</Text>
                </View>
                {groupInvites.map((inv) => (
                  <View key={inv.id} style={styles.inboxRow}>
                    <View style={[styles.avatarSm, styles.avatarGroup]}>
                      <Text style={styles.avatarSmText}>👥</Text>
                    </View>
                    <View style={styles.inboxBody}>
                      <Text style={styles.rowTitle}>{groupNames.get(inv.groupId) || 'Grup'}</Text>
                      <Text style={styles.mutedSmall}>
                        {displayName(inv.fromUid)} seni gruba eklemek istiyor.
                      </Text>
                    </View>
                    <View style={styles.requestActions}>
                      <Pressable
                        onPress={() => handleDeclineGroup(inv.groupId)}
                        disabled={busyKey !== null}
                        style={styles.declineBtn}
                      >
                        <Text style={styles.declineBtnText}>
                          {busyKey === `gd-${inv.groupId}` ? '...' : 'Reddet'}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleAcceptGroup(inv.groupId)}
                        disabled={busyKey !== null}
                        style={styles.acceptBtn}
                      >
                        <Text style={styles.acceptBtnText}>
                          {busyKey === `g-${inv.groupId}` ? '...' : 'Kabul'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={[styles.section, styles.friendsSection, { marginTop: appTheme.space.lg }]}>
              {sortedOutgoingPendingIds.length > 0 ? (
                <>
                  <View style={styles.friendsSectionHeader}>
                    <Text style={styles.sectionTitle}>Onay bekleyenler</Text>
                    <View style={styles.countPill}>
                      <Text style={styles.countPillText}>{sortedOutgoingPendingIds.length}</Text>
                    </View>
                  </View>
                  <Text style={styles.pendingSectionHint}>
                    Sen istek gönderdin; karşı taraf onaylayınca arkadaş olursunuz.
                  </Text>
                  <View style={styles.friendsList}>
                    {sortedOutgoingPendingIds.map((pendingUid, index) => {
                      const p = profiles.get(pendingUid);
                      const sub = subtitleForProfile(p);
                      const isLast = index === sortedOutgoingPendingIds.length - 1;
                      return (
                        <View
                          key={`out-${pendingUid}`}
                          style={[styles.friendCard, !isLast ? styles.friendCardSep : null]}
                        >
                          <View style={[styles.avatarLg, styles.avatarPending]}>
                            <Text style={styles.avatarLgText}>{initialFromName(displayName(pendingUid))}</Text>
                          </View>
                          <View style={styles.friendCardBody}>
                            <Text style={styles.friendCardName} numberOfLines={1}>
                              {displayName(pendingUid)}
                            </Text>
                            {sub ? (
                              <Text style={styles.friendCardPhone} numberOfLines={1}>
                                {sub}
                              </Text>
                            ) : null}
                            <View style={styles.pendingBadge}>
                              <Text style={styles.pendingBadgeText}>Onay bekleniyor</Text>
                            </View>
                          </View>
                          <Pressable
                            onPress={() => confirmCancelOutgoing(pendingUid)}
                            disabled={cancellingOutgoingUid !== null}
                            style={({ pressed }) => [
                              styles.cancelOutgoingBtn,
                              pressed ? { opacity: 0.85 } : null,
                              cancellingOutgoingUid === pendingUid ? { opacity: 0.5 } : null,
                            ]}
                            hitSlop={8}
                          >
                            <Text style={styles.cancelOutgoingBtnText}>
                              {cancellingOutgoingUid === pendingUid ? '…' : 'Geri al'}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                </>
              ) : null}

              <View
                style={[
                  styles.friendsSectionHeader,
                  sortedOutgoingPendingIds.length > 0 ? { paddingTop: appTheme.space.lg } : null,
                ]}
              >
                <Text style={styles.sectionTitle}>Onaylı arkadaşlar</Text>
                <View style={styles.countPill}>
                  <Text style={styles.countPillText}>{verifiedFriendIds.length}</Text>
                </View>
              </View>

              {sortedFriendIds.length === 0 ? (
                <Text style={styles.emptyFriends}>
                  {sortedOutgoingPendingIds.length > 0
                    ? 'Henüz onaylı arkadaş yok. Yukarıdaki kişiler onaylayınca buraya taşınır.'
                    : 'Henüz onaylı arkadaş yok. Yukarıdan arkadaş ekleyerek (e-posta, ad veya rehber) istek gönderebilirsin; karşı taraf onaylayınca burada görünür.'}
                </Text>
              ) : (
                <View style={styles.friendsList}>
                  {sortedFriendIds.map((friendUid, index) => {
                    const p = profiles.get(friendUid);
                    const sub = subtitleForProfile(p);
                    const isLast = index === sortedFriendIds.length - 1;
                    return (
                      <View
                        key={friendUid}
                        style={[styles.friendCard, !isLast ? styles.friendCardSep : null]}
                      >
                        <View style={styles.avatarLg}>
                          <Text style={styles.avatarLgText}>{initialFromName(displayName(friendUid))}</Text>
                        </View>
                        <View style={styles.friendCardBody}>
                          <Text style={styles.friendCardName} numberOfLines={1}>
                            {displayName(friendUid)}
                          </Text>
                          {sub ? (
                            <Text style={styles.friendCardPhone} numberOfLines={1}>
                              {sub}
                            </Text>
                          ) : null}
                        </View>
                        <Pressable
                          onPress={() => confirmRemoveFriend(friendUid)}
                          disabled={removingUid !== null}
                          style={({ pressed }) => [
                            styles.removeFriendBtn,
                            pressed ? { opacity: 0.85 } : null,
                            removingUid === friendUid ? { opacity: 0.5 } : null,
                          ]}
                          hitSlop={8}
                        >
                          <Text style={styles.removeFriendBtnText}>
                            {removingUid === friendUid ? '…' : 'Çıkar'}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              )}

              {orphanFriendIds.length > 0 ? (
                <>
                  <View style={[styles.friendsSectionHeader, { paddingTop: appTheme.space.lg }]}>
                    <Text style={styles.sectionTitle}>Tek yönlü kayıt</Text>
                    <View style={styles.countPill}>
                      <Text style={styles.countPillText}>{orphanFriendIds.length}</Text>
                    </View>
                  </View>
                  <Text style={styles.pendingSectionHint}>
                    Listende görünüyorlar; karşı profilde karşılık yok (eski hata veya manuel veri). «Kaldır» kendi
                    kaydını temizler.
                  </Text>
                  <View style={styles.friendsList}>
                    {orphanFriendIds.map((oid, index) => {
                      const isLast = index === orphanFriendIds.length - 1;
                      return (
                        <View
                          key={`orphan-${oid}`}
                          style={[styles.friendCard, !isLast ? styles.friendCardSep : null]}
                        >
                          <View style={[styles.avatarLg, styles.avatarPending]}>
                            <Text style={styles.avatarLgText}>{initialFromName(displayName(oid))}</Text>
                          </View>
                          <View style={styles.friendCardBody}>
                            <Text style={styles.friendCardName} numberOfLines={1}>
                              {displayName(oid)}
                            </Text>
                            <Text style={styles.friendCardPhone} numberOfLines={2}>
                              Karşılıklı arkadaşlık yok
                            </Text>
                          </View>
                          <Pressable
                            onPress={() => confirmRemoveOrphanFriend(oid)}
                            disabled={removingUid !== null}
                            style={({ pressed }) => [
                              styles.removeFriendBtn,
                              pressed ? { opacity: 0.85 } : null,
                              removingUid === oid ? { opacity: 0.5 } : null,
                            ]}
                            hitSlop={8}
                          >
                            <Text style={styles.removeFriendBtnText}>
                              {removingUid === oid ? '…' : 'Kaldır'}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                </>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function createFriendsHubStyles(t: AppTheme) {
  return StyleSheet.create({
    scrollContent: {
      paddingBottom: t.space.xxl,
      flexGrow: 0,
      /** RN Web: içerik dar kalınca flex:1 gövde 0 genişlik → metin tek harf satırlarına bölünüyor */
      width: '100%',
      maxWidth: '100%',
      alignItems: 'stretch',
    },
    backRow: { alignSelf: 'flex-start', paddingVertical: 4, paddingRight: 8, marginBottom: t.space.sm },
    backText: { color: t.color.primary, fontSize: t.font.body, fontWeight: '700' },
    header: { gap: 8, marginBottom: t.space.lg },
    title: { color: t.color.text, fontSize: t.font.h1, fontWeight: '900' },
    sub: { color: t.color.muted, fontSize: t.font.body, lineHeight: 22 },
    heroEmoji: { fontSize: 40, marginBottom: t.space.xs },
    secondaryBtn: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.xl,
      padding: t.space.lg,
      borderWidth: 1,
      borderColor: t.color.cardBorderAccent,
      ...t.shadowCard,
    },
    secondaryBtnText: { color: t.color.text, fontSize: t.font.body, fontWeight: '700' },
    secondaryBtnSub: { color: t.color.muted, fontSize: t.font.small, marginTop: 4 },
    section: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.xl,
      padding: t.space.lg,
      borderWidth: 1,
      borderColor: t.color.cardBorderPrimary,
      ...t.shadowCard,
      gap: 0,
      alignSelf: 'stretch',
      flexGrow: 0,
      flexShrink: 0,
      width: '100%',
      maxWidth: Platform.OS === 'web' ? 560 : ('100%' as const),
    },
    friendsSection: { paddingHorizontal: 0, paddingBottom: t.space.sm },
    sectionTitle: { color: t.color.text, fontSize: t.font.h2, fontWeight: '800' },
    sectionTitleWrap: { paddingHorizontal: t.space.lg, paddingTop: t.space.lg, paddingBottom: t.space.xs },
    friendsSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: t.space.lg,
      paddingTop: t.space.lg,
      paddingBottom: t.space.sm,
    },
    countPill: {
      backgroundColor: t.color.primarySoft,
      borderWidth: 1,
      borderColor: t.color.border,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: t.radius.pill,
    },
    countPillText: { color: t.color.text, fontSize: t.font.small, fontWeight: '800' },
    inboxRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: t.space.sm,
      paddingHorizontal: t.space.lg,
      paddingVertical: t.space.md,
      borderTopWidth: 1,
      borderTopColor: t.color.subtle,
      width: '100%',
      maxWidth: '100%',
      alignSelf: 'stretch',
    },
    inboxBody: {
      flex: 1,
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
      minWidth: 0,
      maxWidth: '100%',
    },
    rowTitle: {
      color: t.color.text,
      fontSize: t.font.body,
      fontWeight: '800',
      flexShrink: 1,
      maxWidth: '100%',
    },
    rowSub: { color: t.color.muted, fontSize: t.font.small, marginTop: 2 },
    requestActions: {
      flexDirection: 'row',
      gap: 8,
      flexShrink: 0,
      flexGrow: 0,
      marginTop: 2,
    },
    acceptBtn: {
      backgroundColor: t.color.primary,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: t.radius.pill,
    },
    acceptBtnText: { color: '#fff', fontWeight: '800', fontSize: t.font.small },
    declineBtn: {
      backgroundColor: t.color.inputBg,
      borderWidth: 1,
      borderColor: t.color.border,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: t.radius.pill,
    },
    declineBtnText: { color: t.color.text, fontWeight: '700', fontSize: t.font.small },
    mutedSmall: {
      color: t.color.muted,
      fontSize: t.font.small,
      marginTop: 4,
      lineHeight: 18,
      flexShrink: 1,
      maxWidth: '100%',
    },
    centered: { paddingVertical: t.space.lg, alignItems: 'center' },
    emptyFriends: {
      color: t.color.muted,
      fontSize: t.font.small,
      lineHeight: 20,
      paddingHorizontal: t.space.lg,
      paddingBottom: t.space.lg,
    },
    friendsList: { paddingBottom: t.space.xs },
    friendCard: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: t.space.md,
      paddingHorizontal: t.space.lg,
      gap: t.space.md,
    },
    friendCardSep: {
      borderBottomWidth: 1,
      borderBottomColor: t.color.subtle,
    },
    avatarSm: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: t.color.primarySoft,
      borderWidth: 1,
      borderColor: t.color.border,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      flexGrow: 0,
    },
    avatarGroup: { backgroundColor: t.color.accentSoft },
    avatarSmText: { color: t.color.text, fontSize: t.font.body, fontWeight: '900' },
    avatarLg: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: t.color.primarySoft,
      borderWidth: 1,
      borderColor: t.color.cardBorderPrimary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarLgText: { color: t.color.text, fontSize: t.font.h2, fontWeight: '900' },
    friendCardBody: { flex: 1, minWidth: 0 },
    friendCardName: { color: t.color.text, fontSize: t.font.body, fontWeight: '800' },
    friendCardPhone: { color: t.color.muted, fontSize: t.font.small, marginTop: 3 },
    removeFriendBtn: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: t.radius.pill,
      backgroundColor: 'rgba(239,68,68,0.12)',
      borderWidth: 1,
      borderColor: t.color.danger,
    },
    removeFriendBtnText: { color: t.color.danger, fontSize: t.font.small, fontWeight: '800' },
    pendingSectionHint: {
      color: t.color.muted,
      fontSize: t.font.small,
      lineHeight: 20,
      paddingHorizontal: t.space.lg,
      paddingBottom: t.space.sm,
    },
    avatarPending: {
      backgroundColor: t.color.inputBg,
      borderColor: t.color.border,
    },
    pendingBadge: {
      alignSelf: 'flex-start',
      marginTop: 6,
      backgroundColor: t.color.inputBg,
      borderWidth: 1,
      borderColor: t.color.border,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: t.radius.pill,
    },
    pendingBadgeText: { color: t.color.muted, fontSize: t.font.tiny, fontWeight: '800' },
    cancelOutgoingBtn: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: t.radius.pill,
      backgroundColor: t.color.inputBg,
      borderWidth: 1,
      borderColor: t.color.border,
    },
    cancelOutgoingBtnText: { color: t.color.text, fontSize: t.font.small, fontWeight: '800' },
  });
}
