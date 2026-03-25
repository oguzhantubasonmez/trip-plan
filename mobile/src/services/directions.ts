/**
 * Duraklar arası yol parçaları: Google Routes API (computeRoutes) — araç yolu.
 * Eski Directions API (maps.googleapis.com/maps/api/directions) birçok projede kapatıldı; Routes API açık olmalı.
 * Cloud Console: "Routes API" etkin + faturalandırma; anahtarda bu API’ye izin verin.
 */

import { getGoogleMapsApiKey } from '../utils/googleMapsApiKey';

export type RouteLeg = {
  distanceKm: number;
  durationMin: number;
};

const ROUTES_COMPUTE_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
/** Sunucunun döndürmesi için gerekli alan maskesi */
const FIELD_MASK = 'routes.legs.distanceMeters,routes.legs.duration,routes.legs.staticDuration';

function waypoint(latitude: number, longitude: number) {
  return { location: { latLng: { latitude, longitude } } };
}

/** protobuf duration: "3600s" veya "3.5s" */
function parseDurationSeconds(value: string | undefined): number {
  if (!value || typeof value !== 'string') return 0;
  const m = value.match(/^([\d.]+)s$/);
  return m ? parseFloat(m[1]) : 0;
}

function parseRouteLeg(leg: {
  distanceMeters?: number;
  duration?: string;
  staticDuration?: string;
}): RouteLeg {
  const meters = leg.distanceMeters ?? 0;
  const sec =
    parseDurationSeconds(leg.duration) || parseDurationSeconds(leg.staticDuration);
  return {
    distanceKm: Math.round((meters / 1000) * 10) / 10,
    durationMin: Math.max(1, Math.round(sec / 60)),
  };
}

type RoutesErrorBody = { error?: { message?: string; status?: string; code?: number } };

async function postComputeRoutes(
  body: Record<string, unknown>,
  key: string
): Promise<RouteLeg[] | null> {
  try {
    const res = await fetch(ROUTES_COMPUTE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as RoutesErrorBody & { routes?: { legs?: unknown[] }[] };
    if (!res.ok || data.error) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn(
          '[routes]',
          data.error?.status ?? res.status,
          data.error?.message ?? ''
        );
      }
      return null;
    }
    const legsRaw = data.routes?.[0]?.legs;
    if (!Array.isArray(legsRaw) || legsRaw.length === 0) return null;
    return legsRaw.map((l) =>
      parseRouteLeg(l as { distanceMeters?: number; duration?: string; staticDuration?: string })
    );
  } catch {
    return null;
  }
}

/** Tek istek: origin → intermediates (en fazla 25) → destination */
async function fetchOneRouteLegs(
  coords: { latitude: number; longitude: number }[],
  key: string
): Promise<RouteLeg[] | null> {
  if (coords.length < 2) return [];
  const req: Record<string, unknown> = {
    origin: waypoint(coords[0].latitude, coords[0].longitude),
    destination: waypoint(
      coords[coords.length - 1].latitude,
      coords[coords.length - 1].longitude
    ),
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_UNAWARE',
    languageCode: 'tr',
    regionCode: 'TR',
  };
  if (coords.length > 2) {
    req.intermediates = coords.slice(1, -1).map((c) => waypoint(c.latitude, c.longitude));
  }
  const legs = await postComputeRoutes(req, key);
  if (!legs || legs.length !== coords.length - 1) return null;
  return legs;
}

/** Ardışık çiftler (çok ara durak veya tek rota başarısızsa) */
async function fetchPairwiseRouteLegs(
  coords: { latitude: number; longitude: number }[],
  key: string
): Promise<RouteLeg[] | null> {
  const legs: RouteLeg[] = [];
  for (let i = 1; i < coords.length; i++) {
    const segment = await postComputeRoutes(
      {
        origin: waypoint(coords[i - 1].latitude, coords[i - 1].longitude),
        destination: waypoint(coords[i].latitude, coords[i].longitude),
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_UNAWARE',
        languageCode: 'tr',
        regionCode: 'TR',
      },
      key
    );
    if (!segment || segment.length !== 1) return null;
    legs.push(segment[0]);
  }
  return legs;
}

const MAX_INTERMEDIATES = 25;

/**
 * Koordinat sırasına göre duraklar arası yol parçaları (yalnızca Routes API).
 */
export async function fetchDrivingLegs(
  coords: { latitude: number; longitude: number }[]
): Promise<RouteLeg[]> {
  if (coords.length < 2) return [];
  const key = getGoogleMapsApiKey();
  if (!key) {
    throw new Error(
      'Yol mesafesi için Google Maps anahtarı gerekli. EXPO_PUBLIC_GOOGLE_MAPS_API_KEY tanımlayın; EAS derlemesinde ' +
        'aynı değişkeni app.config extra ile aktarın.'
    );
  }

  const intermediateCount = coords.length - 2;
  let legs: RouteLeg[] | null = null;

  if (intermediateCount <= MAX_INTERMEDIATES) {
    legs = await fetchOneRouteLegs(coords, key);
  }
  if (!legs) {
    legs = await fetchPairwiseRouteLegs(coords, key);
  }
  if (!legs) {
    throw new Error(
      'Google Routes API yanıt vermedi. Cloud Console’da Routes API’yi etkinleştirin; API anahtarına Routes izni verin. ' +
        'Eski “Directions API” yerine “Routes API” kullanılıyor.'
    );
  }
  return legs;
}

export function sumLegDistanceKm(legs: RouteLeg[]): number {
  return Math.round(legs.reduce((s, l) => s + l.distanceKm, 0) * 10) / 10;
}
