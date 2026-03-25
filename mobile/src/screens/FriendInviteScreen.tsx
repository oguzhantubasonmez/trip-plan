import * as Contacts from 'expo-contacts';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { auth } from '../lib/firebase';
import {
  acceptFriendRequest,
  getDevicePhoneNumbersE164,
  listIncomingFriendRequests,
  listOutgoingFriendRequestTargetUids,
  matchUsersByPhoneNumbers,
  MatchedUser,
  sendFriendRequest,
} from '../services/friends';
import { getUserProfile } from '../services/userProfile';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';
import { firestorePermissionUserMessage, isFirestorePermissionDenied } from '../utils/firestoreErrors';
import { maskPhone } from '../utils/phone';

type RowStatus = 'friend' | 'pending_out' | 'pending_in' | 'add';

type Row = MatchedUser & { status: RowStatus };

export function FriendInviteScreen(props: { onDone: () => void }) {
  const appTheme = useAppTheme();
  const styles = useMemo(() => createFriendInviteStyles(appTheme), [appTheme]);
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

      const [me, nums, outgoingPending] = await Promise.all([
        getUserProfile(currentUid),
        getDevicePhoneNumbersE164(),
        listOutgoingFriendRequestTargetUids(currentUid),
      ]);
      const myFriendIds = new Set((me?.friends || []) as string[]);
      const matched = await matchUsersByPhoneNumbers(nums);

      const profiles = new Map<string, Awaited<ReturnType<typeof getUserProfile>>>();
      await Promise.all(
        matched.map(async (u) => {
          const p = await getUserProfile(u.uid);
          if (p) profiles.set(u.uid, p);
        })
      );

      const mapped: Row[] = matched
        .filter((u) => u.uid !== currentUid)
        .map((u) => {
          const theirFriends = profiles.get(u.uid)?.friends ?? [];
          const mutual = myFriendIds.has(u.uid) && theirFriends.includes(currentUid);
          if (mutual) return { ...u, status: 'friend' as const };
          if (outgoingPending.has(u.uid)) return { ...u, status: 'pending_out' as const };
          return { ...u, status: 'add' as const };
        });

      const incoming = await listIncomingFriendRequests(currentUid);
      const incomingFrom = new Set(incoming.map((r) => r.fromUid));

      const withIncoming: Row[] = mapped.map((r) => {
        if (r.status !== 'add' && r.status !== 'pending_out') return r;
        if (incomingFrom.has(r.uid)) return { ...r, status: 'pending_in' };
        return r;
      });

      withIncoming.sort((a, b) => {
        const rank = (s: RowStatus) =>
          s === 'pending_in' ? 0 : s === 'add' ? 1 : s === 'pending_out' ? 2 : 3;
        const d = rank(a.status) - rank(b.status);
        return d !== 0 ? d : (a.displayName || '').localeCompare(b.displayName || '');
      });
      setRows(withIncoming);
    } catch (e: any) {
      setError(
        isFirestorePermissionDenied(e) ? firestorePermissionUserMessage() : e?.message || 'Rehber eşleştirme başarısız.'
      );
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

  async function sendRequest(uid: string) {
    if (!currentUid) return;
    setBusyUid(uid);
    setError(null);
    try {
      await sendFriendRequest({ fromUid: currentUid, toUid: uid });
      setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, status: 'pending_out' } : r)));
    } catch (e: any) {
      setError(
        isFirestorePermissionDenied(e) ? firestorePermissionUserMessage() : e?.message || 'İstek gönderilemedi.'
      );
    } finally {
      setBusyUid(null);
    }
  }

  async function acceptIncoming(uid: string) {
    if (!currentUid) return;
    setBusyUid(uid);
    setError(null);
    try {
      await acceptFriendRequest({ fromUid: uid, toUid: currentUid });
      setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, status: 'friend' } : r)));
    } catch (e: any) {
      setError(
        isFirestorePermissionDenied(e) ? firestorePermissionUserMessage() : e?.message || 'Onaylanamadı.'
      );
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
          <View style={{ height: appTheme.space.md }} />
          <PrimaryButton title="Rehbere eriş" onPress={requestPermission} />
          <View style={{ height: appTheme.space.sm }} />
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
                    {item.status === 'friend' ? (
                      <View style={styles.addedPill}>
                        <Text style={styles.addedText}>Arkadaşsınız</Text>
                      </View>
                    ) : item.status === 'pending_out' ? (
                      <View style={styles.pendingPill}>
                        <Text style={styles.pendingText}>Onay bekleniyor</Text>
                      </View>
                    ) : item.status === 'pending_in' ? (
                      <Pressable
                        onPress={() => acceptIncoming(item.uid)}
                        disabled={busyUid === item.uid}
                        style={({ pressed }) => [
                          styles.acceptBtn,
                          pressed ? { opacity: 0.9 } : null,
                          busyUid === item.uid ? { opacity: 0.55 } : null,
                        ]}
                      >
                        <Text style={styles.acceptBtnText}>{busyUid === item.uid ? '...' : 'Onayla'}</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => sendRequest(item.uid)}
                        disabled={busyUid === item.uid}
                        style={({ pressed }) => [
                          styles.addBtn,
                          pressed ? { opacity: 0.9 } : null,
                          busyUid === item.uid ? { opacity: 0.55 } : null,
                        ]}
                      >
                        <Text style={styles.addBtnText}>{busyUid === item.uid ? '...' : 'İstek gönder'}</Text>
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
            <View style={{ height: appTheme.space.sm }} />
            <Text onPress={refresh} style={styles.refresh}>
              Yenile
            </Text>
          </View>
        </>
      )}
    </Screen>
  );
}

function createFriendInviteStyles(t: AppTheme) {
  return StyleSheet.create({
    header: { gap: 6, marginBottom: t.space.md },
    title: { color: t.color.text, fontSize: t.font.h2, fontWeight: '900' },
    sub: { color: t.color.muted, fontSize: t.font.body, lineHeight: 22 },
    error: { color: t.color.danger, fontSize: t.font.small, fontWeight: '700', marginBottom: t.space.sm },
    card: {
      marginTop: t.space.lg,
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.lg,
      borderWidth: 1,
      borderColor: t.color.border,
    },
    cardTitle: { color: t.color.text, fontSize: t.font.body, fontWeight: '800', marginBottom: 6 },
    cardSub: { color: t.color.muted, fontSize: t.font.body, lineHeight: 22 },
    skip: {
      color: t.color.muted,
      fontSize: t.font.small,
      textAlign: 'center',
      textDecorationLine: 'underline',
    },
    listCard: {
      flex: 1,
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      borderWidth: 1,
      borderColor: t.color.border,
      overflow: 'hidden',
    },
    loading: { padding: t.space.lg, alignItems: 'center', gap: 12 },
    loadingText: { color: t.color.muted, fontSize: t.font.small, fontWeight: '700' },
    empty: { padding: t.space.lg, gap: 8 },
    emptyTitle: { color: t.color.text, fontSize: t.font.body, fontWeight: '800' },
    emptySub: { color: t.color.muted, fontSize: t.font.small, lineHeight: 18 },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
    avatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: t.color.primarySoft,
      borderWidth: 1,
      borderColor: t.color.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: t.color.text, fontWeight: '900' },
    name: { color: t.color.text, fontSize: t.font.body, fontWeight: '800' },
    phone: { color: t.color.muted, fontSize: t.font.small, marginTop: 2 },
    addBtn: {
      backgroundColor: t.color.primarySoft,
      borderWidth: 1,
      borderColor: t.color.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: t.radius.pill,
    },
    addBtnText: { color: t.color.text, fontWeight: '800', fontSize: t.font.small },
    acceptBtn: {
      backgroundColor: t.color.primary,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: t.radius.pill,
    },
    acceptBtnText: { color: '#fff', fontWeight: '800', fontSize: t.font.small },
    addedPill: {
      backgroundColor: 'rgba(74,222,128,0.18)',
      borderWidth: 1,
      borderColor: t.color.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: t.radius.pill,
    },
    addedText: { color: t.color.text, fontWeight: '800', fontSize: t.font.small },
    pendingPill: {
      backgroundColor: t.color.inputBg,
      borderWidth: 1,
      borderColor: t.color.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: t.radius.pill,
    },
    pendingText: { color: t.color.muted, fontWeight: '800', fontSize: t.font.small },
    sep: { height: 1, backgroundColor: t.color.subtle, marginLeft: 14 },
    bottom: { paddingTop: t.space.md },
    refresh: { color: t.color.muted, fontSize: t.font.small, textAlign: 'center', textDecorationLine: 'underline' },
  });
}
