import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { auth } from '../lib/firebase';
import { filterMutualFriendUids } from '../services/friends';
import {
  deleteGroup,
  getGroup,
  inviteMemberToGroup,
  leaveGroup,
  listPendingGroupInvitesForGroup,
  removeMemberFromGroup,
  updateGroup,
} from '../services/groups';
import type { GroupInvite } from '../services/groups';
import { getUserProfile } from '../services/userProfile';
import type { Group } from '../types/group';
import type { UserProfile } from '../services/userProfile';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';

export function GroupDetailScreen(props: {
  groupId: string;
  onBack: () => void;
}) {
  const appTheme = useAppTheme();
  const styles = useMemo(() => createGroupDetailStyles(appTheme), [appTheme]);
  const [group, setGroup] = useState<Group | null>(null);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [addMemberModal, setAddMemberModal] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<GroupInvite[]>([]);
  const [mutualFriendIds, setMutualFriendIds] = useState<string[]>([]);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const currentUid = auth.currentUser?.uid;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const g = await getGroup(props.groupId);
      setGroup(g ?? null);
      if (g && currentUid) {
        setEditName(g.name);
        const myProfile = await getUserProfile(currentUid);
        const friends = myProfile?.friends ?? [];
        const [mutual, pending] = await Promise.all([
          filterMutualFriendUids(currentUid, friends),
          listPendingGroupInvitesForGroup(props.groupId),
        ]);
        setMutualFriendIds(mutual);
        setPendingInvites(pending);
        const uidsToLoad = [...new Set([currentUid, ...g.memberIds, ...friends, ...mutual])];
        const map = new Map<string, UserProfile>();
        await Promise.all(
          uidsToLoad.map(async (id) => {
            const u = await getUserProfile(id);
            if (u) map.set(id, u);
          })
        );
        setProfiles(map);
      } else if (g) {
        setEditName(g.name);
        setMutualFriendIds([]);
        setPendingInvites([]);
        const map = new Map<string, UserProfile>();
        for (const id of g.memberIds) {
          const u = await getUserProfile(id);
          if (u) map.set(id, u);
        }
        setProfiles(map);
      }
    } catch (e: any) {
      setError(e?.message || 'Grup yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [props.groupId, currentUid]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const friendsNotInGroup = useMemo(() => {
    if (!group) return [];
    const inGroup = new Set(group.memberIds);
    const pendingUids = new Set(pendingInvites.map((i) => i.toUid));
    return mutualFriendIds.filter((uid) => !inGroup.has(uid) && !pendingUids.has(uid));
  }, [group, mutualFriendIds, pendingInvites]);

  const displayName = (uid: string) =>
    profiles.get(uid)?.displayName?.trim() || profiles.get(uid)?.phoneNumber || uid.slice(0, 8);

  async function handleSaveName() {
    if (!group || group.ownerId !== currentUid || editName.trim() === group.name) return;
    setSavingName(true);
    try {
      await updateGroup(props.groupId, { name: editName.trim() });
      await load();
    } catch (_) {}
    setSavingName(false);
  }

  async function handleInviteMember(uid: string) {
    if (!currentUid || !group || group.ownerId !== currentUid) return;
    try {
      await inviteMemberToGroup({ groupId: props.groupId, ownerUid: currentUid, memberUid: uid });
      setAddMemberModal(false);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Davet gönderilemedi.');
    }
  }

  function confirmRemoveMember(targetUid: string) {
    if (!currentUid) return;
    const label = displayName(targetUid);
    Alert.alert(
      'Üyeyi çıkar',
      `«${label}» gruptan çıkarılsın mı? Kişiye uygulama içi bildirim gider.`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Çıkar',
          style: 'destructive',
          onPress: () =>
            void (async () => {
              try {
                await removeMemberFromGroup(props.groupId, targetUid, currentUid);
                await load();
              } catch (e: any) {
                setError(e?.message || 'Üye çıkarılamadı.');
              }
            })(),
        },
      ]
    );
  }

  function confirmLeaveGroup() {
    if (!currentUid || !group) return;
    Alert.alert(
      'Gruptan ayrıl',
      `«${group.name}» grubundan ayrılmak istediğine emin misin? Grup sahibine bildirim gider.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Ayrıl',
          style: 'destructive',
          onPress: () =>
            void (async () => {
              try {
                await leaveGroup(props.groupId, currentUid);
                props.onBack();
              } catch (e: any) {
                setError(e?.message || 'Gruptan ayrılamadın.');
              }
            })(),
        },
      ]
    );
  }

  function confirmDeleteGroup() {
    if (!currentUid || !group || group.ownerId !== currentUid) return;
    Alert.alert(
      'Grubu sil',
      `«${group.name}» kalıcı olarak silinir. Üyeler grupta görünmez; bekleyen davetler iptal olur. Emin misin?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Grubu sil',
          style: 'destructive',
          onPress: () =>
            void (async () => {
              setDeletingGroup(true);
              setError(null);
              try {
                await deleteGroup({ groupId: props.groupId, actorUid: currentUid });
                props.onBack();
              } catch (e: any) {
                setError(e?.message || 'Grup silinemedi.');
              } finally {
                setDeletingGroup(false);
              }
            })(),
        },
      ]
    );
  }

  if (loading && !group) {
    return (
      <Screen>
        <View style={styles.centered}>
          <ActivityIndicator color={appTheme.color.primary} />
          <Text style={styles.muted}>Yükleniyor...</Text>
        </View>
      </Screen>
    );
  }

  if (!group) {
    return (
      <Screen>
        <View style={styles.centered}>
          <Text style={styles.error}>{error || 'Grup bulunamadı.'}</Text>
          <View style={{ height: appTheme.space.md }} />
          <PrimaryButton title="Geri" onPress={props.onBack} />
        </View>
      </Screen>
    );
  }

  const isOwner = group.ownerId === currentUid;
  const isMember = Boolean(currentUid && group.memberIds.includes(currentUid));

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: appTheme.space.xl }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
      <Pressable onPress={props.onBack} style={styles.backRow}>
        <Text style={styles.backText}>← Geri</Text>
      </Pressable>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Grup adı</Text>
        {isOwner ? (
          <>
            <TextField
              label=""
              value={editName}
              placeholder="Grup adı"
              onChangeText={setEditName}
            />
            <View style={{ height: appTheme.space.sm }} />
            <PrimaryButton
              title="Kaydet"
              onPress={handleSaveName}
              loading={savingName}
              disabled={editName.trim() === group.name}
            />
          </>
        ) : (
          <Text style={styles.groupNameRead}>{group.name}</Text>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Üyeler ({group.memberIds.length})</Text>
          {isOwner && (
            <Pressable onPress={() => setAddMemberModal(true)} style={styles.linkBtn}>
              <Text style={styles.linkBtnText}>+ Üye ekle</Text>
            </Pressable>
          )}
        </View>
        {group.memberIds.length === 0 && pendingInvites.length === 0 ? (
          <Text style={styles.muted}>Henüz üye yok. Onaylı arkadaşlarına grup daveti gönderebilirsin.</Text>
        ) : (
          <View style={styles.memberList}>
            {group.memberIds.map((memberUid) => (
              <View key={memberUid} style={styles.memberRow}>
                <Text style={styles.memberName}>{displayName(memberUid)}</Text>
                {isOwner && memberUid !== group.ownerId ? (
                  <Pressable onPress={() => confirmRemoveMember(memberUid)} style={styles.removeBtn}>
                    <Text style={styles.removeBtnText}>Çıkar</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
            {pendingInvites.map((inv) => (
              <View key={inv.id} style={styles.memberRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{displayName(inv.toUid)}</Text>
                  <Text style={styles.pendingSub}>Onay bekleniyor</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {isOwner ? (
        <View style={styles.section}>
          <Pressable
            onPress={confirmDeleteGroup}
            disabled={deletingGroup}
            style={({ pressed }) => [
              styles.deleteGroupBtn,
              pressed && { opacity: 0.88 },
              deletingGroup ? { opacity: 0.55 } : null,
            ]}
          >
            <Text style={styles.deleteGroupBtnText}>{deletingGroup ? 'Siliniyor…' : 'Grubu sil'}</Text>
          </Pressable>
          <Text style={styles.muted}>
            Grubu yalnızca sen oluşturduğun için silebilirsin. Silinince üyeler bu grubu listede görmez.
          </Text>
        </View>
      ) : null}

      {!isOwner && isMember ? (
        <View style={styles.section}>
          <Pressable onPress={confirmLeaveGroup} style={styles.leaveBtn}>
            <Text style={styles.leaveBtnText}>Gruptan ayrıl</Text>
          </Pressable>
          <Text style={styles.muted}>
            Ayrılınca grup sahibine bildirim gider; tekrar katılmak için davet gerekir.
          </Text>
        </View>
      ) : null}

      </ScrollView>

      <Modal
        visible={addMemberModal}
        transparent
        animationType="fade"
        onRequestClose={() => setAddMemberModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setAddMemberModal(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Üye davet et</Text>
            <Text style={styles.muted}>
              Yalnızca karşılıklı onaylı arkadaşların davet alır; kabul edene kadar grupta onay bekleniyor
              görünür.
            </Text>
            <View style={{ height: appTheme.space.sm }} />
            {friendsNotInGroup.length === 0 ? (
              <Text style={styles.muted}>Davet gönderebileceğin onaylı arkadaş yok veya hepsi zaten üye.</Text>
            ) : (
              <ScrollView style={styles.modalList}>
                {friendsNotInGroup.slice(0, 30).map((friendUid) => (
                  <Pressable
                    key={friendUid}
                    onPress={() => handleInviteMember(friendUid)}
                    style={styles.friendRow}
                  >
                    <Text style={styles.friendName}>{displayName(friendUid)}</Text>
                    <Text style={styles.friendAdd}>Davet gönder</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <View style={{ height: appTheme.space.md }} />
            <PrimaryButton title="Kapat" onPress={() => setAddMemberModal(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function createGroupDetailStyles(t: AppTheme) {
  return StyleSheet.create({
    backRow: { alignSelf: 'flex-start', paddingVertical: 4, paddingRight: 8, marginBottom: t.space.sm },
    backText: { color: t.color.primary, fontSize: t.font.body, fontWeight: '700' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    muted: { color: t.color.muted, fontSize: t.font.small },
    error: { color: t.color.danger, fontSize: t.font.body, fontWeight: '700', textAlign: 'center' },
    section: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.lg,
      borderWidth: 1,
      borderColor: t.color.border,
      marginBottom: t.space.md,
    },
    sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: t.space.sm },
    sectionTitle: { color: t.color.text, fontSize: t.font.h2, fontWeight: '800' },
    groupNameRead: { color: t.color.text, fontSize: t.font.body },
    linkBtn: { paddingVertical: 4, paddingHorizontal: 8 },
    linkBtnText: { color: t.color.primary, fontSize: t.font.small, fontWeight: '700' },
    memberList: { gap: 4 },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: t.color.subtle,
    },
    memberName: { color: t.color.text, fontSize: t.font.body },
    pendingSub: { color: t.color.muted, fontSize: t.font.small, marginTop: 2 },
    removeBtn: { paddingVertical: 4, paddingHorizontal: 8 },
    removeBtnText: { color: t.color.danger, fontSize: t.font.small, fontWeight: '700' },
    modalOverlay: {
      flex: 1,
      backgroundColor: t.color.overlayDark,
      justifyContent: 'center',
      alignItems: 'center',
      padding: t.space.lg,
    },
    modalContent: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.lg,
      borderWidth: 1,
      borderColor: t.color.border,
      width: '100%',
      maxWidth: 400,
      maxHeight: '80%',
    },
    modalTitle: { color: t.color.text, fontSize: t.font.h2, fontWeight: '800', marginBottom: t.space.sm },
    modalList: { maxHeight: 280, marginVertical: t.space.sm },
    friendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
    friendName: { color: t.color.text, fontSize: t.font.body },
    friendAdd: { color: t.color.primary, fontSize: t.font.small, fontWeight: '700' },
    leaveBtn: {
      alignSelf: 'flex-start',
      paddingVertical: 10,
      paddingHorizontal: t.space.md,
      borderRadius: t.radius.md,
      borderWidth: 1,
      borderColor: t.color.danger,
      marginBottom: t.space.sm,
    },
    leaveBtnText: { color: t.color.danger, fontSize: t.font.body, fontWeight: '800' },
    deleteGroupBtn: {
      alignSelf: 'flex-start',
      paddingVertical: 12,
      paddingHorizontal: t.space.md,
      borderRadius: t.radius.md,
      backgroundColor: 'rgba(239,68,68,0.14)',
      borderWidth: 1,
      borderColor: t.color.danger,
      marginBottom: t.space.sm,
    },
    deleteGroupBtnText: { color: t.color.danger, fontSize: t.font.body, fontWeight: '800' },
  });
}
