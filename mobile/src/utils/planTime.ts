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

/** Date → "HH:mm" (24 saat, yalnızca JS yerel saati) */
export function dateToPlanTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * @react-native-community/datetimepicker onChange çıktısı → "HH:mm".
 * Native katmanın verdiği utcOffset (dakika, UTC'nin doğusunda pozitif) ile hesaplanır;
 * böylece JS tarafında getHours() ile cihaz saati arasındaki +/−1 saat kaymaları önlenir.
 */
export function dateToPlanTimeFromPickerEvent(
  ev: { nativeEvent?: { timestamp?: number; utcOffset?: number } },
  date: Date
): string {
  const ne = ev.nativeEvent;
  const ts = typeof ne?.timestamp === 'number' && Number.isFinite(ne.timestamp) ? ne.timestamp : date.getTime();
  const offRaw = ne?.utcOffset;
  const off =
    typeof offRaw === 'number' && Number.isFinite(offRaw)
      ? offRaw
      : -date.getTimezoneOffset();
  const d = new Date(ts);
  let total = d.getUTCHours() * 60 + d.getUTCMinutes() + Math.round(off);
  total = ((total % 1440) + 1440) % 1440;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function formatPlanTimeRange(start?: string, end?: string): string {
  if (start && end) return `${start} – ${end}`;
  if (start) return `${start}’den itibaren`;
  if (end) return `${end}’e kadar`;
  return '';
}

/**
 * Varış ve kalkış saatleri (HH:mm) arası kalış süresi (dakika).
 * Aynı gün varsayılır; kalkış < varış ise ertesi güne sarılır.
 */
export function stayMinutesBetweenTimes(arrival?: string | null, departure?: string | null): number | null {
  const a = arrival && normalizePlanTime(arrival);
  const d = departure && normalizePlanTime(departure);
  if (!a || !d) return null;
  const t0 = planTimeToDate(a).getTime();
  const t1 = planTimeToDate(d).getTime();
  let diffMin = (t1 - t0) / 60000;
  if (diffMin < 0) diffMin += 24 * 60;
  if (!Number.isFinite(diffMin) || diffMin < 0) return null;
  return Math.round(diffMin);
}
