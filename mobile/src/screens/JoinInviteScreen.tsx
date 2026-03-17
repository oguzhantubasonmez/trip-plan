import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { auth } from '../lib/firebase';
import { addAttendeeToTrip, getTrip } from '../services/trips';
import type { Trip } from '../types/trip';
import { theme } from '../theme';

export function JoinInviteScreen(props: {
  tripId: string;
  onJoined: (tripId: string) => void;
  onDecline: () => void;
}) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    let alive = true;
    getTrip(props.tripId).then((t) => {
      if (alive) setTrip(t ?? null);
    }).catch(() => {
      if (alive) setError('Rota bulunamadı.');
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, [props.tripId]);

  const handleJoin = useCallback(async () => {
    if (!uid || !trip) return;
    setJoining(true);
    setError(null);
    try {
      await addAttendeeToTrip(props.tripId, uid, 'viewer');
      props.onJoined(props.tripId);
    } catch (e: any) {
      setError(e?.message || 'Katılım eklenemedi.');
    } finally {
      setJoining(false);
    }
  }, [uid, trip, props]);

  if (loading) {
    return (
      <Screen>
        <View style={styles.centered}>
          <ActivityIndicator />
          <Text style={styles.muted}>Yükleniyor...</Text>
        </View>
      </Screen>
    );
  }

  if (error && !trip) {
    return (
      <Screen>
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
          <View style={{ height: theme.space.md }} />
          <PrimaryButton title="Tamam" onPress={props.onDecline} />
        </View>
      </Screen>
    );
  }

  if (!trip) {
    return (
      <Screen>
        <View style={styles.centered}>
          <PrimaryButton title="Geri" onPress={props.onDecline} />
        </View>
      </Screen>
    );
  }

  const alreadyInTrip = trip.attendees.some((a) => a.uid === uid);

  return (
    <Screen>
      <View style={styles.centered}>
        <Text style={styles.title}>Davet</Text>
        <Text style={styles.message}>
          "{trip.title}" rotasına katılmak ister misin?
        </Text>
        {error ? <Text style={styles.errorLine}>{error}</Text> : null}
        <View style={styles.buttons}>
          {alreadyInTrip ? (
            <PrimaryButton
              title="Rotaya git"
              onPress={() => props.onJoined(props.tripId)}
            />
          ) : (
            <>
              <PrimaryButton
                title="Katılıyorum"
                onPress={handleJoin}
                loading={joining}
                disabled={joining}
              />
              <View style={{ height: theme.space.sm }} />
              <Pressable onPress={props.onDecline} style={styles.declineBtn}>
                <Text style={styles.declineBtnText}>Hayır, teşekkürler</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space.xl,
  },
  title: { color: theme.color.text, fontSize: theme.font.h1, fontWeight: '800', marginBottom: theme.space.md },
  message: { color: theme.color.text, fontSize: theme.font.body, textAlign: 'center', marginBottom: theme.space.lg },
  errorLine: { color: theme.color.danger, fontSize: theme.font.small, marginBottom: theme.space.sm },
  buttons: { width: '100%', maxWidth: 280 },
  declineBtn: { paddingVertical: 12, alignItems: 'center' },
  declineBtnText: { color: theme.color.muted, fontSize: theme.font.body },
  muted: { color: theme.color.muted, fontSize: theme.font.small, marginTop: theme.space.sm },
  error: { color: theme.color.danger, fontSize: theme.font.body, fontWeight: '700', textAlign: 'center' },
});
