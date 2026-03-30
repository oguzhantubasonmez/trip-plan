import * as ExpoLinking from 'expo-linking';
import { Platform } from 'react-native';

/**
 * Davet URL’sinden rota kimliğini çıkarır.
 * - Web: ?invite= veya ?tripId=
 * - Native: routewise://join/{tripId} veya createURL ile üretilen eşdeğer path
 */
export function parseTripInviteIdFromUrl(url: string | null | undefined): string | null {
  if (url == null || typeof url !== 'string') return null;
  const u = url.trim();
  if (!u) return null;
  try {
    if (u.includes('?') || u.includes('&')) {
      const qi = u.match(/[?&]invite=([^&#]+)/);
      if (qi?.[1]) return decodeURIComponent(qi[1]).trim();
      const qt = u.match(/[?&]tripId=([^&#]+)/);
      if (qt?.[1]) return decodeURIComponent(qt[1]).trim();
    }
    const m = u.match(/join\/([^/?#]+)/);
    if (m?.[1]) return decodeURIComponent(m[1]).trim();
    return null;
  } catch {
    return null;
  }
}

/**
 * Paylaşılacak davet bağlantısı.
 * - Web: mevcut origin + ?invite= (tarayıcıda açılınca JoinInvite akışı)
 * - iOS/Android: app.json `scheme` (routewise) ile derin bağlantı — özel alan adı gerekmez.
 */
export function buildTripInviteUrl(tripId: string): string {
  const id = String(tripId ?? '').trim();
  if (!id) return '';
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location?.origin) {
      const path = window.location.pathname || '/';
      return `${window.location.origin}${path}?invite=${encodeURIComponent(id)}`;
    }
    return '';
  }
  return ExpoLinking.createURL(`join/${encodeURIComponent(id)}`);
}

export function buildTripInviteShareMessage(tripTitle: string, inviteUrl: string): string {
  const t = tripTitle.trim() || 'Rota';
  if (!inviteUrl) return t;
  return (
    `${t} — RouteWise’te bu rotaya katılmak için bağlantıya dokun:\n${inviteUrl}\n\n` +
    `Uygulama yüklüyse açılır; “Katılıyorum” deyince rotaya ekleneceksin.`
  );
}
