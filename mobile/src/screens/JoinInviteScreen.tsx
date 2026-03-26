import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { auth } from '../lib/firebase';
import { addAttendeeToTrip, getTrip } from '../services/trips';
import type { Trip } from '../types/trip';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';

export function JoinInviteScreen(props: {
  tripId: string;
  onJoined: (tripId: string) => void;
  onDecline: () => void;
}) {
  const appTheme = useAppTheme();
  const styles = useMemo(() => createJoinInviteStyles(appTheme), [appTheme]);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = auth.currentUser?.uid;

  /** Boş id ile bu ekran hiç görünmesin (stack sırası / eski state); doğrudan ana ekrana. */
  useLayoutEffect(() => {
    const tid = String(props.tripId ?? '').trim();
    if (!tid) {
      props.onDecline();
    }
  }, [props.tripId]);

  useEffect(() => {
    let alive = true;
    const tid = String(props.tripId ?? '').trim();
    if (!tid) {
      return () => {
        alive = false;
      };
    }
    setError(null);
    getTrip(tid)
      .then((t) => {
        if (!alive) return;
        if (!t) setError('Rota bulunamadı veya erişim yok.');
        else setTrip(t);
      })
      .catch(() => {
        if (alive) setError('Rota bulunamadı veya erişim yok.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [props.tripId]);

  const handleJoin = useCallback(async () => {
    if (!uid || !trip) return;
    setJoining(true);
    setError(null);
    try {
      await addAttendeeToTrip(props.tripId, uid, 'viewer', uid);
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
          <ActivityIndicator color={appTheme.color.primary} />
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
          <View style={{ height: appTheme.space.md }} />
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
        <Text style={styles.message}>"{trip.title}" rotasına katılmak ister misin?</Text>
        {error ? <Text style={styles.errorLine}>{error}</Text> : null}
        <View style={styles.buttons}>
          {alreadyInTrip ? (
            <PrimaryButton title="Rotaya git" onPress={() => props.onJoined(props.tripId)} />
          ) : (
            <>
              <PrimaryButton
                title="Katılıyorum"
                onPress={handleJoin}
                loading={joining}
                disabled={joining}
              />
              <View style={{ height: appTheme.space.sm }} />
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

function createJoinInviteStyles(t: AppTheme) {
  return StyleSheet.create({
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: t.space.xl,
    },
    title: { color: t.color.text, fontSize: t.font.h1, fontWeight: '800', marginBottom: t.space.md },
    message: { color: t.color.text, fontSize: t.font.body, textAlign: 'center', marginBottom: t.space.lg },
    errorLine: { color: t.color.danger, fontSize: t.font.small, marginBottom: t.space.sm },
    buttons: { width: '100%', maxWidth: 280 },
    declineBtn: { paddingVertical: 12, alignItems: 'center' },
    declineBtnText: { color: t.color.muted, fontSize: t.font.body },
    muted: { color: t.color.muted, fontSize: t.font.small, marginTop: t.space.sm },
    error: { color: t.color.danger, fontSize: t.font.body, fontWeight: '700', textAlign: 'center' },
  });
}
