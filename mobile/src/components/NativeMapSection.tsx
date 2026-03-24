import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { Stop } from '../types/trip';
import { useAppTheme } from '../ThemeContext';
import type { AppTheme } from '../theme';

type Props = { stops: Stop[] };

export function NativeMapSection(props: Props) {
  const appTheme = useAppTheme();
  const styles = useMemo(() => createMapStyles(appTheme), [appTheme]);
  const mapRef = useRef<MapView>(null);

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

  const fitMap = useCallback(() => {
    if (polylineCoords.length === 0) return;
    mapRef.current?.fitToCoordinates(polylineCoords, {
      edgePadding: { top: 52, right: 52, bottom: 52, left: 52 },
      animated: true,
    });
  }, [polylineCoords]);

  useEffect(() => {
    const t = setTimeout(fitMap, 300);
    return () => clearTimeout(t);
  }, [fitMap]);

  if (withCoords.length === 0) return null;

  const first = withCoords[0].coords!;

  return (
    <View style={styles.container} collapsable={false}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        mapType="standard"
        initialRegion={{
          latitude: first.latitude,
          longitude: first.longitude,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        }}
        showsUserLocation
        onMapReady={fitMap}
        loadingEnabled
        loadingBackgroundColor={appTheme.color.surface}
        loadingIndicatorColor={appTheme.color.primary}
        {...(Platform.OS === 'android' ? { cacheEnabled: false } : {})}
      >
        {polylineCoords.length >= 2 && (
          <Polyline
            coordinates={polylineCoords}
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
