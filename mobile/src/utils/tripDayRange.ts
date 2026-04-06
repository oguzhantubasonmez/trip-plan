import { parseTripYmd } from './tripSchedule';

/** Rota başlangıç–bitiş (YYYY-MM-DD) arası her günü listeler (dahil). */
export function eachTripDayYmd(startYmd: string, endYmd: string): string[] {
  const a = parseTripYmd(startYmd);
  const b = parseTripYmd(endYmd);
  if (!a || !b) {
    const s = String(startYmd ?? '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? [s] : [];
  }
  const out: string[] = [];
  const cur = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function formatTripDayChipTr(ymd: string): string {
  const dt = parseTripYmd(ymd);
  if (!dt) return ymd;
  return dt.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' });
}
