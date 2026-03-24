import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
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
import { getUserProfile } from '../services/userProfile';
import type { UserProfile } from '../services/userProfile';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';

export function FriendsHubScreen(props: {
  onBack: () => void;
  onOpenGroups: () => void;
  onOpenContactInvite: () => void;
}) {
  const appTheme = useAppTheme();
  const styles = useMemo(() => createFriendsHubStyles(appTheme), [appTheme]);
  const uid = auth.currentUser?.uid;
  const [friendUids, setFriendUids] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const me = await getUserProfile(uid);
      const friends = me?.friends ?? [];
      setFriendUids(friends);
      const map = new Map<string, UserProfile>();
      await Promise.all(
        friends.map(async (id) => {
          const u = await getUserProfile(id);
          if (u) map.set(id, u);
        })
      );
      setProfiles(map);
    } catch (_) {
      setFriendUids([]);
      setProfiles(new Map());
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const displayName = (id: string) =>
    profiles.get(id)?.displayName?.trim() || profiles.get(id)?.phoneNumber || id.slice(0, 8);

  return (
    <Screen>
      <Pressable onPress={props.onBack} style={styles.backRow}>
        <Text style={styles.backText}>← Geri</Text>
      </Pressable>
      <View style={styles.header}>
        <Text style={styles.heroEmoji}>👥 ✨</Text>
        <Text style={styles.title}>Arkadaşlarım</Text>
        <Text style={styles.sub}>
          Rota oluşturduğunda katılımcı ve gruplar buradan yönetilir. Rehberden uygulama kullananları
          ekleyebilir, gruplar oluşturup rotaya toplu davet edebilirsin.
        </Text>
      </View>

      <PrimaryButton title="📱 Rehberden arkadaş ekle" onPress={props.onOpenContactInvite} />
      <View style={{ height: appTheme.space.sm }} />
      <Pressable onPress={props.onOpenGroups} style={styles.secondaryBtn}>
        <Text style={styles.secondaryBtnText}>Arkadaş gruplarım</Text>
        <Text style={styles.secondaryBtnSub}>Grupları oluştur, rotaya tek tıkla ekle</Text>
      </Pressable>

      <View style={{ height: appTheme.space.lg }} />
      <Text style={styles.listTitle}>Arkadaş listesi ({friendUids.length})</Text>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={appTheme.color.primary} />
        </View>
      ) : friendUids.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.muted}>Henüz arkadaş yok. Yukarıdan rehberden ekleyebilirsin.</Text>
        </View>
      ) : (
        <FlatList
          data={friendUids}
          keyExtractor={(id) => id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <View style={styles.friendRow}>
              <Text style={styles.friendName}>{displayName(item)}</Text>
            </View>
          )}
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: appTheme.color.subtle }} />
          )}
        />
      )}
    </Screen>
  );
}

function createFriendsHubStyles(t: AppTheme) {
  return StyleSheet.create({
    backRow: { alignSelf: 'flex-start', paddingVertical: 4, paddingRight: 8, marginBottom: t.space.sm },
    backText: { color: t.color.primary, fontSize: t.font.body, fontWeight: '700' },
    header: { gap: 8, marginBottom: t.space.lg },
    title: { color: t.color.text, fontSize: t.font.h1, fontWeight: '900' },
    sub: { color: t.color.muted, fontSize: t.font.body, lineHeight: 22 },
    heroEmoji: { fontSize: 36, marginBottom: t.space.xs },
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
    listTitle: { color: t.color.text, fontSize: t.font.h2, fontWeight: '800', marginBottom: t.space.sm },
    centered: { paddingVertical: t.space.lg, alignItems: 'center' },
    card: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.xl,
      padding: t.space.lg,
      borderWidth: 1,
      borderColor: t.color.border,
      ...t.shadowCard,
    },
    muted: { color: t.color.muted, fontSize: t.font.small, lineHeight: 20 },
    friendRow: { paddingVertical: 12 },
    friendName: { color: t.color.text, fontSize: t.font.body, fontWeight: '600' },
  });
}
