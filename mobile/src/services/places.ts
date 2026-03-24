/**
 * Google Places: Autocomplete + Place Details.
 * - iOS / Android: REST JSON (CORS yok).
 * - Web: Maps JavaScript API — AutocompleteSuggestion + Place (Places API New).
 *   Tarayıcıda REST autocomplete CORS ile bloklanır; JS kütüphanesi kullanılır.
 *
 * .env: EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
 * Cloud Console: Maps JavaScript API, Places API (New) etkin olsun.
 * Web anahtar kısıtında localhost referrer ekleyin.
 */

import { Platform } from 'react-native';
import { getGoogleMapsApiKey } from '../utils/googleMapsApiKey';

function requireGoogleMapsApiKey(): string {
  const key = getGoogleMapsApiKey();
  if (!key) {
    throw new Error(
      'Google Maps anahtarı yok. .env içinde EXPO_PUBLIC_GOOGLE_MAPS_API_KEY tanımlayın; EAS derlemesinde ' +
        'app.config extra.googleMapsApiKey için ortam değişkeni verin ve uygulamayı yeniden başlatın / yeniden derleyin.'
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

export type PlacesSearchMode = 'all' | 'regions' | 'geocode';

/** Google REST cevabındaki İngilizce hataları kullanıcıya Türkçe özetle */
function formatGoogleMapsKeyError(message: string): string {
  const m = message || '';
  if (/not authorized to use this service or API/i.test(m) || /REQUEST_DENIED/i.test(m)) {
    return (
      'Google API anahtarı bu servise izinli değil. Cloud Console → Kimlik bilgileri → anahtarınızda ' +
      '“API kısıtlamaları”na Places API (ve gerekirse Places API New) ekleyin; Android’de uygulama kısıtı ' +
      'kullanıyorsanız paket adı ve SHA-1 doğru olmalı (Expo Go ile testte host.exp.exponent gerekir). ' +
      'Detay: mobile/ÜCRETLER_VE_API.md'
    );
  }
  return m;
}

const AUTOCOMPLETE_URL = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';
const DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';

/* ---------- Native: doğrudan REST ---------- */

async function searchPlacesNative(
  input: string,
  mode: PlacesSearchMode = 'all'
): Promise<PlacePrediction[]> {
  const trimmed = input.trim();
  if (!trimmed) return [];
  const key = requireGoogleMapsApiKey();
  const params = new URLSearchParams({
    input: trimmed,
    key,
    language: 'tr',
    components: 'country:tr',
  });
  if (mode === 'regions') params.set('types', '(regions)');
  if (mode === 'geocode') params.set('types', 'geocode');
  const res = await fetch(`${AUTOCOMPLETE_URL}?${params.toString()}`);
  const data = await res.json();
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(formatGoogleMapsKeyError(data.error_message || data.status || 'Arama başarısız.'));
  }
  const predictions = data.predictions || [];
  return predictions.map((p: any) => ({
    placeId: p.place_id,
    description: p.description || '',
  }));
}

async function getPlaceDetailsNative(placeId: string): Promise<PlaceDetails> {
  const key = requireGoogleMapsApiKey();
  const params = new URLSearchParams({
    place_id: placeId,
    key,
    language: 'tr',
    fields: 'name,geometry,formatted_address',
  });
  const res = await fetch(`${DETAILS_URL}?${params.toString()}`);
  const data = await res.json();
  if (data.status !== 'OK') {
    throw new Error(formatGoogleMapsKeyError(data.error_message || data.status || 'Yer detayı alınamadı.'));
  }
  const r = data.result || {};
  const loc = r.geometry?.location;
  if (loc?.lat == null || loc?.lng == null) {
    throw new Error('Bu yer için konum bilgisi alınamadı.');
  }
  return {
    name: r.name || r.formatted_address || 'Seçilen yer',
    latitude: Number(loc.lat),
    longitude: Number(loc.lng),
    formattedAddress: r.formatted_address,
  };
}

/* ---------- Web: Maps JavaScript API (CORS yok) ---------- */

let mapsScriptPromise: Promise<void> | null = null;

function webPlacesNewApiReady(w: any): boolean {
  const p = w.google?.maps?.places;
  return !!(p?.AutocompleteSuggestion?.fetchAutocompleteSuggestions && p?.Place);
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function loadGoogleMapsScript(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Web ortamı değil.'));
  }
  const w = window as any;
  // Sadece "places" varlığı yetmez; Places API (New) sınıfları hazır olmalı
  if (webPlacesNewApiReady(w)) return Promise.resolve();
  if (mapsScriptPromise) return mapsScriptPromise;
  mapsScriptPromise = new Promise((resolve, reject) => {
    const key = requireGoogleMapsApiKey();
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&libraries=places&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      mapsScriptPromise = null;
      reject(new Error('Google Haritalar betiği yüklenemedi. Maps JavaScript API etkin ve anahtar kısıtları doğru mu kontrol edin.'));
    };
    document.head.appendChild(script);
  });
  return mapsScriptPromise;
}

/**
 * Places modülünü al: mümkünse importLibrary('places'), değilse klasik google.maps.places.
 * Bazı ortamlarda script.onload sonrası importLibrary birkaç tick gecikmeyle gelir; kısa süre beklenir.
 */
async function resolvePlacesLibrary(): Promise<any> {
  await loadGoogleMapsScript();
  const google = (window as any).google;
  if (!google?.maps) {
    throw new Error('Google Maps yüklenemedi. Sayfayı yenileyin; reklam/izin engelleyicileri kontrol edin.');
  }

  for (let attempt = 0; attempt < 60; attempt++) {
    const maps = google.maps;

    if (typeof maps.importLibrary === 'function') {
      try {
        const lib = await maps.importLibrary('places');
        if (lib?.AutocompleteSuggestion?.fetchAutocompleteSuggestions && lib?.Place) {
          return lib;
        }
      } catch {
        /* klasik namespace denenir */
      }
    }

    const p = maps.places;
    if (p?.AutocompleteSuggestion?.fetchAutocompleteSuggestions && p?.Place) {
      return p;
    }

    await delay(50);
  }

  throw new Error(
    'Google Maps Places (yeni API) hazır değil. Tarayıcı önbelleğini temizleyip yeniden deneyin; Maps JavaScript API ve Places API (New) açık olsun. Geliştirmede .env değişince Expo’yu tamamen kapatıp `npx expo start --web` ile yeniden başlatın.'
  );
}

/** Google'ın "API kapalı" metninden konsol linkini çıkar; kullanıcıya Türkçe yönerge. */
function formatPlacesNewApiDisabledError(raw: string): string | null {
  const m = raw.match(/https:\/\/console\.developers\.google\.com\/apis\/api\/places\.googleapis\.com\/overview\?project=\d+/);
  const link = m?.[0];
  const isNewPlacesDisabled =
    /Places API \(New\)/i.test(raw) ||
    /places\.googleapis\.com/i.test(raw) ||
    /has not been used in project/i.test(raw) ||
    /it is disabled/i.test(raw);
  if (!isNewPlacesDisabled) return null;
  const open = link
    ? ` Şu sayfadan açın: ${link}`
    : ' Google Cloud Console → API’ler ve Hizmetler → Kitaplık → "Places API (New)" aratıp Etkinleştir.';
  return (
    'Bu Google Cloud projesinde Places API (New) kapalı (veya yeni açıldı, birkaç dakika bekleyin).' +
    open +
    ' Aynı projede Maps JavaScript API de açık olmalı; web için API anahtarına localhost referrer ekleyin.'
  );
}

function placePredictionToDescription(pp: any): string {
  if (!pp) return '';
  const t = pp.text?.text;
  if (t) return t;
  const main = pp.mainText?.text ?? '';
  const sec = pp.secondaryText?.text ?? '';
  return sec ? `${main}, ${sec}` : main;
}

/** Eski AutocompletionRequest.types eşlemesi (en fazla 5 primary type). */
function primaryTypesForMode(mode: PlacesSearchMode): string[] | undefined {
  if (mode === 'regions') {
    return ['locality', 'administrative_area_level_1', 'administrative_area_level_2', 'country'];
  }
  if (mode === 'geocode') {
    return ['street_address', 'route', 'premise', 'subpremise', 'plus_code'];
  }
  return undefined;
}

async function searchPlacesWeb(
  input: string,
  mode: PlacesSearchMode = 'all'
): Promise<PlacePrediction[]> {
  const trimmed = input.trim();
  if (!trimmed) return [];

  const placesLib = await resolvePlacesLibrary();
  const AutocompleteSuggestion = placesLib.AutocompleteSuggestion;
  if (!AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
    throw new Error(
      'AutocompleteSuggestion kullanılamıyor. Cloud Console’da Places API (New) ve Maps JavaScript API’yi açın.'
    );
  }

  const request: Record<string, unknown> = {
    input: trimmed,
    language: 'tr',
    includedRegionCodes: ['tr'],
  };
  const primaryTypes = primaryTypesForMode(mode);
  if (primaryTypes?.length) {
    request.includedPrimaryTypes = primaryTypes;
  }

  try {
    const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
    const list = Array.isArray(suggestions) ? suggestions : [];
    const out: PlacePrediction[] = [];
    for (const s of list) {
      const pp = s?.placePrediction;
      if (!pp?.placeId) continue;
      out.push({
        placeId: pp.placeId,
        description: placePredictionToDescription(pp),
      });
    }
    return out;
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    const placesNewHint = formatPlacesNewApiDisabledError(msg);
    if (placesNewHint) throw new Error(placesNewHint);
    throw new Error(
      msg.includes('ApiNotActivated') || msg.includes('REQUEST_DENIED')
        ? 'Google Places / Haritalar API projede etkin değil veya anahtar kısıtlı. Places API (New) + Maps JavaScript API açıp web referrer ekleyin.'
        : `Yer araması başarısız: ${msg}`
    );
  }
}

async function getPlaceDetailsWeb(placeId: string): Promise<PlaceDetails> {
  const placesLib = await resolvePlacesLibrary();
  const Place = placesLib.Place;
  if (!Place) {
    throw new Error('Place sınıfı yüklenemedi. Places API (New) etkin mi kontrol edin.');
  }

  try {
    const place = new Place({ id: placeId });
    await place.fetchFields({
      fields: ['displayName', 'formattedAddress', 'location'],
    });

    const loc = place.location;
    if (!loc) {
      throw new Error('Bu yer için konum bilgisi alınamadı.');
    }
    const lat = typeof loc.lat === 'function' ? loc.lat() : Number(loc.lat);
    const lng = typeof loc.lng === 'function' ? loc.lng() : Number(loc.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      throw new Error('Konum koordinatları okunamadı.');
    }

    return {
      name: place.displayName || place.formattedAddress || 'Seçilen yer',
      latitude: lat,
      longitude: lng,
      formattedAddress: place.formattedAddress ?? undefined,
    };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    const placesNewHint = formatPlacesNewApiDisabledError(msg);
    if (placesNewHint) throw new Error(placesNewHint);
    throw new Error(
      msg.includes('not found') || msg.includes('NOT_FOUND')
        ? 'Yer bulunamadı.'
        : msg.includes('ApiNotActivated') || msg.includes('REQUEST_DENIED')
          ? 'Yer detayı için Places API (New) ve anahtar izinlerini kontrol edin.'
          : msg || 'Yer bilgisi alınamadı.'
    );
  }
}

/* ---------- Birleşik export ---------- */

export async function searchPlaces(input: string, mode: PlacesSearchMode = 'all'): Promise<PlacePrediction[]> {
  if (Platform.OS === 'web') {
    return searchPlacesWeb(input, mode);
  }
  return searchPlacesNative(input, mode);
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  if (Platform.OS === 'web') {
    return getPlaceDetailsWeb(placeId);
  }
  return getPlaceDetailsNative(placeId);
}
