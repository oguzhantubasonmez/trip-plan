import type { Stop } from '../types/trip';
import type { PlanSummaryExportInput } from './planSummaryExport';
import { computeDayTotals, formatDurationTr } from './planSummaryExport';

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').trim());
}

/** UTC gece yarısı (takvim günü) — Open-Meteo tarih parametreleri ile uyumlu. */
function parseYmdUtc(ymd: string): Date | null {
  const t = String(ymd || '').trim();
  if (!isYmd(t)) return null;
  const [ys, ms, ds] = t.split('-');
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

function formatYmdUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Open-Meteo `/v1/forecast` günlük veri en fazla ~16 gün ileriye izin verir; dışındaki aralık 400 döner.
 * Rota bu pencerenin dışındaysa istek atılmaz (null).
 */
function clampTripDatesToOpenMeteoForecast(
  tripStartYmd: string,
  tripEndYmd: string
): { start_date: string; end_date: string } | null {
  const OPEN_METEO_FORECAST_DAYS = 16;
  const tripStart = parseYmdUtc(tripStartYmd);
  const tripEnd = parseYmdUtc(tripEndYmd);
  if (!tripStart || !tripEnd || tripEnd < tripStart) return null;

  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const lastValid = new Date(todayUtc);
  lastValid.setUTCDate(lastValid.getUTCDate() + OPEN_METEO_FORECAST_DAYS - 1);

  if (tripEnd < todayUtc) return null;
  if (tripStart > lastValid) return null;

  const reqStart = tripStart < todayUtc ? todayUtc : tripStart;
  const reqEnd = tripEnd > lastValid ? lastValid : tripEnd;
  if (reqStart > reqEnd) return null;

  return { start_date: formatYmdUtc(reqStart), end_date: formatYmdUtc(reqEnd) };
}

/** WMO kodundan kısa Türkçe etiket (özet). */
function weatherCodeLabel(code: number): string {
  if (code === 0) return 'açık';
  if (code <= 3) return 'parçalı bulutlu';
  if (code <= 48) return 'sis / düşük bulut';
  if (code <= 57) return 'çiseleme / yağmur ihtimali';
  if (code <= 67) return 'yağmurlu';
  if (code <= 77) return 'karlı / karışık';
  if (code <= 82) return 'sağanak';
  if (code <= 86) return 'kar sağanağı';
  if (code <= 99) return 'gök gürültülü / dolu riski';
  return 'değişken';
}

/**
 * İlk durak koordinatı + rota tarihleri için Open-Meteo (ücretsiz, anahtarsız) kısa hava özeti.
 * Ağ yoksa veya hata olursa null.
 */
export async function fetchOpenMeteoPlanHint(params: {
  tripStartYmd: string;
  tripEndYmd: string;
  latitude: number;
  longitude: number;
}): Promise<string | null> {
  if (!isYmd(params.tripStartYmd) || !isYmd(params.tripEndYmd)) return null;
  const lat = params.latitude;
  const lon = params.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const window = clampTripDatesToOpenMeteoForecast(params.tripStartYmd, params.tripEndYmd);
  if (!window) return null;

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(String(lat))}` +
    `&longitude=${encodeURIComponent(String(lon))}` +
    `&daily=precipitation_probability_max,weathercode` +
    `&timezone=auto&start_date=${window.start_date}&end_date=${window.end_date}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      daily?: {
        precipitation_probability_max?: (number | null)[];
        weathercode?: (number | null)[];
      };
    };
    const probs = data.daily?.precipitation_probability_max ?? [];
    const codes = data.daily?.weathercode ?? [];
    if (probs.length === 0 && codes.length === 0) return null;

    let maxP = 0;
    for (const p of probs) {
      if (typeof p === 'number' && !Number.isNaN(p)) maxP = Math.max(maxP, p);
    }
    const mid = Math.floor(codes.length / 2);
    const sampleCode = typeof codes[mid] === 'number' ? codes[mid]! : typeof codes[0] === 'number' ? codes[0]! : 0;
    const durum = weatherCodeLabel(sampleCode);

    if (maxP >= 55) {
      return `Hava (Open-Meteo, ilk durak civarı): ${durum}; yağış olasılığı bazı günlerde %${Math.round(maxP)}’e kadar çıkıyor — şemsiye ve yedek plan düşünün.`;
    }
    if (maxP >= 25) {
      return `Hava (Open-Meteo, ilk durak civarı): ${durum}; ara ara yağış ihtimali (~%${Math.round(maxP)}).`;
    }
    return `Hava (Open-Meteo, ilk durak civarı): genel olarak ${durum}; yağış riski düşük görünüyor.`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Rota verisinden sunum/ipuçları metinleri (yerel + isteğe bağlı ağ özeti).
 */
export function buildHeuristicPlanInsights(input: PlanSummaryExportInput): string[] {
  const lines: string[] = [];

  if (input.stopCount === 0) {
    lines.push('Henüz durak yok: güzergâh, süre ve masrafları netleştirmek için durak ekleyin.');
  }

  if (input.dayGroups.length > 1) {
    lines.push(
      `${input.dayGroups.length} günlük plan: konaklama, yakıt ve molaları günlere yaymayı unutmayın.`
    );
  }

  if (input.grandTl > 0) {
    if (input.perPersonTl != null && input.goingCount > 0) {
      lines.push(
        `Bütçe özeti: toplam ${input.grandTl.toFixed(2)} ₺; ${input.goingCount} kişi için kabaca kişi başı ${input.perPersonTl.toFixed(2)} ₺.`
      );
    } else {
      lines.push(`Tahmini toplam maliyet: ${input.grandTl.toFixed(2)} ₺ (yakıt + durak masrafları).`);
    }
  }

  const totalLegKm = input.stops.reduce(
    (s, x) => s + (typeof x.legKm === 'number' && !Number.isNaN(x.legKm) ? x.legKm : 0),
    0
  );
  const totalLegMin = input.stops.reduce(
    (s, x) => s + (typeof x.legMin === 'number' && !Number.isNaN(x.legMin) ? x.legMin : 0),
    0
  );
  if (totalLegKm > 400) {
    lines.push('Uzun mesafe: lastik basıncı, yağ seviyesi ve cam suyunu yola çıkmadan kontrol edin.');
  }
  if (totalLegMin > 240) {
    lines.push('Uzun sürüş: yaklaşık 2 saatte bir kısa mola önerilir (su, esneme).');
  }

  if (input.extraByCategory.length > 0) {
    const top = [...input.extraByCategory].sort((a, b) => b.total - a.total)[0];
    if (top && top.total > 0) {
      lines.push(`En yüksek masraf kalemi: «${top.name}» (${top.total.toFixed(2)} ₺) — bütçeyi buna göre gözden geçirin.`);
    }
  }

  lines.push('Önemli belgeler, şarj aleti ve ilk yardım çantası için hızlı bir kontrol listesi çıkarın.');
  lines.push('Canlı trafik ve güncel yol durumu için yola çıkmadan önce harita uygulamanızı kontrol edin.');

  return lines;
}

export async function collectPlanExportInsightLines(
  input: PlanSummaryExportInput,
  routeOrderedStops: Stop[],
  tripStartYmd: string,
  tripEndYmd: string
): Promise<string[]> {
  const out: string[] = [];
  const firstWithCoords = routeOrderedStops.find(
    (s) =>
      s.coords &&
      typeof s.coords.latitude === 'number' &&
      typeof s.coords.longitude === 'number' &&
      Number.isFinite(s.coords.latitude) &&
      Number.isFinite(s.coords.longitude)
  );
  if (firstWithCoords?.coords) {
    const hint = await fetchOpenMeteoPlanHint({
      tripStartYmd,
      tripEndYmd,
      latitude: firstWithCoords.coords.latitude,
      longitude: firstWithCoords.coords.longitude,
    });
    if (hint) out.push(hint);
  }
  out.push(...buildHeuristicPlanInsights(input));

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const line of out) {
    const t = line.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    deduped.push(t);
  }
  return deduped.slice(0, 14);
}

/** Gün özeti satırı (PPT / metin). */
export function dayGroupSummaryLine(stops: PlanSummaryExportInput['stops']): string {
  const t = computeDayTotals(stops);
  const parts: string[] = [];
  if (t.totalLegKm > 0) parts.push(`${t.totalLegKm} km sürüş`);
  if (t.totalLegDriveMin > 0) parts.push(formatDurationTr(t.totalLegDriveMin) + ' volantta');
  if (t.totalRestMin > 0) parts.push(formatDurationTr(t.totalRestMin) + ' durakta');
  if (t.totalExpenseTl > 0) parts.push(`${t.totalExpenseTl.toFixed(2)} ₺ durak masrafı`);
  return parts.length > 0 ? parts.join(' · ') : 'Özet: —';
}
