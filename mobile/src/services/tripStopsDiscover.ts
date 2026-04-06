/**
 * Rota duraklarına göre bölgesel restoran / otel / aktivite önerileri (Google Geocoding + Places Nearby).
 * Web: tarayıcı CORS’u nedeniyle genelde çalışmaz; native’de anahtar + Places API gerekir.
 */

import { Linking, Platform } from 'react-native';
import type { Stop } from '../types/trip';
import { getGoogleMapsApiKey } from '../utils/googleMapsApiKey';

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const NEARBY_URL = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
const PLACE_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';
const PLACE_PHOTO_URL = 'https://maps.googleapis.com/maps/api/place/photo';

const CLUSTER_MAX_METERS = 28000;
const NEARBY_RADIUS_M = 12000;
/** Google’da az yorumlu işletmeleri ele */
const MIN_USER_RATINGS_TOTAL = 100;
const NEARBY_MAX_PAGES = 2;
const PHOTO_THUMB_MAX_WIDTH = 400;
const TOP_N = 3;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CLUSTERS_CONCURRENT = 2;

export type DiscoverPlaceSuggestion = {
  placeId: string;
  name: string;
  /** Nearby / Details — haritada doğru iğne için zorunlu */
  latitude: number;
  longitude: number;
  rating?: number;
  userRatingsTotal?: number;
  vicinity?: string;
  /** Places Photo API — o işletmenin Google fotoğrafı */
  photoUrl?: string;
};

export type DiscoverRegionBlock = {
  title: string;
  stopNames: string[];
  centroid: { latitude: number; longitude: number };
  restaurants: DiscoverPlaceSuggestion[];
  hotels: DiscoverPlaceSuggestion[];
  activities: DiscoverPlaceSuggestion[];
};

type CacheEntry = { at: number; regions: DiscoverRegionBlock[] };
const payloadCache = new Map<string, CacheEntry>();

function requireKey(): string {
  const key = getGoogleMapsApiKey();
  if (!key?.trim()) {
    throw new Error(
      'Google Maps anahtarı yok. EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ile tanımlayın; Places API ve Geocoding API açık olsun.'
    );
  }
  return key.trim();
}

function discoverPhotoUrl(photoReference: string): string {
  const key = requireKey();
  const params = new URLSearchParams({
    maxwidth: String(PHOTO_THUMB_MAX_WIDTH),
    photo_reference: photoReference,
    key,
  });
  return `${PLACE_PHOTO_URL}?${params.toString()}`;
}

function haversineM(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6371000;
  const φ1 = (a.latitude * Math.PI) / 180;
  const φ2 = (b.latitude * Math.PI) / 180;
  const Δφ = ((b.latitude - a.latitude) * Math.PI) / 180;
  const Δλ = ((b.longitude - a.longitude) * Math.PI) / 180;
  const s =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function clusterStopsByDistance(stops: Stop[]): Stop[][] {
  const withCoords = stops.filter(
    (s) =>
      s.coords &&
      Number.isFinite(s.coords.latitude) &&
      Number.isFinite(s.coords.longitude)
  );
  if (withCoords.length === 0) return [];

  const parent = withCoords.map((_, i) => i);
  function find(i: number): number {
    if (parent[i] !== i) parent[i] = find(parent[i]!);
    return parent[i]!;
  }
  function union(i: number, j: number) {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  }

  for (let i = 0; i < withCoords.length; i++) {
    const ci = withCoords[i]!.coords!;
    for (let j = i + 1; j < withCoords.length; j++) {
      const cj = withCoords[j]!.coords!;
      if (haversineM(ci, cj) <= CLUSTER_MAX_METERS) union(i, j);
    }
  }

  const groups = new Map<number, Stop[]>();
  for (let i = 0; i < withCoords.length; i++) {
    const r = find(i);
    const g = groups.get(r) ?? [];
    g.push(withCoords[i]!);
    groups.set(r, g);
  }
  return [...groups.values()];
}

function centroidOf(stops: Stop[]): { latitude: number; longitude: number } {
  let lat = 0;
  let lng = 0;
  let n = 0;
  for (const s of stops) {
    if (!s.coords) continue;
    lat += s.coords.latitude;
    lng += s.coords.longitude;
    n++;
  }
  return { latitude: lat / Math.max(1, n), longitude: lng / Math.max(1, n) };
}

function titleFromGeocodeComponents(components: { long_name?: string; types?: string[] }[]): string {
  let locality = '';
  let adm2 = '';
  let adm1 = '';
  for (const c of components) {
    const types = c.types ?? [];
    const name = typeof c.long_name === 'string' ? c.long_name.trim() : '';
    if (!name) continue;
    if (types.includes('locality')) locality = name;
    else if (types.includes('administrative_area_level_2')) adm2 = name;
    else if (types.includes('administrative_area_level_1')) adm1 = name;
  }
  if (locality && adm1 && locality !== adm1) return `${locality} · ${adm1}`;
  if (locality) return locality;
  if (adm2) return adm2;
  if (adm1) return adm1;
  return 'Bölge';
}

async function reverseGeocodeTitle(lat: number, lng: number): Promise<string> {
  const key = requireKey();
  const params = new URLSearchParams({
    latlng: `${lat},${lng}`,
    key,
    language: 'tr',
  });
  const res = await fetch(`${GEOCODE_URL}?${params.toString()}`);
  const data = await res.json();
  if (data.status !== 'OK' || !Array.isArray(data.results) || !data.results[0]) {
    return 'Bölge';
  }
  const comps = data.results[0].address_components;
  return titleFromGeocodeComponents(Array.isArray(comps) ? comps : []);
}

type NearbyRaw = {
  place_id?: string;
  name?: string;
  rating?: number;
  user_ratings_total?: number;
  vicinity?: string;
  photos?: { photo_reference?: string }[];
  geometry?: { location?: { lat?: number; lng?: number } };
};

function mapNearbyResults(raw: NearbyRaw[]): DiscoverPlaceSuggestion[] {
  const byId = new Map<string, DiscoverPlaceSuggestion>();
  for (const r of raw) {
    const placeId = typeof r.place_id === 'string' ? r.place_id.trim() : '';
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!placeId || !name) continue;
    const userRatingsTotal =
      typeof r.user_ratings_total === 'number' && !Number.isNaN(r.user_ratings_total)
        ? r.user_ratings_total
        : 0;
    if (userRatingsTotal < MIN_USER_RATINGS_TOTAL) continue;

    const loc = r.geometry?.location;
    const latitude = typeof loc?.lat === 'number' && Number.isFinite(loc.lat) ? loc.lat : NaN;
    const longitude = typeof loc?.lng === 'number' && Number.isFinite(loc.lng) ? loc.lng : NaN;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

    const rating = typeof r.rating === 'number' && !Number.isNaN(r.rating) ? r.rating : undefined;
    const vicinity = typeof r.vicinity === 'string' && r.vicinity.trim() ? r.vicinity.trim() : undefined;
    const photos = Array.isArray(r.photos) ? r.photos : [];
    const pref =
      typeof photos[0]?.photo_reference === 'string' && photos[0].photo_reference.trim()
        ? photos[0].photo_reference.trim()
        : '';
    let photoUrl: string | undefined;
    try {
      photoUrl = pref ? discoverPhotoUrl(pref) : undefined;
    } catch {
      photoUrl = undefined;
    }

    const next: DiscoverPlaceSuggestion = {
      placeId,
      name,
      latitude,
      longitude,
      userRatingsTotal,
      ...(rating != null ? { rating } : {}),
      ...(vicinity ? { vicinity } : {}),
      ...(photoUrl ? { photoUrl } : {}),
    };
    const prev = byId.get(placeId);
    if (!prev) {
      byId.set(placeId, next);
    } else {
      const nRev = next.userRatingsTotal ?? 0;
      const pRev = prev.userRatingsTotal ?? 0;
      const betterRev = nRev > pRev;
      const sameRevBetterPhoto = nRev === pRev && !prev.photoUrl && Boolean(next.photoUrl);
      if (betterRev || sameRevBetterPhoto) {
        byId.set(placeId, { ...next, photoUrl: next.photoUrl || prev.photoUrl });
      }
    }
  }
  return [...byId.values()];
}

function sortAndTop(suggestions: DiscoverPlaceSuggestion[], n: number): DiscoverPlaceSuggestion[] {
  const sorted = [...suggestions].sort((a, b) => {
    const ra = a.rating ?? 0;
    const rb = b.rating ?? 0;
    if (rb !== ra) return rb - ra;
    return (b.userRatingsTotal ?? 0) - (a.userRatingsTotal ?? 0);
  });
  const seen = new Set<string>();
  const uniq: DiscoverPlaceSuggestion[] = [];
  for (const s of sorted) {
    if (seen.has(s.placeId)) continue;
    seen.add(s.placeId);
    uniq.push(s);
    if (uniq.length >= n) break;
  }
  return uniq;
}

async function fetchPhotoReferenceFromDetails(placeId: string): Promise<string | null> {
  try {
    const key = requireKey();
    const params = new URLSearchParams({
      place_id: placeId,
      fields: 'photos',
      key,
      language: 'tr',
    });
    const res = await fetch(`${PLACE_DETAILS_URL}?${params.toString()}`);
    const data = await res.json();
    if (data.status !== 'OK') return null;
    const photos = data.result?.photos;
    const pref = Array.isArray(photos) ? photos[0]?.photo_reference : undefined;
    return typeof pref === 'string' && pref.trim() ? pref.trim() : null;
  } catch {
    return null;
  }
}

/** Nearby’de foto yoksa aynı place_id için Details’ten o işletmenin fotoğrafını alır. */
async function enrichPhotosIfNeeded(list: DiscoverPlaceSuggestion[]): Promise<DiscoverPlaceSuggestion[]> {
  if (list.length === 0) return list;
  return Promise.all(
    list.map(async (s) => {
      if (s.photoUrl) return s;
      const pref = await fetchPhotoReferenceFromDetails(s.placeId);
      if (!pref) return s;
      try {
        return { ...s, photoUrl: discoverPhotoUrl(pref) };
      } catch {
        return s;
      }
    })
  );
}

async function nearbySearchType(
  lat: number,
  lng: number,
  type: string
): Promise<DiscoverPlaceSuggestion[]> {
  const key = requireKey();
  const merged: NearbyRaw[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < NEARBY_MAX_PAGES; page++) {
    const params = new URLSearchParams({
      location: `${lat},${lng}`,
      radius: String(NEARBY_RADIUS_M),
      type,
      key,
      language: 'tr',
    });
    if (pageToken) params.set('pagetoken', pageToken);

    const res = await fetch(`${NEARBY_URL}?${params.toString()}`);
    const data = await res.json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      break;
    }
    const results = Array.isArray(data.results) ? data.results : [];
    merged.push(...(results as NearbyRaw[]));

    const qualified = mapNearbyResults(merged);
    if (qualified.length >= TOP_N * 4) {
      break;
    }

    const next =
      typeof data.next_page_token === 'string' && data.next_page_token.trim()
        ? data.next_page_token.trim()
        : undefined;
    if (!next || page >= NEARBY_MAX_PAGES - 1) break;
    pageToken = next;
    await new Promise((r) => setTimeout(r, 2100));
  }

  return mapNearbyResults(merged);
}

async function topActivities(lat: number, lng: number): Promise<DiscoverPlaceSuggestion[]> {
  const [tourist, museum] = await Promise.all([
    nearbySearchType(lat, lng, 'tourist_attraction'),
    nearbySearchType(lat, lng, 'museum'),
  ]);
  const merged = [...tourist, ...museum];
  return sortAndTop(merged, TOP_N);
}

async function loadRegionBlock(cluster: Stop[]): Promise<DiscoverRegionBlock> {
  const centroid = centroidOf(cluster);
  const { latitude: lat, longitude: lng } = centroid;
  const stopNames = cluster.map((s) => s.locationName?.trim() || 'Durak').filter(Boolean);

  const [title, restaurantsRaw, hotelsRaw, activities] = await Promise.all([
    reverseGeocodeTitle(lat, lng),
    nearbySearchType(lat, lng, 'restaurant'),
    nearbySearchType(lat, lng, 'lodging'),
    topActivities(lat, lng),
  ]);

  const [restaurants, hotels, activitiesEnriched] = await Promise.all([
    enrichPhotosIfNeeded(sortAndTop(restaurantsRaw, TOP_N)),
    enrichPhotosIfNeeded(sortAndTop(hotelsRaw, TOP_N)),
    enrichPhotosIfNeeded(activities),
  ]);

  return {
    title: `${title} için öneriler`,
    stopNames,
    centroid,
    restaurants,
    hotels,
    activities: activitiesEnriched,
  };
}

async function poolMap<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await fn(items[i]!);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function cacheKeyForTrip(tripId: string, orderedStops: Stop[]): string {
  const sig = orderedStops
    .map(
      (s) =>
        `${s.stopId}:${s.coords?.latitude?.toFixed(4) ?? ''}:${s.coords?.longitude?.toFixed(4) ?? ''}`
    )
    .join('|');
  return `${tripId}::v5mapcoords::${sig}`;
}

export function isTripStopsDiscoverSupported(): boolean {
  return Platform.OS !== 'web';
}

export async function fetchTripStopsDiscoverData(
  tripId: string,
  orderedStops: Stop[]
): Promise<DiscoverRegionBlock[]> {
  if (Platform.OS === 'web') {
    throw new Error('Bu özellik web sürümünde kullanılamıyor; mobil uygulamayı kullanın.');
  }

  const key = cacheKeyForTrip(tripId, orderedStops);
  const hit = payloadCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.regions;
  }

  const clusters = clusterStopsByDistance(orderedStops);
  if (clusters.length === 0) {
    return [];
  }

  const regions = await poolMap(clusters, MAX_CLUSTERS_CONCURRENT, loadRegionBlock);
  payloadCache.set(key, { at: Date.now(), regions });
  return regions;
}

/**
 * İşletmenin koordinat ve place_id bilgisiyle Google Haritalar’da o noktayı açar.
 * (Yalnızca query_place_id bazı cihazlarda «konumum»a düşebiliyor; isim+koordinat öncelikli.)
 */
export async function openDiscoverPlaceInMaps(s: DiscoverPlaceSuggestion): Promise<void> {
  const { name, placeId, latitude, longitude } = s;
  const webUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(placeId)}`;

  try {
    if (Platform.OS === 'ios') {
      const googleMapsApp = `comgooglemaps://?q=${encodeURIComponent(`${name}@${latitude},${longitude}`)}`;
      if (await Linking.canOpenURL('comgooglemaps://')) {
        await Linking.openURL(googleMapsApp);
        return;
      }
    }
    if (Platform.OS === 'android') {
      const geoUrl = `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodeURIComponent(name)})`;
      await Linking.openURL(geoUrl);
      return;
    }
  } catch {
    /* web’e düş */
  }

  await Linking.openURL(webUrl);
}
