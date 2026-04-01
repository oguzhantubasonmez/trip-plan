import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { fetchDrivingRoutePolyline, type LatLng } from '../services/directions';
import type { Stop } from '../types/trip';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';
import { openGoogleMapsDrivingNavigation } from '../utils/openMapsNavigation';

/** Haritada görünen tüm duraklar; navigasyonda yalnızca seçilen günün durakları kullanılır. */
export type MapNavigationDayGroup = {
  dayYmd: string;
  dayLabel: string;
  stops: Stop[];
};

type Props = {
  stops: Stop[];
  /** Konumlu durakları güne göre; birden fazla gün varsa kullanıcı gün seçer (Google Maps’e sadece o gün gider). */
  navigationDayGroups?: MapNavigationDayGroup[];
};

function isValidMapCoord(c: LatLng): boolean {
  const { latitude: lat, longitude: lng } = c;
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** Polyline / fitToCoordinates bazı cihazlarda geçersiz veya tekrarlı noktada siyah ekran yapabiliyor */
function sanitizePolyline(coords: LatLng[]): LatLng[] {
  const out: LatLng[] = [];
  for (const c of coords) {
    if (!isValidMapCoord(c)) continue;
    const prev = out[out.length - 1];
    if (
      prev &&
      Math.abs(prev.latitude - c.latitude) < 1e-7 &&
      Math.abs(prev.longitude - c.longitude) < 1e-7
    ) {
      continue;
    }
    out.push(c);
  }
  return out;
}

export function NativeMapSection(props: Props) {
  const appTheme = useAppTheme();
  const styles = useMemo(() => createMapStyles(appTheme), [appTheme]);
  const mapRef = useRef<MapView>(null);
  const mapReadyRef = useRef(false);
  const [roadCoords, setRoadCoords] = useState<LatLng[] | null>(null);
  const [dayPickerOpen, setDayPickerOpen] = useState(false);

  const withCoords = useMemo(() => {
    const list = props.stops.filter(
      (s) => s.coords?.latitude != null && s.coords?.longitude != null
    );
    return [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [props.stops]);

  const polylineCoords = useMemo(
    () =>
      withCoords.map((s) => ({
        latitude: s.coords!.latitude,
        longitude: s.coords!.longitude,
      })),
    [withCoords]
  );

  const coordsKey = useMemo(
    () => polylineCoords.map((c) => `${c.latitude.toFixed(5)},${c.longitude.toFixed(5)}`).join('|'),
    [polylineCoords]
  );

  useEffect(() => {
    let alive = true;
    if (polylineCoords.length < 2) {
      setRoadCoords(null);
      return () => {
        alive = false;
      };
    }
    setRoadCoords(null);
    void (async () => {
      try {
        const pts = await fetchDrivingRoutePolyline(polylineCoords);
        if (alive && pts && pts.length >= 2) setRoadCoords(pts);
      } catch {
        if (alive) setRoadCoords(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [coordsKey]);

  const rawLineCoords = roadCoords && roadCoords.length >= 2 ? roadCoords : polylineCoords;
  const lineCoords = useMemo(() => sanitizePolyline(rawLineCoords), [rawLineCoords]);

  const fitMap = useCallback(() => {
    if (lineCoords.length === 0 || !mapRef.current) return;
    try {
      mapRef.current.fitToCoordinates(lineCoords, {
        edgePadding: { top: 52, right: 52, bottom: 52, left: 52 },
        animated: true,
      });
    } catch {
      /* bazı Android sürümleri fitToCoordinates fırlatabiliyor */
    }
  }, [lineCoords]);

  const handleMapReady = useCallback(() => {
    mapReadyRef.current = true;
    requestAnimationFrame(() => fitMap());
  }, [fitMap]);

  /** Rota polyline yüklendiğinde (coordsKey aynı kalabilir) yeniden ortala */
  useEffect(() => {
    if (!mapReadyRef.current || lineCoords.length === 0) return;
    const t = setTimeout(() => fitMap(), 250);
    return () => clearTimeout(t);
  }, [fitMap, lineCoords]);

  const navGroups = useMemo((): MapNavigationDayGroup[] => {
    const fromProp = props.navigationDayGroups?.filter((g) => g.stops.length > 0) ?? [];
    if (fromProp.length > 0) return fromProp;
    if (withCoords.length === 0) return [];
    return [
      {
        dayYmd: '_all',
        dayLabel: 'Tüm rota',
        stops: withCoords,
      },
    ];
  }, [props.navigationDayGroups, withCoords]);

  const openNavForStops = useCallback(async (stops: Stop[]) => {
    const coords = stops.map((s) => ({
      latitude: s.coords!.latitude,
      longitude: s.coords!.longitude,
    }));
    try {
      const ok = await openGoogleMapsDrivingNavigation(coords);
      if (!ok) Alert.alert('Yol tarifi', 'Seçilen gün için geçerli konum yok.');
    } catch {
      Alert.alert('Yol tarifi', 'Google Haritalar açılamadı. Uygulamanın yüklü olduğundan emin olun.');
    }
  }, []);

  const onOpenLiveNavigation = useCallback(() => {
    if (navGroups.length === 0) {
      Alert.alert('Yol tarifi', 'Konumlu durak yok.');
      return;
    }
    if (navGroups.length === 1) {
      void openNavForStops(navGroups[0]!.stops);
      return;
    }
    setDayPickerOpen(true);
  }, [navGroups, openNavForStops]);

  if (withCoords.length === 0) return null;

  const first = withCoords[0].coords!;
  const initialRegion = {
    latitude: first.latitude,
    longitude: first.longitude,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  };

  return (
    <View style={styles.container} collapsable={false}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        mapType="standard"
        initialRegion={initialRegion}
        showsUserLocation
        onMapReady={handleMapReady}
        loadingEnabled
        loadingBackgroundColor={appTheme.color.surface}
        loadingIndicatorColor={appTheme.color.primary}
      >
        {lineCoords.length >= 2 && (
          <Polyline
            coordinates={lineCoords}
            strokeColor={appTheme.color.primary}
            strokeWidth={4}
          />
        )}
        {withCoords.map((s) => (
          <Marker
            key={s.stopId}
            coordinate={{
              latitude: s.coords!.latitude,
              longitude: s.coords!.longitude,
            }}
            title={s.locationName}
          />
        ))}
      </MapView>
      <Pressable
        style={({ pressed }) => [
          styles.navButton,
          { backgroundColor: appTheme.color.primary, opacity: pressed ? 0.88 : 1 },
        ]}
        onPress={() => void onOpenLiveNavigation()}
        accessibilityRole="button"
        accessibilityLabel="Google Haritalar ile canlı yol tarifi aç"
      >
        <Ionicons name="navigate" size={18} color="#fff" />
        <Text style={styles.navButtonText}>
          {navGroups.length > 1 ? 'Gün seç · Google Maps yol tarifi' : 'Canlı yol tarifi (Google Maps)'}
        </Text>
      </Pressable>

      <Modal
        visible={dayPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDayPickerOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setDayPickerOpen(false)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: appTheme.color.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.modalTitle, { color: appTheme.color.text }]}>
              Hangi gün için yol tarifi?
            </Text>
            <Text style={[styles.modalHint, { color: appTheme.color.muted }]}>
              Sadece seçtiğin günün durakları Google Haritalar’da açılır (Android’de genelde Google Maps
              uygulaması).
            </Text>
            <FlatList
              data={navGroups}
              keyExtractor={(g) => g.dayYmd}
              style={styles.modalList}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: g }) => (
                <Pressable
                  style={({ pressed }) => [
                    styles.modalRow,
                    { borderColor: appTheme.color.border },
                    pressed && { opacity: 0.85 },
                  ]}
                  onPress={() => {
                    setDayPickerOpen(false);
                    void openNavForStops(g.stops);
                  }}
                >
                  <Text style={[styles.modalRowTitle, { color: appTheme.color.text }]} numberOfLines={2}>
                    {g.dayLabel}
                  </Text>
                  <Text style={[styles.modalRowMeta, { color: appTheme.color.muted }]}>
                    {g.stops.length} durak
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color={appTheme.color.muted} />
                </Pressable>
              )}
            />
            <Pressable
              style={({ pressed }) => [
                styles.modalCancel,
                { borderColor: appTheme.color.border },
                pressed && { opacity: 0.88 },
              ]}
              onPress={() => setDayPickerOpen(false)}
            >
              <Text style={{ color: appTheme.color.primary, fontWeight: '600' }}>İptal</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function createMapStyles(t: AppTheme) {
  return StyleSheet.create({
    container: {
      height: 220,
      borderRadius: t.radius.md,
      overflow: 'hidden',
      position: 'relative',
    },
    map: { width: '100%', height: '100%' },
    navButton: {
      position: 'absolute',
      left: 10,
      right: 10,
      bottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: t.radius.sm,
      elevation: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.25,
      shadowRadius: 2,
    },
    navButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '600',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    modalCard: {
      borderRadius: t.radius.md,
      maxHeight: '72%',
      padding: 16,
      elevation: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      marginBottom: 6,
    },
    modalHint: {
      fontSize: 13,
      lineHeight: 18,
      marginBottom: 12,
    },
    modalList: {
      maxHeight: 320,
    },
    modalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: t.radius.sm,
      marginBottom: 8,
    },
    modalRowTitle: { flex: 1, fontSize: 16, fontWeight: '600' },
    modalRowMeta: { fontSize: 13, marginRight: 4 },
    modalCancel: {
      marginTop: 8,
      paddingVertical: 12,
      alignItems: 'center',
      borderTopWidth: StyleSheet.hairlineWidth,
    },
  });
}
