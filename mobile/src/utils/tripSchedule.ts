/**
 * Rota tarihleri (YYYY-MM-DD) + opsiyonel plan saatleri (HH:mm) — yerel takvim, UTC kayması yok.
 */

/** "2025-03-17" → yerel gece yarısı */
export function parseTripYmd(iso: string | undefined | null): Date | null {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  if (Number.isNaN(y) || Number.isNaN(mo) || Number.isNaN(d)) return null;
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
  return dt;
}

export function formatTripDayTr(iso: string | undefined | null): string {
  const dt = parseTripYmd(iso);
  if (!dt) return '';
  return dt.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Sadece tarih aralığı: "17 Mart 2025 → 20 Mart 2025" */
export function formatTripDateRange(startDate?: string | null, endDate?: string | null): string {
  const a = formatTripDayTr(startDate ?? undefined);
  const b = formatTripDayTr(endDate ?? undefined);
  if (a && b) return `${a} → ${b}`;
  if (a) return a;
  if (b) return b;
  return 'Tarih atanmamış';
}

/**
 * Tarih + saat birlikte (tek satırda net):
 * "17 Mart 2025, 09:00 — 20 Mart 2025, 20:00"
 * Saat yoksa sadece tarih aralığı.
 */
export function formatTripScheduleSummary(
  startDate?: string | null,
  endDate?: string | null,
  startTime?: string | null,
  endTime?: string | null
): { dateLine: string; timeLine: string | null; combinedLine: string } {
  const dateLine = formatTripDateRange(startDate, endDate);
  const st = startTime?.trim();
  const et = endTime?.trim();
  const dayStart = formatTripDayTr(startDate ?? undefined);
  const dayEnd = formatTripDayTr(endDate ?? undefined);

  let timeLine: string | null = null;
  if (st && et) timeLine = `Günlük plan: ${st} – ${et}`;
  else if (st) timeLine = `Başlangıç saati: ${st}`;
  else if (et) timeLine = `Bitiş saati: ${et}`;

  let combinedLine = dateLine;
  if (dayStart && dayEnd && st && et) {
    combinedLine = `${dayStart}, ${st} — ${dayEnd}, ${et}`;
  } else if (dayStart && st && !et) {
    combinedLine = `${dayStart}, ${st}`;
  } else if (dayEnd && et && !st) {
    combinedLine = `${dayEnd}, ${et}`;
  } else if (dayStart && dayEnd && (st || et)) {
    const tail = [st, et].filter(Boolean).join(' – ');
    combinedLine = `${dateLine} · ${tail}`;
  }

  return { dateLine, timeLine, combinedLine };
}
