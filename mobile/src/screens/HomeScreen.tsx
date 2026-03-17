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
import { getTripsForUser } from '../services/trips';
import type { Trip } from '../types/trip';
import { theme } from '../theme';

function formatDate(s: string) {
  try {
    return new Date(s).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return s;
  }
}

export function HomeScreen(props: {
  onCreateTrip: () => void;
  onOpenTrip: (tripId: string) => void;
  onOpenProfile: () => void;
  onOpenGroups: () => void;
}) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const uid = auth.currentUser?.uid;

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const list = await getTripsForUser(uid);
      setTrips(list);
    } catch (_) {
      setTrips([]);
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
      <View style={styles.header}>
        <Text style={styles.title}>Rota Planlama</Text>
        <Text style={styles.sub}>Rotlarını yönet, duraklar ekle, arkadaşlarınla paylaş.</Text>
      </View>

      <View style={styles.actions}>
        <PrimaryButton title="+ Yeni rota" onPress={props.onCreateTrip} />
        <View style={{ height: theme.space.xs }} />
        <Pressable onPress={props.onOpenGroups} style={styles.profileBtn}>
          <Text style={styles.profileBtnText}>Arkadaş grupları</Text>
        </Pressable>
        <View style={{ height: theme.space.xs }} />
        <Pressable onPress={props.onOpenProfile} style={styles.profileBtn}>
          <Text style={styles.profileBtnText}>Profil (araç tüketimi)</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator />
          <Text style={styles.muted}>Rotalar yükleniyor...</Text>
        </View>
      ) : trips.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Henüz rota yok</Text>
          <Text style={styles.cardSub}>
            "Yeni rota" ile ilk rotanı oluştur. Sonra duraklar ekleyip arkadaşlarını davet edebilirsin.
          </Text>
        </View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(item) => item.tripId}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => props.onOpenTrip(item.tripId)}
              style={({ pressed }) => [styles.tripCard, pressed && styles.pressed]}
            >
              <Text style={styles.tripTitle}>{item.title}</Text>
              <Text style={styles.tripDates}>
                {formatDate(item.startDate)} – {formatDate(item.endDate)}
              </Text>
              {item.totalDistance != null && item.totalDistance > 0 && (
                <Text style={styles.tripMeta}>{item.totalDistance} km</Text>
              )}
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={{ height: theme.space.sm }} />}
        />
      )}

      <View style={styles.footer}>
        <PrimaryButton title="Çıkış yap" onPress={() => auth.signOut()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 6, marginBottom: theme.space.lg },
  title: { color: theme.color.text, fontSize: theme.font.h1, fontWeight: '900' },
  sub: { color: theme.color.muted, fontSize: theme.font.body, lineHeight: 22 },
  actions: { marginBottom: theme.space.lg },
  profileBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  profileBtnText: { color: theme.color.text, fontSize: theme.font.body, fontWeight: '700' },
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
  tripCard: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.space.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  pressed: { opacity: 0.9 },
  tripTitle: { color: theme.color.text, fontSize: theme.font.h2, fontWeight: '800' },
  tripDates: { color: theme.color.muted, fontSize: theme.font.body, marginTop: 4 },
  tripMeta: { color: theme.color.muted, fontSize: theme.font.small, marginTop: 2 },
  footer: { marginTop: 'auto', paddingTop: theme.space.lg },
});
