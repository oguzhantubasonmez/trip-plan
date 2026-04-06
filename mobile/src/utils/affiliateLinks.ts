/**
 * Ortaklık (affiliate) bağlantıları — partner ref parametrelerini ortam değişkeninden alır.
 * Üretimde `EXPO_PUBLIC_AFFILIATE_BOOKING_QUERY` gibi tam sorgu ekini veya base URL tanımlayın.
 */

function bookingAffiliateSuffix(): string {
  if (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_AFFILIATE_BOOKING_QUERY) {
    return String(process.env.EXPO_PUBLIC_AFFILIATE_BOOKING_QUERY).trim();
  }
  return '';
}

/** Konaklama arama (ör. Booking.com benzeri; URL’yi partner anlaşmanıza göre değiştirin). */
export function buildHotelSearchAffiliateUrl(cityOrQuery: string): string {
  const q = encodeURIComponent(cityOrQuery.trim() || 'otel');
  const base = `https://www.booking.com/searchresults.html?ss=${q}`;
  const suf = bookingAffiliateSuffix();
  if (!suf) return base;
  const join = base.includes('?') ? '&' : '?';
  return `${base}${join}${suf.replace(/^[?&]/, '')}`;
}

/** Restoran / yemek arama (Google Maps araması — affiliate parametresi genelde doğrudan desteklenmez; yönlendirme sayfanız kullanılabilir). */
export function buildRestaurantSearchUrlNear(label: string): string {
  const q = encodeURIComponent(`${label.trim()} restoran`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
