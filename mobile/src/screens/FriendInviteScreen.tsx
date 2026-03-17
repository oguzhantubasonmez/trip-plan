import * as Contacts from 'expo-contacts';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { auth } from '../lib/firebase';
import { addFriendBothWays, getDevicePhoneNumbersE164, matchUsersByPhoneNumbers, MatchedUser } from '../services/friends';
import { getUserProfile } from '../services/userProfile';
import { theme } from '../theme';
import { maskPhone } from '../utils/phone';

type Row = MatchedUser & { status: 'add' | 'added' | 'self' };

export function FriendInviteScreen(props: { onDone: () => void }) {
  const currentUid = auth.currentUser?.uid;
  const [permission, setPermission] = useState<Contacts.PermissionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(() => 'Arkadaşlarını bul', []);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const perm = await Contacts.getPermissionsAsync();
      setPermission(perm.status);
      if (perm.status !== 'granted') {
        setRows([]);
        return;
      }

      if (!currentUid) throw new Error('Oturum bulunamadı.');

      const [me, nums] = await Promise.all([getUserProfile(currentUid), getDevicePhoneNumbersE164()]);
      const myFriends = new Set((me?.friends || []) as string[]);
      const matched = await matchUsersByPhoneNumbers(nums);

      const mapped: Row[] = matched.map((u) => ({
        ...u,
        status: u.uid === currentUid ? 'self' : myFriends.has(u.uid) ? 'added' : 'add',
      }));

      const filtered = mapped.filter((r) => r.status !== 'self');
      filtered.sort((a, b) => (a.status === b.status ? 0 : a.status === 'added' ? 1 : -1));
      setRows(filtered);
    } catch (e: any) {
      setError(e?.message || 'Rehber eşleştirme başarısız.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function requestPermission() {
    await Contacts.requestPermissionsAsync();
    await refresh();
  }

  async function addFriend(uid: string) {
    if (!currentUid) return;
    setBusyUid(uid);
    setError(null);
    try {
      await addFriendBothWays({ currentUid, friendUid: uid });
      setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, status: 'added' } : r)));
    } catch (e: any) {
      setError(e?.message || 'Arkadaş eklenemedi.');
    } finally {
      setBusyUid(null);
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>Rehberindeki RouteWise kullanıcılarını listeliyoruz.</Text>
      </View>

      {permission !== 'granted' ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Rehber erişimi gerekli</Text>
          <Text style={styles.cardSub}>
            Arkadaşlarını otomatik bulmak için rehberine erişmemiz gerekiyor. İstersen daha sonra da açabilirsin.
          </Text>
          <View style={{ height: theme.space.md }} />
          <PrimaryButton title="Rehbere eriş" onPress={requestPermission} />
          <View style={{ height: theme.space.sm }} />
          <Text onPress={props.onDone} style={styles.skip}>
            Şimdilik geç
          </Text>
        </View>
      ) : (
        <>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.listCard}>
            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator />
                <Text style={styles.loadingText}>Eşleştiriliyor...</Text>
              </View>
            ) : rows.length ? (
              <FlatList
                data={rows}
                keyExtractor={(i) => i.uid}
                renderItem={({ item }) => (
                  <View style={styles.row}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {(item.displayName || item.phoneNumber || '?').trim().slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{item.displayName?.trim() || 'RouteWise Kullanıcısı'}</Text>
                      <Text style={styles.phone}>{maskPhone(item.phoneNumber)}</Text>
                    </View>
                    {item.status === 'added' ? (
                      <View style={styles.addedPill}>
                        <Text style={styles.addedText}>Eklendi</Text>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => addFriend(item.uid)}
                        disabled={busyUid === item.uid}
                        style={({ pressed }) => [
                          styles.addBtn,
                          pressed ? { opacity: 0.9 } : null,
                          busyUid === item.uid ? { opacity: 0.55 } : null,
                        ]}
                      >
                        <Text style={styles.addBtnText}>{busyUid === item.uid ? '...' : 'Ekle'}</Text>
                      </Pressable>
                    )}
                  </View>
                )}
                ItemSeparatorComponent={() => <View style={styles.sep} />}
              />
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>Eşleşen kullanıcı bulunamadı</Text>
                <Text style={styles.emptySub}>Rehberinde RouteWise kullanan kimse yoksa sorun değil. Devam edebilirsin.</Text>
              </View>
            )}
          </View>

          <View style={styles.bottom}>
            <PrimaryButton title="Rota planlamaya geç" onPress={props.onDone} />
            <View style={{ height: theme.space.sm }} />
            <Text onPress={refresh} style={styles.refresh}>
              Yenile
            </Text>
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 6, marginBottom: theme.space.md },
  title: { color: theme.color.text, fontSize: theme.font.h2, fontWeight: '900' },
  sub: { color: theme.color.muted, fontSize: theme.font.body, lineHeight: 22 },
  error: { color: theme.color.danger, fontSize: theme.font.small, fontWeight: '700', marginBottom: theme.space.sm },
  card: {
    marginTop: theme.space.lg,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.space.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  cardTitle: { color: theme.color.text, fontSize: theme.font.body, fontWeight: '800', marginBottom: 6 },
  cardSub: { color: theme.color.muted, fontSize: theme.font.body, lineHeight: 22 },
  skip: {
    color: theme.color.muted,
    fontSize: theme.font.small,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  listCard: {
    flex: 1,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
    overflow: 'hidden',
  },
  loading: { padding: theme.space.lg, alignItems: 'center', gap: 12 },
  loadingText: { color: theme.color.muted, fontSize: theme.font.small, fontWeight: '700' },
  empty: { padding: theme.space.lg, gap: 8 },
  emptyTitle: { color: theme.color.text, fontSize: theme.font.body, fontWeight: '800' },
  emptySub: { color: theme.color.muted, fontSize: theme.font.small, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.color.primarySoft,
    borderWidth: 1,
    borderColor: theme.color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: theme.color.text, fontWeight: '900' },
  name: { color: theme.color.text, fontSize: theme.font.body, fontWeight: '800' },
  phone: { color: theme.color.muted, fontSize: theme.font.small, marginTop: 2 },
  addBtn: {
    backgroundColor: theme.color.primarySoft,
    borderWidth: 1,
    borderColor: theme.color.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
  },
  addBtnText: { color: theme.color.text, fontWeight: '800', fontSize: theme.font.small },
  addedPill: {
    backgroundColor: 'rgba(74,222,128,0.18)',
    borderWidth: 1,
    borderColor: theme.color.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
  },
  addedText: { color: theme.color.text, fontWeight: '800', fontSize: theme.font.small },
  sep: { height: 1, backgroundColor: theme.color.subtle, marginLeft: 14 },
  bottom: { paddingTop: theme.space.md },
  refresh: { color: theme.color.muted, fontSize: theme.font.small, textAlign: 'center', textDecorationLine: 'underline' },
});

