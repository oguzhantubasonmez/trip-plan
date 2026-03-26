import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchCurrentWeather, type CurrentWeatherSnapshot } from '../services/weather';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';

type Phase = 'loading' | 'need_permission' | 'ready' | 'error' | 'unavailable';

export function HomeWeatherCard() {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [phase, setPhase] = useState<Phase>('loading');
  const [data, setData] = useState<CurrentWeatherSnapshot | null>(null);

  const load = useCallback(async () => {
    setPhase('loading');
    try {
      const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPhase(canAskAgain === false ? 'unavailable' : 'need_permission');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const w = await fetchCurrentWeather(pos.coords.latitude, pos.coords.longitude);
      if (w) {
        setData(w);
        setPhase('ready');
      } else {
        setPhase('error');
      }
    } catch {
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (phase === 'loading') {
    return (
      <View style={[styles.card, styles.cardMuted]}>
        <ActivityIndicator size="small" color={theme.color.primary} />
        <Text style={styles.muted}>Hava durumu yükleniyor…</Text>
      </View>
    );
  }

  if (phase === 'need_permission') {
    return (
      <View style={[styles.card, styles.cardMuted]}>
        <Text style={styles.title}>🌤️ Hava durumu</Text>
        <Text style={styles.muted}>
          Bulunduğun yer için anlık hava göstermek üzere konum izni gerekir.
        </Text>
        <Pressable
          onPress={() => void load()}
          style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.88 }]}
        >
          <Text style={styles.linkText}>İzin iste</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === 'unavailable') {
    return (
      <View style={[styles.card, styles.cardMuted]}>
        <Text style={styles.title}>🌤️ Hava durumu</Text>
        <Text style={styles.muted}>
          Konum kapalı. Cihaz ayarlarından uygulamaya konum erişimi verebilirsin.
        </Text>
        {Platform.OS !== 'web' ? (
          <Pressable
            onPress={() => void Linking.openSettings()}
            style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.88 }]}
          >
            <Text style={styles.linkText}>Ayarları aç</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (phase === 'error' || !data) {
    return (
      <View style={[styles.card, styles.cardMuted]}>
        <Text style={styles.muted}>Hava verisi alınamadı. Ağı kontrol edip tekrar dene.</Text>
      </View>
    );
  }

  const temp = Math.round(data.temperatureC);
  const wind =
    data.windKmh != null && data.windKmh > 0 ? ` · Rüzgâr ~${Math.round(data.windKmh)} km/s` : '';

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.emoji}>{data.emoji}</Text>
        <View style={styles.body}>
          <Text style={styles.mainLine}>
            Şu an <Text style={styles.temp}>{temp}°C</Text>
            {' · '}
            {data.labelTr}
            {wind}
          </Text>
          <Text style={styles.source}>Kaynak: Open-Meteo </Text>
        </View>
      </View>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.xl,
      padding: theme.space.md,
      borderWidth: 1,
      borderColor: theme.color.cardBorderPrimary,
      marginBottom: theme.space.md,
      ...theme.shadowCard,
    },
    cardMuted: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space.sm,
      flexWrap: 'wrap',
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md },
    emoji: { fontSize: 36 },
    body: { flex: 1, minWidth: 0 },
    title: { color: theme.color.text, fontSize: theme.font.small, fontWeight: '800', marginBottom: 4 },
    mainLine: {
      color: theme.color.text,
      fontSize: theme.font.small,
      fontWeight: '700',
      lineHeight: 22,
    },
    temp: { fontWeight: '900', fontSize: theme.font.body },
    source: { color: theme.color.muted, fontSize: theme.font.tiny, marginTop: 6 },
    muted: { color: theme.color.muted, fontSize: theme.font.small, lineHeight: 20, flex: 1 },
    linkBtn: { marginTop: theme.space.sm, alignSelf: 'flex-start' },
    linkText: { color: theme.color.primaryDark, fontSize: theme.font.small, fontWeight: '800' },
  });
}
