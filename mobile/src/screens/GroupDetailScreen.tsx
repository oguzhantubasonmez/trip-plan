import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { addMemberToGroup, getGroup, removeMemberFromGroup, updateGroup } from '../services/groups';
import { getUserProfile } from '../services/userProfile';
import type { Group } from '../types/group';
import type { UserProfile } from '../services/userProfile';
import { theme } from '../theme';

export function GroupDetailScreen(props: {
  groupId: string;
  onBack: () => void;
}) {
  const [group, setGroup] = useState<Group | null>(null);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [addMemberModal, setAddMemberModal] = useState(false);
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
        const uidsToLoad = [...new Set([currentUid, ...g.memberIds, ...friends])];
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

  const friends = useMemo(() => {
    if (!currentUid) return [];
    const p = profiles.get(currentUid);
    return p?.friends ?? [];
  }, [currentUid, profiles]);
  const friendsNotInGroup = useMemo(() => {
    if (!group) return [];
    const inGroup = new Set(group.memberIds);
    return friends.filter((uid) => !inGroup.has(uid));
  }, [group, friends]);

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

  async function handleAddMember(uid: string) {
    try {
      await addMemberToGroup(props.groupId, uid);
      setAddMemberModal(false);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Üye eklenemedi.');
    }
  }

  async function handleRemoveMember(uid: string) {
    try {
      await removeMemberFromGroup(props.groupId, uid);
      await load();
    } catch (_) {}
  }

  if (loading && !group) {
    return (
      <Screen>
        <View style={styles.centered}>
          <ActivityIndicator />
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
          <View style={{ height: theme.space.md }} />
          <PrimaryButton title="Geri" onPress={props.onBack} />
        </View>
      </Screen>
    );
  }

  const isOwner = group.ownerId === currentUid;

  return (
    <Screen>
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
            <View style={{ height: theme.space.sm }} />
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
        {group.memberIds.length === 0 ? (
          <Text style={styles.muted}>Henüz üye yok. Arkadaşlarını gruba ekleyebilirsin.</Text>
        ) : (
          <View style={styles.memberList}>
            {group.memberIds.map((uid) => (
              <View key={uid} style={styles.memberRow}>
                <Text style={styles.memberName}>{displayName(uid)}</Text>
                {isOwner && (
                  <Pressable onPress={() => handleRemoveMember(uid)} style={styles.removeBtn}>
                    <Text style={styles.removeBtnText}>Çıkar</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        )}
      </View>

      <Modal
        visible={addMemberModal}
        transparent
        animationType="fade"
        onRequestClose={() => setAddMemberModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setAddMemberModal(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Üye ekle</Text>
            <Text style={styles.muted}>Sadece arkadaş listenizdeki kişileri ekleyebilirsiniz.</Text>
            <View style={{ height: theme.space.sm }} />
            {friendsNotInGroup.length === 0 ? (
              <Text style={styles.muted}>Eklenebilir arkadaş yok.</Text>
            ) : (
              <ScrollView style={styles.modalList}>
                {friendsNotInGroup.slice(0, 30).map((uid) => (
                  <Pressable
                    key={uid}
                    onPress={() => handleAddMember(uid)}
                    style={styles.friendRow}
                  >
                    <Text style={styles.friendName}>{displayName(uid)}</Text>
                    <Text style={styles.friendAdd}>Ekle</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <View style={{ height: theme.space.md }} />
            <PrimaryButton title="Kapat" onPress={() => setAddMemberModal(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: { alignSelf: 'flex-start', paddingVertical: 4, paddingRight: 8, marginBottom: theme.space.sm },
  backText: { color: theme.color.primary, fontSize: theme.font.body, fontWeight: '700' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { color: theme.color.muted, fontSize: theme.font.small },
  error: { color: theme.color.danger, fontSize: theme.font.body, fontWeight: '700', textAlign: 'center' },
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
  groupNameRead: { color: theme.color.text, fontSize: theme.font.body },
  linkBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  linkBtnText: { color: theme.color.primary, fontSize: theme.font.small, fontWeight: '700' },
  memberList: { gap: 4 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.subtle,
  },
  memberName: { color: theme.color.text, fontSize: theme.font.body },
  removeBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  removeBtnText: { color: theme.color.danger, fontSize: theme.font.small, fontWeight: '700' },
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
    maxHeight: '80%',
  },
  modalTitle: { color: theme.color.text, fontSize: theme.font.h2, fontWeight: '800', marginBottom: theme.space.sm },
  modalList: { maxHeight: 280, marginVertical: theme.space.sm },
  friendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  friendName: { color: theme.color.text, fontSize: theme.font.body },
  friendAdd: { color: theme.color.primary, fontSize: theme.font.small, fontWeight: '700' },
});
