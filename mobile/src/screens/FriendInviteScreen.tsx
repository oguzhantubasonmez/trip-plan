import * as Contacts from 'expo-contacts';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { auth } from '../lib/firebase';
import {
  acceptFriendRequest,
  enrichHitsWithFriendStatus,
  getDevicePhoneNumbersE164,
  matchUsersByPhoneNumbers,
  searchUserByEmail,
  searchUserByPhoneQuery,
  searchUsersByDisplayNamePrefix,
  sendFriendRequest,
  type FriendDiscoveryRowStatus,
  type UserSearchHit,
} from '../services/friends';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';
import { firestorePermissionUserMessage, isFirestorePermissionDenied } from '../utils/firestoreErrors';
import { maskPhone } from '../utils/phone';

type Row = UserSearchHit & { status: FriendDiscoveryRowStatus };

function InviteUserRow(props: {
  item: Row;
  busyUid: string | null;
  styles: ReturnType<typeof createFriendInviteStyles>;
  onSend: (uid: string) => void;
  onAccept: (uid: string) => void;
}) {
  const { item, busyUid, styles, onSend, onAccept } = props;
  const subParts: string[] = [];
  if (item.email?.trim()) subParts.push(item.email.trim());
  if (item.phoneNumber) subParts.push(maskPhone(item.phoneNumber));
  const sub = subParts.length ? subParts.join(' · ') : 'İletişim bilgisi yok';

  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {(item.displayName || item.email || item.phoneNumber || '?').trim().slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <View style={styles.rowMain}>
        <Text style={styles.name} numberOfLines={2}>
          {item.displayName?.trim() || 'RouteWise kullanıcısı'}
        </Text>
        <Text style={styles.phone} numberOfLines={3}>
          {sub}
        </Text>
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
          onPress={() => onAccept(item.uid)}
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
          onPress={() => onSend(item.uid)}
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
  );
}

export function FriendInviteScreen(props: { onDone: () => void }) {
  const appTheme = useAppTheme();
  const styles = useMemo(() => createFriendInviteStyles(appTheme), [appTheme]);
  const currentUid = auth.currentUser?.uid;
  const [permission, setPermission] = useState<Contacts.PermissionStatus | null>(null);
  const [contactLoading, setContactLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchRows, setSearchRows] = useState<Row[]>([]);
  const [searchHint, setSearchHint] = useState<string | null>(null);
  const [contactPromptBusy, setContactPromptBusy] = useState(false);

  const title = useMemo(() => 'Arkadaş ekle', []);

  function patchUidStatus(uid: string, status: FriendDiscoveryRowStatus) {
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, status } : r)));
    setSearchRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, status } : r)));
  }

  const loadContactMatches = useCallback(async () => {
    if (!currentUid) return;
    setContactLoading(true);
    setError(null);
    try {
      const nums = await getDevicePhoneNumbersE164();
      const matched = await matchUsersByPhoneNumbers(nums);
      const enriched = await enrichHitsWithFriendStatus(matched, currentUid);
      setRows(enriched);
    } catch (e: any) {
      setError(
        isFirestorePermissionDenied(e)
          ? firestorePermissionUserMessage()
          : e?.message || 'Rehber eşleştirme başarısız.'
      );
      setRows([]);
    } finally {
      setContactLoading(false);
    }
  }, [currentUid]);

  /** Sistem diyaloğu yalnızca kullanıcı «Rehberden eşleştir» dediğinde */
  async function requestContactsAndMatch() {
    setContactPromptBusy(true);
    setError(null);
    try {
      await Contacts.requestPermissionsAsync();
      const perm = await Contacts.getPermissionsAsync();
      setPermission(perm.status);
      if (perm.status === 'granted') {
        await loadContactMatches();
      }
    } catch (e: any) {
      setError(e?.message || 'Rehber izni alınamadı.');
    } finally {
      setContactPromptBusy(false);
    }
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const perm = await Contacts.getPermissionsAsync();
        if (!alive) return;
        setPermission(perm.status);
        if (perm.status === 'granted' && currentUid) {
          await loadContactMatches();
        }
      } catch {
        if (alive) setPermission(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [currentUid, loadContactMatches]);

  async function runSearch() {
    if (!currentUid) return;
    const q = searchQuery.trim();
    setSearchHint(null);
    if (!q) {
      setSearchRows([]);
      setSearchHint('E-posta, telefon veya en az 2 harf yaz.');
      return;
    }
    setSearchLoading(true);
    try {
      let hits: UserSearchHit[] = [];
      let hintWhenNoRows: string | null = null;

      if (q.includes('@')) {
        const one = await searchUserByEmail(q);
        hits = one ? [one] : [];
        if (!hits.length) hintWhenNoRows = 'Bu e-posta ile kayıtlı kullanıcı bulunamadı.';
      } else {
        const byPhone = await searchUserByPhoneQuery(q);
        if (byPhone) {
          hits = [byPhone];
        } else if (q.length < 2) {
          setSearchHint('İsim için en az 2 harf gir; veya tam telefon (örn. 05xx… / +905xx…).');
          setSearchRows([]);
          return;
        } else {
          hits = await searchUsersByDisplayNamePrefix(q, 20);
          if (!hits.length) {
            hintWhenNoRows =
              'Sonuç yok. Karşı tarafın Profil’de adı veya bu uygulamadaki telefon numarası kayıtlı olmalı. E-posta veya tam numara ile de dene.';
          }
        }
      }

      const enriched = await enrichHitsWithFriendStatus(hits, currentUid);
      setSearchRows(enriched);

      if (enriched.length === 0 && hits.length > 0) {
        setSearchHint('Arama yalnızca kendi hesabını gösteriyor; başka kullanıcı listelenmez.');
      } else if (enriched.length === 0 && hintWhenNoRows) {
        setSearchHint(hintWhenNoRows);
      }
    } catch (e: any) {
      setSearchRows([]);
      setSearchHint(
        isFirestorePermissionDenied(e) ? firestorePermissionUserMessage() : e?.message || 'Arama başarısız.'
      );
    } finally {
      setSearchLoading(false);
    }
  }

  async function sendRequest(uid: string) {
    if (!currentUid) return;
    setBusyUid(uid);
    setError(null);
    try {
      await sendFriendRequest({ fromUid: currentUid, toUid: uid });
      patchUidStatus(uid, 'pending_out');
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
      patchUidStatus(uid, 'friend');
    } catch (e: any) {
      setError(
        isFirestorePermissionDenied(e) ? firestorePermissionUserMessage() : e?.message || 'Onaylanamadı.'
      );
    } finally {
      setBusyUid(null);
    }
  }

  const listHeader = (
    <View>
      <View style={styles.searchCard}>
        <Text style={styles.searchTitle}>E-posta veya ad ile bul</Text>
        <Text style={styles.searchSub}>
          Tam e-posta veya profilde kayıtlı adın ilk harfleriyle ara. Rehber izni gerekmez.
        </Text>
        <TextField
          label="Ara"
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="e-posta, telefon veya ad"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={{ height: appTheme.space.sm }} />
        <PrimaryButton
          title={searchLoading ? 'Aranıyor…' : 'Ara'}
          onPress={() => void runSearch()}
          disabled={searchLoading}
        />
        {searchHint ? <Text style={styles.searchHint}>{searchHint}</Text> : null}
        {searchRows.length > 0 ? (
          <View style={styles.searchResults}>
            <Text style={styles.searchResultsTitle}>Arama sonuçları</Text>
            {searchRows.map((item) => (
              <View key={item.uid}>
                <InviteUserRow
                  item={item}
                  busyUid={busyUid}
                  styles={styles}
                  onSend={sendRequest}
                  onAccept={acceptIncoming}
                />
                <View style={styles.sep} />
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {permission !== 'granted' ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Rehberden eşleştir (isteğe bağlı)</Text>
          <Text style={styles.cardSub}>
            Rehberindeki telefon numaralarıyla RouteWise kullanıcılarını bulmak için aşağıya bas; sistem o anda bir
            kez izin sorar. İstemezsen yalnızca yukarıdan e-posta veya ad ile ekleyebilirsin.
          </Text>
          <View style={{ height: appTheme.space.md }} />
          <PrimaryButton
            title={contactPromptBusy ? 'İzin isteniyor…' : 'Rehberden eşleştir'}
            onPress={() => void requestContactsAndMatch()}
            loading={contactPromptBusy}
            disabled={contactPromptBusy}
          />
        </View>
      ) : (
        <Text style={styles.sectionLabel}>Rehberinden eşleşenler</Text>
      )}
    </View>
  );

  const listEmpty =
    permission === 'granted' ? (
      contactLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Eşleştiriliyor…</Text>
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Rehberde eşleşen yok</Text>
          <Text style={styles.emptySub}>
            Numaraların arkadaşının Profil’de kayıtlı telefonla aynı (E.164, örn. +905xx…) olmalı. Yukarıdan e-posta
            veya ad ile de arayabilirsin.
          </Text>
        </View>
      )
    ) : (
      <View style={styles.emptyMuted}>
        <Text style={styles.emptyMutedText}>
          Rehber listesini görmek için yukarıdaki «Rehberden eşleştir» ile izin ver.
        </Text>
      </View>
    );

  return (
    <Screen>
      <View style={styles.root}>
        <Pressable onPress={props.onDone} style={styles.backRow} accessibilityRole="button" accessibilityLabel="Geri">
          <Text style={styles.backText}>← Geri</Text>
        </Pressable>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.sub}>E-posta veya ad ile ara; istersen bir kez rehber izniyle numaradan eşleştir.</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.listCard}>
          <FlatList
            data={permission === 'granted' ? rows : []}
            keyExtractor={(i) => i.uid}
            ListHeaderComponent={listHeader}
            renderItem={({ item }) => (
              <InviteUserRow
                item={item}
                busyUid={busyUid}
                styles={styles}
                onSend={sendRequest}
                onAccept={acceptIncoming}
              />
            )}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            ListEmptyComponent={listEmpty}
            contentContainerStyle={
              permission !== 'granted' && rows.length === 0 && !contactLoading
                ? { flexGrow: 1, paddingBottom: appTheme.space.lg }
                : { paddingBottom: appTheme.space.lg }
            }
            keyboardShouldPersistTaps="handled"
          />
        </View>

        <View style={styles.bottom}>
          {permission === 'granted' ? (
            <Text onPress={() => void loadContactMatches()} style={styles.refresh}>
              Rehber eşleşmesini yenile
            </Text>
          ) : null}
          <View style={{ height: appTheme.space.sm }} />
          <Text onPress={props.onDone} style={styles.skip}>
            Kapat
          </Text>
        </View>
      </View>
    </Screen>
  );
}

function createFriendInviteStyles(t: AppTheme) {
  return StyleSheet.create({
    root: { flex: 1, width: '100%', maxWidth: '100%', alignSelf: 'stretch' },
    backRow: { alignSelf: 'flex-start', paddingVertical: 4, paddingRight: 8, marginBottom: t.space.sm },
    backText: { color: t.color.primary, fontSize: t.font.body, fontWeight: '700' },
    header: { gap: 6, marginBottom: t.space.md },
    title: { color: t.color.text, fontSize: t.font.h2, fontWeight: '900' },
    sub: { color: t.color.muted, fontSize: t.font.body, lineHeight: 22 },
    error: { color: t.color.danger, fontSize: t.font.small, fontWeight: '700', marginBottom: t.space.sm },
    searchCard: {
      marginBottom: t.space.md,
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.lg,
      borderWidth: 1,
      borderColor: t.color.border,
      maxWidth: '100%',
      alignSelf: 'stretch',
    },
    searchTitle: { color: t.color.text, fontSize: t.font.body, fontWeight: '800', marginBottom: 6 },
    searchSub: { color: t.color.muted, fontSize: t.font.small, lineHeight: 20, marginBottom: t.space.sm },
    searchHint: { color: t.color.muted, fontSize: t.font.tiny, marginTop: t.space.sm, lineHeight: 18 },
    searchResults: { marginTop: t.space.md },
    searchResultsTitle: {
      color: t.color.textSecondary,
      fontSize: t.font.tiny,
      fontWeight: '800',
      marginBottom: t.space.sm,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    sectionLabel: {
      color: t.color.textSecondary,
      fontSize: t.font.small,
      fontWeight: '800',
      marginBottom: t.space.sm,
      marginTop: t.space.xs,
    },
    card: {
      marginBottom: t.space.md,
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
      minHeight: 120,
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
    emptyMuted: { paddingVertical: t.space.md, paddingHorizontal: t.space.sm },
    emptyMutedText: { color: t.color.muted, fontSize: t.font.small, lineHeight: 20, textAlign: 'center' },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 12,
      width: '100%',
      maxWidth: '100%',
      alignSelf: 'stretch',
    },
    rowMain: {
      flex: 1,
      flexBasis: 0,
      flexGrow: 1,
      minWidth: 0,
      maxWidth: '100%',
    },
    avatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: t.color.primarySoft,
      borderWidth: 1,
      borderColor: t.color.border,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      flexGrow: 0,
    },
    avatarText: { color: t.color.text, fontWeight: '900' },
    name: { color: t.color.text, fontSize: t.font.body, fontWeight: '800', flexShrink: 1, maxWidth: '100%' },
    phone: {
      color: t.color.muted,
      fontSize: t.font.small,
      marginTop: 2,
      flexShrink: 1,
      maxWidth: '100%',
      lineHeight: Platform.OS === 'android' ? 20 : undefined,
    },
    addBtn: {
      backgroundColor: t.color.primarySoft,
      borderWidth: 1,
      borderColor: t.color.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: t.radius.pill,
      flexShrink: 0,
      flexGrow: 0,
    },
    addBtnText: { color: t.color.text, fontWeight: '800', fontSize: t.font.small },
    acceptBtn: {
      backgroundColor: t.color.primary,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: t.radius.pill,
      flexShrink: 0,
      flexGrow: 0,
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
      flexShrink: 0,
      flexGrow: 0,
    },
    pendingText: { color: t.color.muted, fontWeight: '800', fontSize: t.font.small },
    sep: { height: 1, backgroundColor: t.color.subtle, marginLeft: 14 },
    bottom: { paddingTop: t.space.md },
    refresh: { color: t.color.muted, fontSize: t.font.small, textAlign: 'center', textDecorationLine: 'underline' },
  });
}
