import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from './PrimaryButton';
import { TextField } from './TextField';
import { addComment, getCommentsForStop } from '../services/comments';
import { updateStopCoords, updateStopTimes } from '../services/trips';
import type { Comment } from '../types/comment';
import type { Stop } from '../types/trip';
import type { UserProfile } from '../services/userProfile';
import { theme } from '../theme';

type Props = {
  stop: Stop;
  isAdmin: boolean;
  currentUid: string | undefined;
  userProfiles: Map<string, UserProfile>;
  onToggleStatus: () => void;
  onRefresh: () => void;
  displayName: (uid: string) => string;
};

function formatCommentTime(t: any) {
  if (!t?.toMillis) return '';
  try {
    return new Date(t.toMillis()).toLocaleString('tr-TR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function StopCard(props: Props) {
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [arrivalTime, setArrivalTime] = useState(props.stop.arrivalTime ?? '');
  const [departureTime, setDepartureTime] = useState(props.stop.departureTime ?? '');
  const [latInput, setLatInput] = useState(
    props.stop.coords ? String(props.stop.coords.latitude) : ''
  );
  const [lngInput, setLngInput] = useState(
    props.stop.coords ? String(props.stop.coords.longitude) : ''
  );
  const [savingTime, setSavingTime] = useState(false);
  const [savingCoords, setSavingCoords] = useState(false);

  useEffect(() => {
    setArrivalTime(props.stop.arrivalTime ?? '');
    setDepartureTime(props.stop.departureTime ?? '');
    setLatInput(props.stop.coords ? String(props.stop.coords.latitude) : '');
    setLngInput(props.stop.coords ? String(props.stop.coords.longitude) : '');
  }, [props.stop.arrivalTime, props.stop.departureTime, props.stop.coords]);

  const loadComments = useCallback(async () => {
    const list = await getCommentsForStop(props.stop.stopId);
    setComments(list);
    setCommentsLoaded(true);
  }, [props.stop.stopId]);

  const toggleExpand = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    if (next && !commentsLoaded) loadComments();
  }, [expanded, commentsLoaded, loadComments]);

  async function handleAddComment() {
    const msg = newComment.trim();
    if (!msg || !props.currentUid) return;
    setPostingComment(true);
    try {
      await addComment({ stopId: props.stop.stopId, userId: props.currentUid, message: msg });
      setNewComment('');
      await loadComments();
      props.onRefresh();
    } finally {
      setPostingComment(false);
    }
  }

  async function handleSaveTimes() {
    setSavingTime(true);
    try {
      await updateStopTimes(props.stop.stopId, {
        arrivalTime: arrivalTime.trim() || undefined,
        departureTime: departureTime.trim() || undefined,
      });
      props.onRefresh();
    } finally {
      setSavingTime(false);
    }
  }

  async function handleSaveCoords() {
    const lat = parseFloat(latInput.replace(',', '.'));
    const lng = parseFloat(lngInput.replace(',', '.'));
    if (isNaN(lat) || isNaN(lng)) return;
    setSavingCoords(true);
    try {
      await updateStopCoords(props.stop.stopId, { latitude: lat, longitude: lng });
      props.onRefresh();
    } finally {
      setSavingCoords(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.stopRow}>
        <View style={styles.stopBullet} />
        <View style={{ flex: 1 }}>
          <Text style={styles.stopName}>{props.stop.locationName}</Text>
          <Text style={styles.stopMeta}>
            {props.stop.status === 'pending' ? 'Onay bekliyor' : 'Onaylandı'}
            {(props.stop.arrivalTime || props.stop.departureTime) && (
              <> · {props.stop.arrivalTime || '–'} – {props.stop.departureTime || '–'}</>
            )}
          </Text>
        </View>
        {props.isAdmin && (
          <Pressable
            onPress={props.onToggleStatus}
            style={[
              styles.statusBtn,
              props.stop.status === 'approved' ? styles.statusApproved : null,
            ]}
          >
            <Text style={styles.statusBtnText}>
              {props.stop.status === 'approved' ? 'Onaylı' : 'Onayla'}
            </Text>
          </Pressable>
        )}
      </View>

      <View style={styles.timeRow}>
        <TextField
          label="Giriş saati"
          value={arrivalTime}
          placeholder="09:00"
          onChangeText={setArrivalTime}
        />
        <View style={{ width: theme.space.sm }} />
        <TextField
          label="Çıkış saati"
          value={departureTime}
          placeholder="11:00"
          onChangeText={setDepartureTime}
        />
      </View>
      <Pressable onPress={handleSaveTimes} style={styles.smallBtn}>
        <Text style={styles.smallBtnText}>Saati kaydet</Text>
      </Pressable>
      {savingTime && <Text style={styles.muted}>Kaydediliyor...</Text>}

      <View style={styles.coordRow}>
        <TextField
          label="Enlem"
          value={latInput}
          placeholder="41.0082"
          keyboardType="number-pad"
          onChangeText={setLatInput}
        />
        <View style={{ width: theme.space.sm }} />
        <TextField
          label="Boylam"
          value={lngInput}
          placeholder="28.9784"
          keyboardType="number-pad"
          onChangeText={setLngInput}
        />
      </View>
      <Pressable onPress={handleSaveCoords} style={styles.smallBtn}>
        <Text style={styles.smallBtnText}>Konum kaydet</Text>
      </Pressable>
      {savingCoords && <Text style={styles.muted}>Kaydediliyor...</Text>}

      <Pressable onPress={toggleExpand} style={styles.commentToggle}>
        <Text style={styles.commentToggleText}>
          Yorumlar ({comments.length}) {expanded ? '▼' : '▶'}
        </Text>
      </Pressable>
      {expanded && (
        <View style={styles.commentBox}>
          {comments.map((c) => (
            <View key={c.commentId} style={styles.commentRow}>
              <Text style={styles.commentAuthor}>{props.displayName(c.userId)}</Text>
              <Text style={styles.commentTime}>{formatCommentTime(c.timestamp)}</Text>
              <Text style={styles.commentMessage}>{c.message}</Text>
            </View>
          ))}
          <View style={{ height: theme.space.sm }} />
          <TextField
            label=""
            value={newComment}
            placeholder="Yorum yaz..."
            onChangeText={setNewComment}
          />
          <PrimaryButton
            title="Gönder"
            onPress={handleAddComment}
            loading={postingComment}
            disabled={!newComment.trim()}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    padding: theme.space.sm,
    marginBottom: theme.space.sm,
  },
  stopRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 12 },
  stopBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.color.primary,
  },
  stopName: { color: theme.color.text, fontSize: theme.font.body, fontWeight: '700' },
  stopMeta: { color: theme.color.muted, fontSize: theme.font.small, marginTop: 2 },
  statusBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.inputBg,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  statusApproved: { backgroundColor: theme.color.primarySoft },
  statusBtnText: { color: theme.color.text, fontSize: theme.font.small, fontWeight: '700' },
  timeRow: { flexDirection: 'row', marginTop: theme.space.sm },
  coordRow: { flexDirection: 'row', marginTop: theme.space.sm },
  smallBtn: { alignSelf: 'flex-start', paddingVertical: 6, paddingRight: 8, marginTop: 4 },
  smallBtnText: { color: theme.color.primary, fontSize: theme.font.small, fontWeight: '700' },
  muted: { color: theme.color.muted, fontSize: theme.font.small, marginTop: 4 },
  commentToggle: { marginTop: theme.space.sm, paddingVertical: 6 },
  commentToggleText: { color: theme.color.primary, fontSize: theme.font.small, fontWeight: '700' },
  commentBox: { marginTop: theme.space.xs, paddingTop: theme.space.sm, borderTopWidth: 1, borderTopColor: theme.color.subtle },
  commentRow: { marginBottom: theme.space.sm },
  commentAuthor: { color: theme.color.text, fontSize: theme.font.small, fontWeight: '700' },
  commentTime: { color: theme.color.muted, fontSize: 12, marginTop: 2 },
  commentMessage: { color: theme.color.text, fontSize: theme.font.body, marginTop: 4 },
});
