import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AddPlaceModal } from '../components/AddPlaceModal';
import { Screen } from '../components/Screen';
import { fetchDailyForecastDays, type DayWeatherSnapshot } from '../services/weather';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';
import { formatTripDayTr } from '../utils/tripSchedule';

export function WeatherForecastScreen(props: {
  initialLatitude?: number;
  initialLongitude?: number;
  initialLabel?: string;
  onBack: () => void;
}) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [locationLabel, setLocationLabel] = useState('Konumun');
  const [forecast, setForecast] = useState<DayWeatherSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [placeOpen, setPlaceOpen] = useState(false);

  const loadCoords = useCallback(
    async (la: number, lo: number, label: string) => {
      setLat(la);
      setLon(lo);
      setLocationLabel(label.trim() || 'Seçilen yer');
      setLoading(true);
      setError(null);
      try {
        const f = await fetchDailyForecastDays(la, lo, 16);
        setForecast(f);
        if (f.length === 0) setError('Bu konum için tahmin alınamadı.');
      } catch {
        setError('Ağ hatası. Tekrar dene.');
        setForecast([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const ilat = props.initialLatitude;
    const ilon = props.initialLongitude;
    if (
      ilat != null &&
      ilon != null &&
      typeof ilat === 'number' &&
      typeof ilon === 'number' &&
      !Number.isNaN(ilat) &&
      !Number.isNaN(ilon)
    ) {
      void loadCoords(ilat, ilon, props.initialLabel ?? 'Seçilen yer');
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
        if (!alive) return;
        if (status !== 'granted') {
          setLoading(false);
          setError(
            canAskAgain === false
              ? 'Konum kapalı. Ayarlardan izin ver veya «Başka yer seç» ile konum seç.'
              : 'Konum izni gerekli veya «Başka yer seç» ile yer arayabilirsin.'
          );
          return;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!alive) return;
        await loadCoords(pos.coords.latitude, pos.coords.longitude, 'Konumun');
      } catch {
        if (alive) {
          setLoading(false);
          setError('Konum alınamadı. «Başka yer seç» ile dene.');
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [props.initialLatitude, props.initialLongitude, props.initialLabel, loadCoords]);

  async function useMyLocationAgain() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Konum izni verilmedi.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      await loadCoords(pos.coords.latitude, pos.coords.longitude, 'Konumun');
    } catch {
      setError('Konum alınamadı.');
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={props.onBack} style={styles.backRow} hitSlop={8}>
          <Text style={styles.backText}>‹ Geri</Text>
        </Pressable>
        <Text style={styles.title}>16 günlük hava</Text>
        <Text style={styles.sub} numberOfLines={2}>
          {locationLabel}
          {lat != null && lon != null
            ? ` · ${lat.toFixed(2)}°, ${lon.toFixed(2)}°`
            : ''}
        </Text>
        <View style={styles.toolbar}>
          <Pressable
            onPress={() => void useMyLocationAgain()}
            style={({ pressed }) => [styles.toolBtn, pressed && { opacity: 0.88 }]}
          >
            <Text style={styles.toolBtnText}>Konumum</Text>
          </Pressable>
          <Pressable
            onPress={() => setPlaceOpen(true)}
            style={({ pressed }) => [styles.toolBtn, styles.toolBtnPrimary, pressed && { opacity: 0.88 }]}
          >
            <Text style={[styles.toolBtnText, styles.toolBtnTextPrimary]}>Başka yer seç</Text>
          </Pressable>
        </View>
      </View>

      {error ? <Text style={styles.errorLine}>{error}</Text> : null}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.color.primary} />
          <Text style={styles.muted}>Tahmin yükleniyor…</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {forecast.map((d) => {
            const day = formatTripDayTr(d.dateYmd) || d.dateYmd;
            const loT = Math.round(d.minC);
            const hiT = Math.round(d.maxC);
            return (
              <View key={d.dateYmd} style={styles.dayRow}>
                <Text style={styles.dayEmoji}>{d.emoji}</Text>
                <View style={styles.dayBody}>
                  <Text style={styles.dayTitle}>{day}</Text>
                  <Text style={styles.dayMeta}>
                    {loT}° / {hiT}° · {d.labelTr}
                  </Text>
                </View>
              </View>
            );
          })}
          <Text style={styles.source}>Kaynak: Open-Meteo (16 güne kadar günlük tahmin)</Text>
        </ScrollView>
      )}

      <AddPlaceModal
        visible={placeOpen}
        onClose={() => setPlaceOpen(false)}
        pickStopDate={false}
        searchMode="geocode"
        onAdd={async (p) => {
          setPlaceOpen(false);
          await loadCoords(p.coords.latitude, p.coords.longitude, p.locationName);
        }}
      />
    </Screen>
  );
}

function createStyles(t: AppTheme) {
  return StyleSheet.create({
    header: { paddingBottom: t.space.sm },
    backRow: { alignSelf: 'flex-start', paddingVertical: 4, marginBottom: t.space.xs },
    backText: { color: t.color.primary, fontSize: t.font.body, fontWeight: '700' },
    title: { color: t.color.text, fontSize: t.font.h1, fontWeight: '900' },
    sub: { color: t.color.muted, fontSize: t.font.small, marginTop: 6, lineHeight: 20 },
    toolbar: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: t.space.sm,
      marginTop: t.space.md,
    },
    toolBtn: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: t.radius.pill,
      borderWidth: 1,
      borderColor: t.color.border,
      backgroundColor: t.color.inputBg,
    },
    toolBtnPrimary: {
      borderColor: t.color.primary,
      backgroundColor: t.color.primarySoft,
    },
    toolBtnText: { color: t.color.text, fontSize: t.font.small, fontWeight: '800' },
    toolBtnTextPrimary: { color: t.color.primaryDark },
    errorLine: {
      color: t.color.danger,
      fontSize: t.font.small,
      fontWeight: '700',
      marginBottom: t.space.sm,
    },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 120 },
    muted: { color: t.color.muted, fontSize: t.font.small, fontWeight: '600' },
    list: { flex: 1, minHeight: 0 },
    listContent: { paddingBottom: t.space.xxl, gap: 0 },
    dayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.md,
      paddingVertical: t.space.sm,
      paddingHorizontal: t.space.sm,
      borderBottomWidth: 1,
      borderBottomColor: t.color.subtle,
    },
    dayEmoji: { fontSize: 28, width: 40, textAlign: 'center' },
    dayBody: { flex: 1, minWidth: 0 },
    dayTitle: { color: t.color.text, fontSize: t.font.body, fontWeight: '800' },
    dayMeta: { color: t.color.textSecondary, fontSize: t.font.small, marginTop: 2, fontWeight: '600' },
    source: {
      color: t.color.muted,
      fontSize: t.font.tiny,
      marginTop: t.space.lg,
      textAlign: 'center',
      lineHeight: 18,
    },
  });
}
