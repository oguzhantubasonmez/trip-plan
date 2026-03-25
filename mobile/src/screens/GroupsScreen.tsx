import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { auth } from '../lib/firebase';
import { deleteGroup, getGroupsForUser } from '../services/groups';
import type { Group } from '../types/group';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';

const SWIPE_ACTION_WIDTH = 76;

type SwipeRowProps = {
  item: Group;
  appTheme: AppTheme;
  styles: ReturnType<typeof createGroupsStyles>;
  openSwipeId: string | null;
  setOpenSwipeId: (id: string | null) => void;
  onOpenGroup: (groupId: string) => void;
  onDeleted: () => void;
};

function GroupSwipeRow({
  item,
  appTheme,
  styles,
  openSwipeId,
  setOpenSwipeId,
  onOpenGroup,
  onDeleted,
}: SwipeRowProps) {
  const totalActionsWidth = SWIPE_ACTION_WIDTH * 2;
  const translateX = useRef(new Animated.Value(0)).current;
  const startOffset = useRef(0);

  const isOpen = openSwipeId === item.groupId;

  useEffect(() => {
    if (!isOpen) {
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        friction: 9,
      }).start();
    }
  }, [isOpen, translateX]);

  const snapTo = useCallback(
    (to: number) => {
      Animated.spring(translateX, {
        toValue: to,
        useNativeDriver: true,
        friction: 9,
      }).start(() => {
        setOpenSwipeId(to === 0 ? null : item.groupId);
      });
    },
    [item.groupId, setOpenSwipeId, translateX]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.15,
        onPanResponderGrant: () => {
          translateX.stopAnimation((v) => {
            startOffset.current = v;
          });
        },
        onPanResponderMove: (_, g) => {
          const next = Math.min(
            0,
            Math.max(-totalActionsWidth, startOffset.current + g.dx)
          );
          translateX.setValue(next);
        },
        onPanResponderRelease: (_, g) => {
          const end = startOffset.current + g.dx;
          const isTap = Math.abs(g.dx) < 10 && Math.abs(g.dy) < 10;
          if (isTap) {
            if (isOpen) {
              snapTo(0);
              return;
            }
            onOpenGroup(item.groupId);
            return;
          }
          const open = end < -totalActionsWidth / 2 || g.vx < -0.45;
          snapTo(open ? -totalActionsWidth : 0);
        },
      }),
    [isOpen, item.groupId, onOpenGroup, snapTo, totalActionsWidth, translateX]
  );

  function handleEdit() {
    setOpenSwipeId(null);
    onOpenGroup(item.groupId);
  }

  function handleDeletePress() {
    Alert.alert(
      'Grubu sil',
      `"${item.name}" grubunu silmek istediğine emin misin? Bu işlem geri alınamaz.`,
      [
        { text: 'Vazgeç', style: 'cancel', onPress: () => setOpenSwipeId(null) },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: () => {
            setOpenSwipeId(null);
            void (async () => {
              try {
                await deleteGroup(item.groupId);
                onDeleted();
              } catch (e: any) {
                Alert.alert('Silinemedi', e?.message || 'Grup silinemedi.');
              }
            })();
          },
        },
      ]
    );
  }

  return (
    <View style={styles.swipeOuter}>
      <View style={[styles.swipeActions, { width: totalActionsWidth }]}>
        <Pressable
          onPress={handleEdit}
          style={({ pressed }) => [
            styles.swipeActionEdit,
            { width: SWIPE_ACTION_WIDTH },
            pressed && styles.swipeActionPressed,
          ]}
        >
          <Text style={styles.swipeActionEditText}>Düzenle</Text>
        </Pressable>
        <Pressable
          onPress={handleDeletePress}
          style={({ pressed }) => [
            styles.swipeActionDelete,
            { width: SWIPE_ACTION_WIDTH },
            pressed && styles.swipeActionPressed,
          ]}
        >
          <Text style={styles.swipeActionDeleteText}>Sil</Text>
        </Pressable>
      </View>
      <Animated.View
        style={[styles.swipeForeground, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <View style={[styles.groupCard, appTheme.shadowSoft]}>
          <Text style={styles.groupName}>{item.name}</Text>
          <Text style={styles.groupMeta}>
            {item.memberIds.length} {item.memberIds.length === 1 ? 'kişi' : 'kişi'}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

export function GroupsScreen(props: {
  onBack: () => void;
  onCreateGroup: () => void;
  onOpenGroup: (groupId: string) => void;
}) {
  const appTheme = useAppTheme();
  const styles = useMemo(() => createGroupsStyles(appTheme), [appTheme]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const uid = auth.currentUser?.uid;

  const load = useCallback(async () => {
    if (!uid) {
      setLoading(false);
      setGroups([]);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const list = await getGroupsForUser(uid);
      setGroups(list);
    } catch (e: any) {
      const msg =
        e?.code === 'permission-denied'
          ? 'Gruplar yüklenemedi (Firestore izni). Console’daki kuralları kontrol edin.'
          : e?.message || 'Gruplar yüklenemedi.';
      setLoadError(msg);
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
      <View style={{ height: appTheme.space.lg }} />

      {loadError ? (
        <View style={[styles.card, { borderColor: appTheme.color.danger, marginBottom: appTheme.space.md }]}>
          <Text style={[styles.cardTitle, { color: appTheme.color.danger }]}>Yükleme hatası</Text>
          <Text style={styles.cardSub}>{loadError}</Text>
          <View style={{ height: appTheme.space.sm }} />
          <PrimaryButton title="Yeniden dene" onPress={() => void load()} />
        </View>
      ) : null}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={appTheme.color.primary} />
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
          keyExtractor={(g) => g.groupId}
          onScrollBeginDrag={() => setOpenSwipeId(null)}
          renderItem={({ item }) => (
            <GroupSwipeRow
              item={item}
              appTheme={appTheme}
              styles={styles}
              openSwipeId={openSwipeId}
              setOpenSwipeId={setOpenSwipeId}
              onOpenGroup={props.onOpenGroup}
              onDeleted={() => void load()}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: appTheme.space.sm }} />}
        />
      )}
    </Screen>
  );
}

function createGroupsStyles(t: AppTheme) {
  return StyleSheet.create({
    backRow: { alignSelf: 'flex-start', paddingVertical: 4, paddingRight: 8, marginBottom: t.space.sm },
    backText: { color: t.color.primary, fontSize: t.font.body, fontWeight: '700' },
    header: { gap: 6, marginBottom: t.space.lg },
    title: { color: t.color.text, fontSize: t.font.h1, fontWeight: '900' },
    sub: { color: t.color.muted, fontSize: t.font.body, lineHeight: 22 },
    centered: { paddingVertical: t.space.xl, alignItems: 'center', gap: 12 },
    muted: { color: t.color.muted, fontSize: t.font.small },
    card: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.lg,
      borderWidth: 1,
      borderColor: t.color.border,
    },
    cardTitle: { color: t.color.text, fontSize: t.font.body, fontWeight: '800' },
    cardSub: { color: t.color.muted, fontSize: t.font.small, lineHeight: 20, marginTop: 6 },
    swipeOuter: {
      borderRadius: t.radius.lg,
      overflow: 'hidden',
      position: 'relative',
    },
    swipeActions: {
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      flexDirection: 'row',
      alignItems: 'stretch',
    },
    swipeActionEdit: {
      backgroundColor: t.color.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    swipeActionEditText: {
      color: t.color.surface,
      fontSize: t.font.tiny,
      fontWeight: '800',
      textAlign: 'center',
    },
    swipeActionDelete: {
      backgroundColor: t.color.danger,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    swipeActionDeleteText: {
      color: '#FFFFFF',
      fontSize: t.font.tiny,
      fontWeight: '800',
      textAlign: 'center',
    },
    swipeActionPressed: { opacity: 0.88 },
    swipeForeground: {
      backgroundColor: 'transparent',
    },
    groupCard: {
      backgroundColor: t.color.surface,
      borderRadius: t.radius.lg,
      padding: t.space.lg,
      borderWidth: 1,
      borderColor: t.color.border,
    },
    groupName: { color: t.color.text, fontSize: t.font.h2, fontWeight: '800' },
    groupMeta: { color: t.color.muted, fontSize: t.font.small, marginTop: 4 },
  });
}
