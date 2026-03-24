import Constants from 'expo-constants';

/**
 * Metro `EXPO_PUBLIC_*` + EAS build sırasında app.config extra ile gömülen anahtar.
 * Directions / Places istemci istekleri için (sunucu proxy yok).
 */
export function getGoogleMapsApiKey(): string | null {
  const fromEnv =
    typeof process !== 'undefined' ? process.env?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY : undefined;
  if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim();

  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  const fromExtra = extra?.googleMapsApiKey;
  if (fromExtra && String(fromExtra).trim()) return String(fromExtra).trim();

  const g = typeof global !== 'undefined' ? (global as any).EXPO_PUBLIC_GOOGLE_MAPS_API_KEY : undefined;
  if (g != null && String(g).trim()) return String(g).trim();

  return null;
}
