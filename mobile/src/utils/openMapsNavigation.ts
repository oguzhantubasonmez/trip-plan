import { Linking } from 'react-native';

export type NavCoord = { latitude: number; longitude: number };

/** Google Haritalar URL’sinde ara durak sayısı çok büyümesin (URL uzunluğu / uygulama limitleri). */
const MAX_INTERMEDIATE_WAYPOINTS = 9;

function formatCoord(c: NavCoord): string {
  return `${c.latitude.toFixed(6)},${c.longitude.toFixed(6)}`;
}

function sampleEvenly(middle: NavCoord[], max: number): NavCoord[] {
  if (middle.length <= max) return middle;
  const out: NavCoord[] = [];
  for (let i = 0; i < max; i++) {
    const idx = Math.round((i * (middle.length - 1)) / Math.max(1, max - 1));
    out.push(middle[idx]!);
  }
  return out;
}

/**
 * Google Maps (uygulama veya tarayıcı) — canlı araç yol tarifi / navigasyon.
 * @see https://developers.google.com/maps/documentation/urls/get-started#directions-action
 */
export function buildGoogleMapsDrivingDirectionsUrl(coords: NavCoord[]): string | null {
  const valid = coords.filter(
    (c) =>
      Number.isFinite(c.latitude) &&
      Number.isFinite(c.longitude) &&
      c.latitude >= -90 &&
      c.latitude <= 90 &&
      c.longitude >= -180 &&
      c.longitude <= 180
  );
  if (valid.length === 0) return null;

  const params = new URLSearchParams();
  params.set('api', '1');
  params.set('travelmode', 'driving');

  if (valid.length === 1) {
    params.set('destination', formatCoord(valid[0]!));
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }

  const origin = valid[0]!;
  const destination = valid[valid.length - 1]!;
  params.set('origin', formatCoord(origin));
  params.set('destination', formatCoord(destination));

  if (valid.length > 2) {
    const middle = valid.slice(1, -1);
    const picked = sampleEvenly(middle, MAX_INTERMEDIATE_WAYPOINTS);
    if (picked.length > 0) {
      params.set('waypoints', picked.map(formatCoord).join('|'));
    }
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Harici Google Maps (uygulama veya tarayıcı) — canlı sesli navigasyon burada çalışır.
 * Evrensel https bağlantısı iOS/Android’de yüklü uygulamaya yönlendirilebilir.
 */
export async function openGoogleMapsDrivingNavigation(coords: NavCoord[]): Promise<boolean> {
  const url = buildGoogleMapsDrivingDirectionsUrl(coords);
  if (!url) return false;
  await Linking.openURL(url);
  return true;
}
