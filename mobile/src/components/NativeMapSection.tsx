import MapView, { Marker } from 'react-native-maps';
import { StyleSheet, View } from 'react-native';
import type { Stop } from '../types/trip';
import { theme } from '../theme';

type Props = { stops: Stop[] };

export function NativeMapSection(props: Props) {
  const withCoords = props.stops.filter(
    (s) => s.coords?.latitude != null && s.coords?.longitude != null
  );
  if (withCoords.length === 0) return null;
  const first = withCoords[0].coords!;
  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: first.latitude,
          longitude: first.longitude,
          latitudeDelta: 0.5,
          longitudeDelta: 0.5,
        }}
        showsUserLocation
      >
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

const styles = StyleSheet.create({
  container: { height: 220, borderRadius: theme.radius.md, overflow: 'hidden' },
  map: { width: '100%', height: '100%' },
});
