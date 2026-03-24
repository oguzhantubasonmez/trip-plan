/** "8:30" / "08:30" → "08:30" veya boş */
export function normalizePlanTime(raw: string): string | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return undefined;
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  if (Number.isNaN(h) || Number.isNaN(min)) return undefined;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** HH:mm string → Date (sabit gün; sadece saat/dakika kullanılır) */
export function planTimeToDate(hhmm: string): Date {
  const d = new Date(2000, 0, 1, 0, 0, 0, 0);
  const n = normalizePlanTime(hhmm);
  if (n) {
    const [hh, mm] = n.split(':').map((x) => parseInt(x, 10));
    if (!Number.isNaN(hh) && !Number.isNaN(mm)) d.setHours(hh, mm, 0, 0);
  }
  return d;
}

/** Date → "HH:mm" (24 saat) */
export function dateToPlanTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatPlanTimeRange(start?: string, end?: string): string {
  if (start && end) return `${start} – ${end}`;
  if (start) return `${start}’den itibaren`;
  if (end) return `${end}’e kadar`;
  return '';
}
