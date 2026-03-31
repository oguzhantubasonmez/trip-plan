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
function allocateFuelTlByDay(
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

export function buildPlanSummaryHtml(input: PlanSummaryExportInput): string {
  const title = escapeHtml(input.tripTitle);
  const fuelShareByDay = allocateFuelTlByDay(input.dayGroups, input.fuelTl);

  const rowsHtml = (rows: PlanSummaryStopRow[]) =>
    rows
      .map(
        (s) => `
    <tr>
      <td>${s.routeIndex}</td>
      <td>${escapeHtml(s.name)}</td>
      <td class="muted">${escapeHtml(s.arrival ?? '—')}</td>
      <td class="muted">${escapeHtml(s.departure ?? '—')}</td>
      <td class="num muted">${escapeHtml(s.stopRestDisplay)}</td>
      <td>${escapeHtml(s.extrasSummary)}</td>
      <td class="num">${s.stopTotalTl.toFixed(2)} ₺</td>
      <td class="num muted">${s.legKm != null ? `${s.legKm} km` : '—'}</td>
      <td class="num muted">${s.legMin != null ? `${s.legMin} dk` : '—'}</td>
    </tr>`
      )
      .join('');

  const dayTotalsHtml = (stops: PlanSummaryStopRow[], fuelShareTl: number) => {
    const t = computeDayTotals(stops);
    const restLabel = t.totalRestMin > 0 ? formatDurationTr(t.totalRestMin) : '—';
    const driveLabel = t.totalLegDriveMin > 0 ? formatDurationTr(t.totalLegDriveMin) : '—';
    const kmLabel =
      t.totalLegKm > 0
        ? `${t.totalLegKm.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} km`
        : '—';
    const fuelPart = Math.round(fuelShareTl * 100) / 100;
    const grandDay = Math.round((t.totalExpenseTl + fuelPart) * 100) / 100;
    const subLine =
      fuelPart > 0
        ? `<span class="dt-sub">Duraklar ${t.totalExpenseTl.toFixed(2)} ₺ · Yakıt payı ${fuelPart.toFixed(2)} ₺</span>`
        : '';
    return `
    <div class="day-totals">
      <div class="day-totals-inner">
        <div class="dt-item"><span class="dt-lbl">Toplam dinlenme (durakta)</span><span class="dt-val">${escapeHtml(restLabel)}</span></div>
        <div class="dt-item"><span class="dt-lbl">Toplam sürüş</span><span class="dt-val">${escapeHtml(driveLabel)}</span></div>
        <div class="dt-item"><span class="dt-lbl">Toplam mesafe</span><span class="dt-val">${escapeHtml(kmLabel)}</span></div>
        <div class="dt-item dt-item-wide">
          <span class="dt-lbl">Toplam masraf</span>
          <span class="dt-val">${grandDay.toFixed(2)} ₺</span>
          ${subLine}
        </div>
      </div>
    </div>`;
  };

  const daySections = input.dayGroups
    .map(
      (g, dayIdx) => `
  <section class="day">
    <h3>${escapeHtml(g.dayLabel)}</h3>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Durak</th>
            <th>Varış</th>
            <th>Ayrılış</th>
            <th>Durakta süre</th>
            <th>Masraflar</th>
            <th>Toplam</th>
            <th>Önceki duraktan<br/><span class="th-sub">km</span></th>
            <th>Önceki duraktan<br/><span class="th-sub">dk</span></th>
          </tr>
        </thead>
        <tbody>${rowsHtml(g.stops)}</tbody>
      </table>
    </div>
    ${dayTotalsHtml(g.stops, fuelShareByDay[dayIdx] ?? 0)}
  </section>`
    )
    .join('');

  const catRows =
    input.extraByCategory.length > 0
      ? input.extraByCategory
          .map(
            (c) =>
              `<tr><td>${escapeHtml(c.name)}</td><td class="num">${c.total.toFixed(2)} ₺</td></tr>`
          )
          .join('')
      : '<tr><td colspan="2" class="muted">Ekstra masraf yok</td></tr>';

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>RouteWise · ${title}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(165deg, #0f172a 0%, #1e293b 40%, #0b1220 100%);
      color: #e2e8f0;
      min-height: 100vh;
      padding: 24px 16px 48px;
    }
    .wrap { max-width: 920px; margin: 0 auto; }
    .hero {
      background: linear-gradient(135deg, rgba(14, 165, 233, 0.25), rgba(59, 130, 246, 0.12));
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 20px;
      padding: 22px 24px;
      margin-bottom: 20px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.35);
    }
    .brand { font-size: 12px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #38bdf8; margin-bottom: 6px; }
    h1 { margin: 0; font-size: 1.55rem; font-weight: 900; letter-spacing: -0.02em; color: #f8fafc; }
    .meta { margin-top: 14px; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px 16px; font-size: 0.9rem; color: #cbd5e1; }
    .meta strong { display: block; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; margin-bottom: 2px; }
    .totals {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin-bottom: 22px;
    }
    .card {
      background: rgba(30, 41, 59, 0.85);
      border: 1px solid rgba(148, 163, 184, 0.18);
      border-radius: 14px;
      padding: 14px 16px;
    }
    .card .lbl { font-size: 0.75rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
    .card .val { font-size: 1.25rem; font-weight: 800; margin-top: 6px; color: #f1f5f9; }
    .card.total { border-color: rgba(56, 189, 248, 0.45); background: rgba(14, 165, 233, 0.12); }
    .card.total .val { color: #7dd3fc; }
    section.day { margin-bottom: 28px; }
    section.day h3 {
      font-size: 1.05rem;
      font-weight: 800;
      color: #bae6fd;
      margin: 0 0 8px 2px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.25);
      padding-bottom: 8px;
    }
    .day-totals {
      margin: 0 0 12px 0;
      padding: 12px 14px;
      background: rgba(14, 165, 233, 0.08);
      border: 1px solid rgba(56, 189, 248, 0.22);
      border-radius: 12px;
    }
    .day-totals-inner {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 10px 16px;
      font-size: 0.82rem;
    }
    .dt-item { display: flex; flex-direction: column; gap: 4px; }
    .dt-item-wide { grid-column: 1 / -1; }
    .dt-lbl { color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; font-size: 0.68rem; }
    .dt-val { color: #e0f2fe; font-weight: 800; font-size: 0.95rem; }
    .dt-sub { display: block; margin-top: 4px; font-size: 0.72rem; font-weight: 600; color: #94a3b8; line-height: 1.35; }
    th .th-sub { font-weight: 700; opacity: 0.85; text-transform: lowercase; letter-spacing: 0; }
    .table-wrap { overflow-x: auto; border-radius: 14px; border: 1px solid rgba(148, 163, 184, 0.15); }
    table { width: 100%; border-collapse: collapse; font-size: 0.88rem; background: rgba(15, 23, 42, 0.65); }
    th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid rgba(148, 163, 184, 0.12); vertical-align: top; }
    th {
      background: rgba(30, 41, 59, 0.95);
      font-weight: 800;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #94a3b8;
    }
    tr:last-child td { border-bottom: none; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .muted { color: #94a3b8; }
    .foot { margin-top: 28px; font-size: 0.8rem; color: #64748b; text-align: center; }
    .cat { margin-top: 24px; }
    .cat h2 { font-size: 1rem; margin: 0 0 10px; color: #e2e8f0; }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="hero">
      <div class="brand">RouteWise</div>
      <h1>${title}</h1>
      <div class="meta">
        <div><strong>Plan</strong>${escapeHtml(input.scheduleLine)}</div>
        ${input.vehicleLabel ? `<div><strong>Araç</strong>${escapeHtml(input.vehicleLabel)}</div>` : ''}
        <div><strong>Mesafe</strong>${escapeHtml(input.kmLine)}</div>
        <div><strong>Sürüş süresi</strong>${escapeHtml(input.durationLine)}</div>
        <div><strong>Durak</strong>${input.stopCount}</div>
      </div>
    </header>
    <div class="totals">
      <div class="card"><div class="lbl">Ekstra</div><div class="val">${input.extraTl.toFixed(2)} ₺</div></div>
      <div class="card"><div class="lbl">Yakıt</div><div class="val">${input.fuelTl.toFixed(2)} ₺</div></div>
      <div class="card total"><div class="lbl">Toplam</div><div class="val">${input.grandTl.toFixed(2)} ₺</div></div>
    </div>
    ${
      input.perPersonTl != null && input.goingCount > 0
        ? `<p style="margin:0 0 20px;color:#cbd5e1;font-size:0.95rem;">Kişi başı (${input.goingCount} katılıyor): <strong style="color:#7dd3fc">${input.perPersonTl.toFixed(2)} ₺</strong></p>`
        : ''
    }
    ${daySections}
    <section class="cat">
      <h2>Masraf türleri</h2>
      <div class="table-wrap">
        <table><thead><tr><th>Tür</th><th class="num">Toplam</th></tr></thead><tbody>${catRows}</tbody></table>
      </div>
    </section>
    <p class="foot">Dışa aktarım: ${escapeHtml(input.exportedAt)} · RouteWise</p>
  </div>
</body>
</html>`;
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
  const baseName = `RouteWise-${safeFilenamePart(params.tripTitle)}-${params.tripId.slice(0, 8)}`;
  const filename = `${baseName}.${params.extension}`;

  if (Platform.OS === 'web') {
    webDownload(filename, params.content, params.mimeType);
    return;
  }

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const file = new File(Paths.cache, safeName);
  file.create({ overwrite: true });
  file.write(params.content, { encoding: 'utf8' });

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Paylaşım bu cihazda kullanılamıyor.');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: params.mimeType,
    dialogTitle: params.dialogTitle,
  });
}
