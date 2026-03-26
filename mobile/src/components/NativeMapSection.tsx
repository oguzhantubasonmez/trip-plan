import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { fetchDrivingRoutePolyline, type LatLng } from '../services/directions';
import type { Stop } from '../types/trip';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';

type Props = { stops: Stop[] };

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
    </View>
  );
}

function createMapStyles(t: AppTheme) {
  return StyleSheet.create({
    container: { height: 220, borderRadius: t.radius.md, overflow: 'hidden' },
    map: { width: '100%', height: '100%' },
  });
}
