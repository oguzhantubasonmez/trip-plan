import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import type { Stop, Trip } from '../types/trip';
import { formatStopExtraExpenseLine, normalizeStopExtraExpenses, stopExtraTotal } from './stopExpenses';
import { effectiveStopYmd, formatTripDayTr, formatTripScheduleSummary } from './tripSchedule';

export type PlanSummaryStopRow = {
  routeIndex: number;
  dayLabel: string;
  name: string;
  arrival?: string;
  departure?: string;
  /** Varış–ayrılış arası dakika; hesaplanamazsa null */
  stopRestMin: number | null;
  /** Türkçe kısa metin (örn. "6 sa 0 dk") */
  stopRestDisplay: string;
  extrasSummary: string;
  stopTotalTl: number;
  legKm?: number;
  legMin?: number;
};

export type PlanDayTotals = {
  totalRestMin: number;
  totalLegDriveMin: number;
  totalLegKm: number;
  totalExpenseTl: number;
};

export type PlanSummaryExportInput = {
  tripTitle: string;
  scheduleLine: string;
  vehicleLabel?: string;
  kmLine: string;
  durationLine: string;
  stopCount: number;
  fuelTl: number;
  extraTl: number;
  grandTl: number;
  perPersonTl: number | null;
  goingCount: number;
  extraByCategory: { name: string; total: number }[];
  stops: PlanSummaryStopRow[];
  /** Gün başlığına göre gruplanmış (HTML için) */
  dayGroups: { dayLabel: string; stops: PlanSummaryStopRow[] }[];
  exportedAt: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Excel TR: noktalı virgül + UTF-8 BOM */
function csvCell(v: string): string {
  const t = String(v ?? '');
  if (/[;\r\n"]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function safeFilenamePart(s: string, max = 40): string {
  return String(s || 'rota')
    .replace(/[\\/:*?"<>|\r\n]+/g, '_')
    .slice(0, max)
    .replace(/_+$/g, '') || 'rota';
}

/** "HH:mm" veya "H:mm" → gün içi dakika */
function parseTimeToMinutes(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const m = String(raw).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (Number.isNaN(h) || Number.isNaN(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Durakta geçirilen süre (ayrılış − varış); gece taşması için +24 saat */
function stopRestMinutes(arrival?: string, departure?: string): number | null {
  const a = parseTimeToMinutes(arrival);
  const d = parseTimeToMinutes(departure);
  if (a === null || d === null) return null;
  let diff = d - a;
  if (diff < 0) diff += 24 * 60;
  return diff;
}

export function formatDurationTr(totalMin: number): string {
  if (totalMin <= 0) return '—';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h} sa ${m} dk`;
  if (h > 0) return `${h} sa`;
  return `${m} dk`;
}

export function computeDayTotals(stops: PlanSummaryStopRow[]): PlanDayTotals {
  let totalRestMin = 0;
  let totalLegDriveMin = 0;
  let totalLegKm = 0;
  let totalExpenseTl = 0;
  for (const s of stops) {
    if (s.stopRestMin != null) totalRestMin += s.stopRestMin;
    if (s.legMin != null && !Number.isNaN(s.legMin)) totalLegDriveMin += s.legMin;
    if (s.legKm != null && !Number.isNaN(s.legKm)) totalLegKm += s.legKm;
    totalExpenseTl += s.stopTotalTl;
  }
  return {
    totalRestMin,
    totalLegDriveMin,
    totalLegKm: Math.round(totalLegKm * 10) / 10,
    totalExpenseTl: Math.round(totalExpenseTl * 100) / 100,
  };
}

function sumLegKm(stops: PlanSummaryStopRow[]): number {
  return stops.reduce(
    (s, x) => s + (typeof x.legKm === 'number' && !Number.isNaN(x.legKm) ? x.legKm : 0),
    0
  );
}

/**
 * Rota yakıtını günlere böler: o günkü bacak km / tüm bacak km.
 * Bacak km yoksa yakıt gün sayısına eşit bölünür (yuvarlama son güne dengelenir).
 */
export function allocateFuelTlByDay(
  dayGroups: { stops: PlanSummaryStopRow[] }[],
  fuelTl: number
): number[] {
  const n = dayGroups.length;
  if (n === 0 || fuelTl <= 0) return dayGroups.map(() => 0);

  const totalKm = dayGroups.reduce((acc, g) => acc + sumLegKm(g.stops), 0);

  if (totalKm > 0) {
    const raw = dayGroups.map((g) => (fuelTl * sumLegKm(g.stops)) / totalKm);
    const rounded = raw.map((v) => Math.round(v * 100) / 100);
    const sumR = rounded.reduce((a, b) => a + b, 0);
    const drift = Math.round((fuelTl - sumR) * 100) / 100;
    if (rounded.length > 0 && Math.abs(drift) >= 0.001) {
      rounded[rounded.length - 1] = Math.round((rounded[rounded.length - 1] + drift) * 100) / 100;
    }
    return rounded;
  }

  const per = Math.round((fuelTl / n) * 100) / 100;
  const out = dayGroups.map(() => per);
  const diff = Math.round((fuelTl - per * n) * 100) / 100;
  if (out.length > 0 && diff !== 0) {
    out[out.length - 1] = Math.round((out[out.length - 1] + diff) * 100) / 100;
  }
  return out;
}

export function buildPlanStopRows(tripStartDate: string, routeOrderedStops: Stop[]): PlanSummaryStopRow[] {
  return routeOrderedStops.map((s, i) => {
    const ymd = effectiveStopYmd(s, tripStartDate);
    const dayLabel = formatTripDayTr(ymd) || ymd;
    const extras = normalizeStopExtraExpenses(s);
    const extrasSummary =
      extras.length > 0 ? extras.map(formatStopExtraExpenseLine).join(' · ') : '—';
    const leg = s.legFromPrevious;
    const arrival = s.arrivalTime?.trim() || undefined;
    const departure = s.departureTime?.trim() || undefined;
    const restMin = stopRestMinutes(arrival, departure);
    return {
      routeIndex: i + 1,
      dayLabel,
      name: s.locationName?.trim() || 'Durak',
      arrival,
      departure,
      stopRestMin: restMin,
      stopRestDisplay: restMin != null ? formatDurationTr(restMin) : '—',
      extrasSummary,
      stopTotalTl: stopExtraTotal(s),
      legKm: leg?.distanceKm,
      legMin: leg?.durationMin,
    };
  });
}

export function groupStopRowsByDay(rows: PlanSummaryStopRow[]): { dayLabel: string; stops: PlanSummaryStopRow[] }[] {
  const out: { dayLabel: string; stops: PlanSummaryStopRow[] }[] = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (!last || last.dayLabel !== r.dayLabel) {
      out.push({ dayLabel: r.dayLabel, stops: [r] });
    } else {
      last.stops.push(r);
    }
  }
  return out;
}

export function buildPlanSummaryExportInput(params: {
  trip: Trip;
  routeOrderedStops: Stop[];
  kmLine: string;
  durationLine: string;
  grandTotalCost: number;
  fuelCostNum: number;
  totalExtraCosts: number;
  perPersonGrand: number | null;
  goingCount: number;
  extraCostsByCategory: { name: string; total: number }[];
}): PlanSummaryExportInput {
  const { trip } = params;
  const sched = formatTripScheduleSummary(
    trip.startDate,
    trip.endDate,
    trip.startTime,
    trip.endTime
  );
  const stops = buildPlanStopRows(trip.startDate ?? '', params.routeOrderedStops);
  return {
    tripTitle: trip.title?.trim() || 'Rota',
    scheduleLine: sched.combinedLine,
    vehicleLabel: trip.vehicleLabel?.trim() || undefined,
    kmLine: params.kmLine,
    durationLine: params.durationLine,
    stopCount: params.routeOrderedStops.length,
    fuelTl: params.fuelCostNum,
    extraTl: params.totalExtraCosts,
    grandTl: params.grandTotalCost,
    perPersonTl: params.perPersonGrand,
    goingCount: params.goingCount,
    extraByCategory: params.extraCostsByCategory,
    stops,
    dayGroups: groupStopRowsByDay(stops),
    exportedAt: new Date().toLocaleString('tr-TR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }),
  };
}

export function buildPlanSummaryCsv(input: PlanSummaryExportInput): string {
  const sep = ';';
  const lines: string[] = [];
  lines.push(['Alan', 'Değer'].map(csvCell).join(sep));
  lines.push(['Rota', csvCell(input.tripTitle)].join(sep));
  lines.push(['Tarih / saat planı', csvCell(input.scheduleLine)].join(sep));
  if (input.vehicleLabel) lines.push(['Araç', csvCell(input.vehicleLabel)].join(sep));
  lines.push(['Mesafe', csvCell(input.kmLine)].join(sep));
  lines.push(['Sürüş süresi (tahmini)', csvCell(input.durationLine)].join(sep));
  lines.push(['Durak sayısı', csvCell(String(input.stopCount))].join(sep));
  lines.push(['Yakıt (₺)', csvCell(input.fuelTl.toFixed(2))].join(sep));
  lines.push(['Ekstra (₺)', csvCell(input.extraTl.toFixed(2))].join(sep));
  lines.push(['Toplam (₺)', csvCell(input.grandTl.toFixed(2))].join(sep));
  if (input.perPersonTl != null && input.goingCount > 0) {
    lines.push(
      ['Kişi başı (₺)', csvCell(`${input.perPersonTl.toFixed(2)} (${input.goingCount} katılıyor)`)].join(sep)
    );
  }
  lines.push(['Dışa aktarım', csvCell(input.exportedAt)].join(sep));
  lines.push('');
  lines.push(
    [
      'Gün',
      'Sıra',
      'Durak',
      'Varış',
      'Ayrılış',
      'Durakta süre',
      'Masraflar',
      'Durak toplam (₺)',
      'Önceki duraktan (km)',
      'Önceki duraktan (dk)',
    ]
      .map(csvCell)
      .join(sep)
  );
  for (const s of input.stops) {
    lines.push(
      [
        s.dayLabel,
        String(s.routeIndex),
        s.name,
        s.arrival ?? '—',
        s.departure ?? '—',
        s.stopRestDisplay,
        s.extrasSummary,
        s.stopTotalTl.toFixed(2),
        s.legKm != null ? String(s.legKm) : '—',
        s.legMin != null ? String(s.legMin) : '—',
      ]
        .map(csvCell)
        .join(sep)
    );
  }
  if (input.extraByCategory.length > 0) {
    lines.push('');
    lines.push(['Masraf türü', 'Toplam (₺)'].map(csvCell).join(sep));
    for (const c of input.extraByCategory) {
      lines.push([c.name, c.total.toFixed(2)].map(csvCell).join(sep));
    }
  }
  return '\uFEFF' + lines.join('\r\n');
}

function webDownload(filename: string, content: string, mime: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Tarayıcıda dosya indirme — uzun async sonrası programatik tıklama engellendiği için genelde kullanıcı tıklamasında çağırın. */
export function triggerBrowserFileDownload(filename: string, content: string, mimeType: string): void {
  webDownload(filename, content, mimeType);
}

export function buildPlanExportFilename(
  tripId: string,
  tripTitle: string,
  extension: 'csv' | 'html'
): string {
  const baseName = `RouteWise-${safeFilenamePart(tripTitle)}-${tripId.slice(0, 8)}`;
  return `${baseName}.${extension}`;
}

function webDownloadBase64(filename: string, base64: string, mime: string): void {
  if (typeof document === 'undefined' || typeof atob === 'undefined') return;
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * HTML plan özeti ile PDF: iOS/Android’de geçici PDF dosyası üretilir; web’de yazdır menüsü açılır (PDF olarak kaydet).
 */
export async function sharePlanSummaryPdf(params: {
  tripId: string;
  tripTitle: string;
  html: string;
  dialogTitle: string;
}): Promise<void> {
  if (Platform.OS === 'web') {
    await Print.printToFileAsync({ html: params.html });
    return;
  }

  const result = await Print.printToFileAsync({ html: params.html });
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Paylaşım bu cihazda kullanılamıyor.');
  }
  await Sharing.shareAsync(result.uri, {
    mimeType: 'application/pdf',
    dialogTitle: params.dialogTitle,
    UTI: 'com.adobe.pdf',
  });
}

export type PreparedPlanSummaryPptx =
  | { kind: 'web'; filename: string }
  | { kind: 'native'; uri: string; filename: string };

/** .pptx dosyasını oluşturur: web’de indirme tetiklenir, native’de önbelleğe yazılır (paylaşım ayrı). */
export async function preparePlanSummaryPptxFile(params: {
  tripId: string;
  tripTitle: string;
  base64: string;
}): Promise<PreparedPlanSummaryPptx> {
  const baseName = `RouteWise-${safeFilenamePart(params.tripTitle)}-${params.tripId.slice(0, 8)}`;
  const filename = `${baseName}.pptx`;

  if (Platform.OS === 'web') {
    webDownloadBase64(
      filename,
      params.base64,
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
    return { kind: 'web', filename };
  }

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const file = new File(Paths.cache, safeName);
  file.create({ overwrite: true });
  file.write(params.base64, { encoding: 'base64' });
  return { kind: 'native', uri: file.uri, filename };
}

export async function sharePreparedPlanSummaryPptx(uri: string, dialogTitle: string): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Paylaşım bu cihazda kullanılamıyor.');
  }
  await Sharing.shareAsync(uri, {
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    dialogTitle,
    UTI: 'org.openxmlformats.presentationml.presentation',
  });
}

/** PowerPoint (.pptx) — base64 içerik önbelleğe yazılıp paylaşılır. */
export async function sharePlanSummaryPptxBase64(params: {
  tripId: string;
  tripTitle: string;
  base64: string;
  dialogTitle: string;
}): Promise<void> {
  const prepared = await preparePlanSummaryPptxFile({
    tripId: params.tripId,
    tripTitle: params.tripTitle,
    base64: params.base64,
  });
  if (prepared.kind === 'web') return;
  await sharePreparedPlanSummaryPptx(prepared.uri, params.dialogTitle);
}

export async function sharePlanExportFile(params: {
  tripId: string;
  tripTitle: string;
  extension: 'csv' | 'html';
  content: string;
  mimeType: string;
  dialogTitle: string;
}): Promise<void> {
  const filename = buildPlanExportFilename(params.tripId, params.tripTitle, params.extension);

  if (Platform.OS === 'web') {
    webDownload(filename, params.content, params.mimeType);
    return;
  }

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const file = new File(Paths.cache, safeName);
  file.create({ overwrite: true });
  file.write(params.content, { encoding: 'utf8' as const });

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Paylaşım bu cihazda kullanılamıyor.');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: params.mimeType,
    dialogTitle: params.dialogTitle,
  });
}
