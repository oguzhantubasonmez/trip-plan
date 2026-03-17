import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { auth } from '../lib/firebase';
import { getGroupsForUser } from '../services/groups';
import type { Group } from '../types/group';
import { theme } from '../theme';

export function GroupsScreen(props: {
  onBack: () => void;
  onCreateGroup: () => void;
  onOpenGroup: (groupId: string) => void;
}) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const uid = auth.currentUser?.uid;

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const list = await getGroupsForUser(uid);
      setGroups(list);
    } catch (_) {
      setGroups([]);
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
      <Pressable onPress={props.onBack} style={styles.backRow}>
        <Text style={styles.backText}>← Geri</Text>
      </Pressable>
      <View style={styles.header}>
        <Text style={styles.title}>Arkadaş grupları</Text>
        <Text style={styles.sub}>
          Grup oluştur, arkadaşlarını ekle. Rotaya katılımcı eklerken grubu tek tıkla ekleyebilirsin.
        </Text>
      </View>

      <PrimaryButton title="+ Yeni grup" onPress={props.onCreateGroup} />
      <View style={{ height: theme.space.lg }} />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator />
          <Text style={styles.muted}>Gruplar yükleniyor...</Text>
        </View>
      ) : groups.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Henüz grup yok</Text>
          <Text style={styles.cardSub}>
            "Yeni grup" ile bir grup oluştur, ardından arkadaşlarını gruba ekle. Rotaya katılımcı
            eklerken tüm grubu tek seferde ekleyebilirsin.
          </Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.groupId}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => props.onOpenGroup(item.groupId)}
              style={({ pressed }) => [styles.groupCard, pressed && styles.pressed]}
            >
              <Text style={styles.groupName}>{item.name}</Text>
              <Text style={styles.groupMeta}>
                {item.memberIds.length} {item.memberIds.length === 1 ? 'kişi' : 'kişi'}
              </Text>
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={{ height: theme.space.sm }} />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: { alignSelf: 'flex-start', paddingVertical: 4, paddingRight: 8, marginBottom: theme.space.sm },
  backText: { color: theme.color.primary, fontSize: theme.font.body, fontWeight: '700' },
  header: { gap: 6, marginBottom: theme.space.lg },
  title: { color: theme.color.text, fontSize: theme.font.h1, fontWeight: '900' },
  sub: { color: theme.color.muted, fontSize: theme.font.body, lineHeight: 22 },
  centered: { paddingVertical: theme.space.xl, alignItems: 'center', gap: 12 },
  muted: { color: theme.color.muted, fontSize: theme.font.small },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.space.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  cardTitle: { color: theme.color.text, fontSize: theme.font.body, fontWeight: '800' },
  cardSub: { color: theme.color.muted, fontSize: theme.font.small, lineHeight: 20, marginTop: 6 },
  groupCard: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.space.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  pressed: { opacity: 0.9 },
  groupName: { color: theme.color.text, fontSize: theme.font.h2, fontWeight: '800' },
  groupMeta: { color: theme.color.muted, fontSize: theme.font.small, marginTop: 4 },
});
