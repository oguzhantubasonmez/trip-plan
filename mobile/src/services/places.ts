/**
 * Google Places API (Legacy) - Autocomplete + Place Details.
 * .env içinde EXPO_PUBLIC_GOOGLE_MAPS_API_KEY tanımlı olmalı.
 * Google Cloud Console'da Places API ve Places API (Legacy) etkinleştirilmeli.
 */

function getApiKey(): string {
  const key =
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY) ||
    (global as any).EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error(
      'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY tanımlı değil. .env dosyasına ekleyip uygulamayı yeniden başlatın.'
    );
  }
  return key;
}

export type PlacePrediction = {
  placeId: string;
  description: string;
};

export type PlaceDetails = {
  name: string;
  latitude: number;
  longitude: number;
  formattedAddress?: string;
};

const AUTOCOMPLETE_URL = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';
const DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';

export async function searchPlaces(input: string): Promise<PlacePrediction[]> {
  const trimmed = input.trim();
  if (!trimmed) return [];
  const key = getApiKey();
  const params = new URLSearchParams({
    input: trimmed,
    key,
    language: 'tr',
    components: 'country:tr',
  });
  const res = await fetch(`${AUTOCOMPLETE_URL}?${params.toString()}`);
  const data = await res.json();
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(data.error_message || data.status || 'Arama başarısız.');
  }
  const predictions = data.predictions || [];
  return predictions.map((p: any) => ({
    placeId: p.place_id,
    description: p.description || '',
  }));
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const key = getApiKey();
  const params = new URLSearchParams({
    place_id: placeId,
    key,
    language: 'tr',
    fields: 'name,geometry,formatted_address',
  });
  const res = await fetch(`${DETAILS_URL}?${params.toString()}`);
  const data = await res.json();
  if (data.status !== 'OK') {
    throw new Error(data.error_message || data.status || 'Yer detayı alınamadı.');
  }
  const r = data.result || {};
  const loc = r.geometry?.location;
  if (!loc?.lat || !loc?.lng) {
    throw new Error('Bu yer için konum bilgisi alınamadı.');
  }
  return {
    name: r.name || r.formatted_address || 'Seçilen yer',
    latitude: Number(loc.lat),
    longitude: Number(loc.lng),
    formattedAddress: r.formatted_address,
  };
}
