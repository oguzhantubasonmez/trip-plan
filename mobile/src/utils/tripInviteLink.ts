import Constants from 'expo-constants';
import * as ExpoLinking from 'expo-linking';
import { Platform } from 'react-native';

const ANDROID_PACKAGE = 'com.routewise.tripplan';
const PLAY_STORE_LISTING = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

function getInviteWebBaseUrl(): string {
  const extra = Constants.expoConfig?.extra as { inviteWebBaseUrl?: string } | undefined;
  const fromExtra = String(extra?.inviteWebBaseUrl ?? '').trim();
  if (fromExtra) return fromExtra;
  if (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_INVITE_WEB_URL) {
    return String(process.env.EXPO_PUBLIC_INVITE_WEB_URL).trim();
  }
  return '';
}

function trimTrailingSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

/**
 * WhatsApp / mesajlaşma: yalnızca https bağlantılar güvenilir şekilde tıklanır.
 * `EXPO_PUBLIC_INVITE_WEB_URL` + `invite-redirect.example.html` (GitHub Pages vb.) ile doldur.
 */
export function buildTripInviteHttpsUrl(tripId: string): string | null {
  const id = String(tripId ?? '').trim();
  if (!id) return null;
  const base = getInviteWebBaseUrl();
  if (!base) return null;
  const b = trimTrailingSlash(base);
  const sep = b.includes('?') ? '&' : '?';
  return `${b}${sep}invite=${encodeURIComponent(id)}`;
}

/**
 * Android: Chrome / bazı istemcilerde `intent://` http’ye yakın davranabilir; WhatsApp yine de link yapmayabilir.
 * Uygulama yoksa Play Store’a düşer (S.browser_fallback_url).
 */
export function buildAndroidInviteIntentUrl(tripId: string): string {
  const id = String(tripId ?? '').trim();
  if (!id) return '';
  const path = `join/${encodeURIComponent(id)}`;
  const fallback = encodeURIComponent(PLAY_STORE_LISTING);
  return `intent://${path}#Intent;scheme=routewise;package=${ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`;
}

/** Kopyala / yedek: doğrudan özel şema (WhatsApp’ta genelde tıklanmaz). */
export function buildTripInviteDeepLink(tripId: string): string {
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

/**
 * Paylaşımda kullanılacak “birincil” satır: önce https, yoksa Android’de intent, sonra derin bağlantı.
 */
export function buildTripInviteSharePrimaryLink(tripId: string): string {
  const https = buildTripInviteHttpsUrl(tripId);
  if (https) return https;
  if (Platform.OS === 'android') {
    const intent = buildAndroidInviteIntentUrl(tripId);
    if (intent) return intent;
  }
  return buildTripInviteDeepLink(tripId);
}

/**
 * Davet URL’sinden rota kimliğini çıkarır.
 * - Web: ?invite= veya ?tripId=
 * - intent://join/…
 * - routewise:// veya path join/…
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
    const intentM = u.match(/intent:\/\/join\/([^#?]+)/i);
    if (intentM?.[1]) return decodeURIComponent(intentM[1]).trim();
    const m = u.match(/join\/([^/?#]+)/);
    if (m?.[1]) return decodeURIComponent(m[1]).trim();
    return null;
  } catch {
    return null;
  }
}

/** @deprecated buildTripInviteDeepLink veya buildTripInviteSharePrimaryLink kullan */
export function buildTripInviteUrl(tripId: string): string {
  return buildTripInviteDeepLink(tripId);
}

export function buildTripInviteShareMessage(
  tripTitle: string,
  primaryLink: string,
  opts?: { deepLinkFallback?: string }
): string {
  const t = tripTitle.trim() || 'Rota';
  if (!primaryLink) return t;
  const https = primaryLink.trim().startsWith('https://');
  const lines = [
    `${t} — RouteWise’te bu rotaya katılmak için bağlantıya dokun:`,
    primaryLink,
    '',
    'Uygulama yüklüyse açılır; “Katılıyorum” deyince rotaya ekleneceksin.',
  ];
  if (!https && opts?.deepLinkFallback && opts.deepLinkFallback !== primaryLink) {
    lines.push(
      '',
      'Bağlantı tıklanmıyorsa (ör. WhatsApp): aşağıdaki satırı uzun bas · Kopyala de, yapıştır veya «Davet linkini kopyala» ile paylaş.',
      opts.deepLinkFallback
    );
  }
  return lines.join('\n');
}
