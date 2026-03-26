import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  formatInboxBellPanelSummary,
  inboxBellBadgeCount,
  markDiscoverPollInviteRead,
  markFriendsHubVisited,
  markGroupNotificationRead,
  markTripCommentsRead,
  markTripMembershipNotificationRead,
  type InboxSummary,
} from '../services/activityInbox';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';

type Props = {
  uid: string;
  inbox: InboxSummary | null;
  onReload: () => void;
  /** Zil açılırken — ana sayfa `load()` tetiklemeden gelen kutuyu güncelle */
  onRefreshInbox?: () => void;
  onOpenTrip: (tripId: string) => void;
  onOpenFriends: () => void;
  onOpenGroup: (groupId: string) => void;
  /** Keşfet anket daveti — zil satırından */
  onOpenDiscover?: (opts: { pollId: string }) => void;
};

function friendsRowSubtitle(s: InboxSummary): string {
  if (s.newFriendRequestCount > 0) {
    return s.newFriendRequestCount === 1 ? '1 yeni istek' : `${s.newFriendRequestCount} yeni istek`;
  }
  if (s.pendingFriendTotal > 0) {
    return s.pendingFriendTotal === 1
      ? '1 bekleyen istek'
      : `${s.pendingFriendTotal} bekleyen istek`;
  }
  return 'Arkadaşlar ve gruplar';
}

export function InboxBellMenu(props: Props) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { height: winH, width: winW } = useWindowDimensions();
  const panelW = Math.min(300, winW - 32);
  const [open, setOpen] = useState(false);

  const badge = props.inbox ? inboxBellBadgeCount(props.inbox) : 0;
  const tripsUnread = props.inbox?.tripsWithUnread?.length ?? 0;
  const pendingFriends = props.inbox?.pendingFriendTotal ?? 0;
  const groupNotifs = props.inbox?.groupNotifications ?? [];
  const pollInvites = props.inbox?.discoverPollInvites ?? [];
  const tripMembershipNotifs = props.inbox?.tripMembershipNotifications ?? [];
  const hasList = Boolean(
    props.inbox &&
      (pendingFriends > 0 ||
        tripsUnread > 0 ||
        groupNotifs.length > 0 ||
        pollInvites.length > 0 ||
        tripMembershipNotifs.length > 0)
  );
  const summaryLine = props.inbox ? formatInboxBellPanelSummary(props.inbox) : '';

  async function handleFriends() {
    if (!props.uid) return;
    try {
      await markFriendsHubVisited(props.uid);
    } catch {
      /* ağ */
    }
    props.onReload();
    setOpen(false);
    props.onOpenFriends();
  }

  async function handleTrip(tripId: string) {
    if (!props.uid) return;
    try {
      await markTripCommentsRead(props.uid, tripId);
    } catch {
      /* ağ */
    }
    props.onReload();
    setOpen(false);
    props.onOpenTrip(tripId);
  }

  async function handleGroupNotif(notifId: string, groupId: string) {
    if (!props.uid) return;
    try {
      await markGroupNotificationRead(notifId);
    } catch {
      /* ağ */
    }
    props.onReload();
    setOpen(false);
    props.onOpenGroup(groupId);
  }

  async function handlePollInvite(notifId: string, pollId: string) {
    if (!props.uid) return;
    try {
      await markDiscoverPollInviteRead(notifId);
    } catch {
      /* ağ */
    }
    props.onReload();
    setOpen(false);
    props.onOpenDiscover?.({ pollId });
  }

  async function handleTripMembershipNotif(notifId: string, tripId: string) {
    if (!props.uid) return;
    try {
      await markTripMembershipNotificationRead(notifId);
    } catch {
      /* ağ */
    }
    props.onReload();
    setOpen(false);
    props.onOpenTrip(tripId);
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => {
          setOpen(true);
          props.onRefreshInbox?.();
        }}
        style={({ pressed }) => [styles.bellBtn, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel="Bildirimler"
      >
        <Ionicons
          name={badge > 0 ? 'notifications' : 'notifications-outline'}
          size={26}
          color={badge > 0 ? theme.color.primaryDark : theme.color.textSecondary}
        />
        {badge > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        ) : null}
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[
              styles.panel,
              {
                width: panelW,
                top: insets.top + theme.space.sm,
                maxHeight: Math.min(winH * 0.62, 420),
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Bildirimler</Text>
              <Pressable
                onPress={() => setOpen(false)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Kapat"
              >
                <Ionicons name="close" size={24} color={theme.color.muted} />
              </Pressable>
            </View>
            {summaryLine ? <Text style={styles.panelSummary}>{summaryLine}</Text> : null}
            

            <ScrollView
              style={styles.scroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {!hasList ? (
                <Text style={styles.empty}>Şu an gösterilecek bildirim yok.</Text>
              ) : null}

              {props.inbox && pendingFriends > 0 ? (
                <Pressable
                  onPress={() => void handleFriends()}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                >
                  <View style={styles.rowIcon}>
                    <Ionicons name="people" size={20} color={theme.color.primaryDark} />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>Arkadaşlık istekleri</Text>
                    <Text style={styles.rowSub}>{friendsRowSubtitle(props.inbox)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.color.muted} />
                </Pressable>
              ) : null}

              {pollInvites.map((n) => (
                <Pressable
                  key={n.id}
                  onPress={() => void handlePollInvite(n.id, n.pollId)}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                >
                  <View style={styles.rowIcon}>
                    <Ionicons name="bar-chart-outline" size={20} color={theme.color.primaryDark} />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      Anket daveti
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={3}>
                      {n.preview}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.color.muted} />
                </Pressable>
              ))}

              {groupNotifs.map((n) => (
                <Pressable
                  key={n.id}
                  onPress={() => void handleGroupNotif(n.id, n.groupId)}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                >
                  <View style={styles.rowIcon}>
                    <Ionicons name="layers-outline" size={20} color={theme.color.primaryDark} />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      Grup bildirimi
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={3}>
                      {n.preview}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.color.muted} />
                </Pressable>
              ))}

              {tripMembershipNotifs.map((n) => (
                <Pressable
                  key={n.id}
                  onPress={() => void handleTripMembershipNotif(n.id, n.tripId)}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                >
                  <View style={styles.rowIcon}>
                    <Ionicons name="map-outline" size={20} color={theme.color.primaryDark} />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      Rota
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={3}>
                      {n.preview}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.color.muted} />
                </Pressable>
              ))}

              {props.inbox?.tripsWithUnread.map((row) => (
                <Pressable
                  key={row.tripId}
                  onPress={() => void handleTrip(row.tripId)}
                  accessibilityRole="button"
                  accessibilityLabel={`${row.title}, ${
                    row.count === 1 ? '1 yeni yorum' : `${row.count} yeni yorum`
                  }`}
                  style={({ pressed }) => [styles.tripCommentRow, pressed && styles.rowPressed]}
                >
                  <View style={styles.rowIcon}>
                    <Ionicons name="chatbubble-ellipses" size={20} color={theme.color.primaryDark} />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {row.title}
                    </Text>
                    <View style={styles.commentPillWrap}>
                      <View style={styles.commentPill}>
                        <Text style={styles.commentPillText}>
                          {row.count === 1 ? '1 yeni yorum' : `${row.count} yeni yorum`}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.color.muted} />
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    wrap: { position: 'relative' },
    bellBtn: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badge: {
      position: 'absolute',
      top: 2,
      right: 2,
      minWidth: 18,
      height: 18,
      paddingHorizontal: 5,
      borderRadius: 9,
      backgroundColor: theme.color.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
    modalBackdrop: {
      flex: 1,
      backgroundColor: theme.color.overlayDark,
    },
    panel: {
      position: 'absolute',
      right: theme.space.md,
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.xl,
      borderWidth: 1,
      borderColor: theme.color.cardBorderPrimary,
      padding: theme.space.md,
      ...theme.shadowCard,
    },
    panelHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: theme.space.xs,
    },
    panelTitle: { color: theme.color.text, fontSize: theme.font.body, fontWeight: '900' },
    panelSummary: {
      color: theme.color.textSecondary,
      fontSize: theme.font.small,
      fontWeight: '700',
      lineHeight: 20,
      marginBottom: theme.space.xs,
    },
    panelHint: {
      color: theme.color.muted,
      fontSize: theme.font.tiny,
      marginBottom: theme.space.sm,
    },
    scroll: { maxHeight: 320 },
    empty: {
      color: theme.color.muted,
      fontSize: theme.font.small,
      paddingVertical: theme.space.md,
      textAlign: 'center',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space.sm,
      paddingVertical: 10,
      paddingHorizontal: theme.space.sm,
      borderRadius: theme.radius.md,
      backgroundColor: theme.color.inputBg,
      borderWidth: 1,
      borderColor: theme.color.border,
      marginBottom: 8,
    },
    tripCommentRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: theme.space.sm,
      paddingVertical: 12,
      paddingHorizontal: theme.space.sm,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.color.inputBg,
      borderWidth: 1,
      borderColor: theme.color.border,
      marginBottom: 8,
    },
    rowPressed: { opacity: 0.92 },
    rowIcon: { width: 36, alignItems: 'center', paddingTop: 2 },
    rowBody: { flex: 1, minWidth: 0 },
    rowTitle: { color: theme.color.text, fontSize: theme.font.small, fontWeight: '800' },
    rowSub: { color: theme.color.muted, fontSize: theme.font.tiny, marginTop: 2 },
    commentPillWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: 6,
      alignSelf: 'flex-start',
    },
    commentPill: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.primary,
      maxWidth: '100%',
    },
    commentPillText: { color: '#fff', fontSize: theme.font.tiny, fontWeight: '800' },
  });
}
