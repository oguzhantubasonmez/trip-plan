import type { Stop } from '../types/trip';
import type { StopPresentationWebBlock } from './stopWebEnrichment';
import { fetchPresentationWebForStop, routeOverviewStaticMapUrl } from './stopWebEnrichment';
import {
  allocateFuelTlByDay,
  computeDayTotals,
  formatDurationTr,
  type PlanSummaryExportInput,
  type PlanSummaryStopRow,
} from './planSummaryExport';

export type PlanHtmlCommentLine = {
  authorLabel: string;
  message: string;
  timeLabel: string;
};

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

function dayTotalsBlock(stops: PlanSummaryStopRow[], fuelShareTl: number): string {
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
        <div class="dt-item"><span class="dt-lbl">Durakta toplam</span><span class="dt-val">${escapeHtml(restLabel)}</span></div>
        <div class="dt-item"><span class="dt-lbl">Gün sürüşü</span><span class="dt-val">${escapeHtml(driveLabel)}</span></div>
        <div class="dt-item"><span class="dt-lbl">Gün mesafesi</span><span class="dt-val">${escapeHtml(kmLabel)}</span></div>
        <div class="dt-item dt-item-wide">
          <span class="dt-lbl">Gün masrafı</span>
          <span class="dt-val">${grandDay.toFixed(2)} ₺</span>
          ${subLine}
        </div>
      </div>
    </div>`;
}

function wholeTripTotalsBlock(rows: PlanSummaryStopRow[]): string {
  const t = computeDayTotals(rows);
  const restLabel = t.totalRestMin > 0 ? formatDurationTr(t.totalRestMin) : '—';
  const driveLabel = t.totalLegDriveMin > 0 ? formatDurationTr(t.totalLegDriveMin) : '—';
  const kmLabel =
    t.totalLegKm > 0
      ? `${t.totalLegKm.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} km`
      : '—';
  return `
    <div class="trip-totals">
      <h2 class="section-title">Rota özeti</h2>
      <div class="trip-totals-inner">
        <div class="tt-item"><span class="tt-lbl">Tüm duraklarda toplam süre</span><span class="tt-val">${escapeHtml(restLabel)}</span></div>
        <div class="tt-item"><span class="tt-lbl">Tahmini toplam sürüş</span><span class="tt-val">${escapeHtml(driveLabel)}</span></div>
        <div class="tt-item"><span class="tt-lbl">Toplam mesafe (bacaklar)</span><span class="tt-val">${escapeHtml(kmLabel)}</span></div>
      </div>
    </div>`;
}

function bulletsHtml(items: string[]): string {
  if (items.length === 0) return '<p class="muted small">—</p>';
  return `<ul class="bullet-list">${items.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`;
}

function stopCardHtml(row: PlanSummaryStopRow, web: StopPresentationWebBlock): string {
  const idx = row.routeIndex;
  const hero =
    web.heroImageUrl && web.heroImageUrl.trim()
      ? `<div class="stop-hero"><img src="${escapeAttr(web.heroImageUrl.trim())}" alt="" loading="lazy" /></div>`
      : `<div class="stop-hero stop-hero--empty" aria-hidden="true"></div>`;

  const metaRows: [string, string][] = [
    ['Varış', row.arrival ?? '—'],
    ['Ayrılış', row.departure ?? '—'],
    ['Durakta süre', row.stopRestDisplay],
    ['Masraflar', row.extrasSummary],
    ['Durak toplamı', `${row.stopTotalTl.toFixed(2)} ₺`],
    ['Önceki duraktan', row.legKm != null ? `${row.legKm} km` : '—'],
    ['Sürüş (önceki bacak)', row.legMin != null ? `${row.legMin} dk` : '—'],
  ];
  const metaHtml = metaRows
    .map(
      ([k, v]) =>
        `<div class="meta-row"><span class="meta-k">${escapeHtml(k)}</span><span class="meta-v">${escapeHtml(v)}</span></div>`
    )
    .join('');

  const summaryBlock =
    web.summaryBullets.length > 0 || web.summarySourceLine
      ? `<section class="block">
          <h5 class="block-title">Özet</h5>
          ${bulletsHtml(web.summaryBullets)}
          ${
            web.summarySourceLine
              ? `<p class="src-line">${escapeHtml(web.summarySourceLine)}${
                  web.summarySourceUrl
                    ? ` · <a href="${escapeAttr(web.summarySourceUrl)}" rel="noopener noreferrer">Kaynak</a>`
                    : ''
                }</p>`
              : ''
          }
        </section>`
      : `<section class="block"><h5 class="block-title">Özet</h5><p class="muted small">Bu durak için özet üretilemedi.</p></section>`;

  const reviewBlock =
    web.reviewBullets.length > 0
      ? `<section class="block">
          <h5 class="block-title">Yorumlar</h5>
          ${bulletsHtml(web.reviewBullets)}
          ${
            web.reviewSourceLine
              ? `<p class="src-line">${escapeHtml(web.reviewSourceLine)}</p>`
              : ''
          }
        </section>`
      : '';

  return `
  <article class="stop-card" id="durak-${idx}">
    ${hero}
    <div class="stop-body">
      <p class="stop-kicker">Durak ${idx}</p>
      <h4 class="stop-title">${escapeHtml(row.name)}</h4>
      <div class="stop-meta-grid">${metaHtml}</div>
      ${summaryBlock}
      ${reviewBlock}
    </div>
  </article>`;
}

/**
 * Rota sunumuna benzer dikey HTML: üstte genel özet, günler, her durakta görsel + bilgi + özet + yorumlar, altta masraf türleri ve rota yorumları.
 */
export function buildPlanSummaryPresentationHtml(params: {
  input: PlanSummaryExportInput;
  enrichments: StopPresentationWebBlock[];
  comments: PlanHtmlCommentLine[];
  /** Rota haritası — statik görsel (HTML üstü). */
  routeMapImageUrl?: string | null;
}): string {
  const { input, enrichments, comments, routeMapImageUrl } = params;
  const title = escapeHtml(input.tripTitle);
  const fuelShareByDay = allocateFuelTlByDay(input.dayGroups, input.fuelTl);

  const enrichmentAt = (routeIndex: number): StopPresentationWebBlock => {
    const i = routeIndex - 1;
    return (
      enrichments[i] ?? {
        summaryBullets: [],
        summarySourceLine: '',
        reviewBullets: [],
        reviewSourceLine: '',
        heroImageUrl: undefined,
        fromGooglePlaces: false,
      }
    );
  };

  const daySections = input.dayGroups
    .map((g, dayIdx) => {
      const cards = g.stops.map((row) => stopCardHtml(row, enrichmentAt(row.routeIndex))).join('\n');
      return `
  <section class="day-block">
    <h3 class="day-heading">${escapeHtml(g.dayLabel)}</h3>
    ${dayTotalsBlock(g.stops, fuelShareByDay[dayIdx] ?? 0)}
    <div class="stop-stack">${cards}</div>
  </section>`;
    })
    .join('\n');

  const catRows =
    input.extraByCategory.length > 0
      ? input.extraByCategory
          .map(
            (c) =>
              `<tr><td>${escapeHtml(c.name)}</td><td class="num">${c.total.toFixed(2)} ₺</td></tr>`
          )
          .join('')
      : '<tr><td colspan="2" class="muted">Ekstra masraf yok</td></tr>';

  const commentsHtml =
    comments.length === 0
      ? '<p class="muted small">Henüz rota yorumu yok.</p>'
      : comments
          .map(
            (c) => `
    <div class="comment-card">
      <div class="comment-head"><strong>${escapeHtml(c.authorLabel)}</strong><span class="comment-time">${escapeHtml(c.timeLabel)}</span></div>
      <p class="comment-msg">${escapeHtml(c.message)}</p>
    </div>`
          )
          .join('');

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
      padding: 24px 16px 56px;
    }
    .wrap { max-width: 640px; margin: 0 auto; }
    .notice {
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 14px;
      padding: 12px 14px;
      font-size: 0.88rem;
      line-height: 1.45;
      color: #bae6fd;
      margin-bottom: 18px;
    }
    .hero {
      background: linear-gradient(135deg, rgba(14, 165, 233, 0.22), rgba(59, 130, 246, 0.1));
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 20px;
      padding: 22px 24px;
      margin-bottom: 18px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.35);
    }
    .brand { font-size: 12px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #38bdf8; margin-bottom: 6px; }
    h1 { margin: 0; font-size: 1.5rem; font-weight: 900; letter-spacing: -0.02em; color: #f8fafc; }
    .meta { margin-top: 14px; display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px 14px; font-size: 0.88rem; color: #cbd5e1; }
    .meta strong { display: block; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; margin-bottom: 2px; }
    .totals {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 10px;
      margin-bottom: 16px;
    }
    .card {
      background: rgba(30, 41, 59, 0.85);
      border: 1px solid rgba(148, 163, 184, 0.18);
      border-radius: 14px;
      padding: 12px 14px;
    }
    .card .lbl { font-size: 0.72rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
    .card .val { font-size: 1.15rem; font-weight: 800; margin-top: 6px; color: #f1f5f9; }
    .card.total { border-color: rgba(56, 189, 248, 0.45); background: rgba(14, 165, 233, 0.1); }
    .card.total .val { color: #7dd3fc; }
    .section-title { font-size: 1rem; font-weight: 800; margin: 0 0 10px; color: #e2e8f0; }
    .trip-totals {
      margin-bottom: 28px;
      padding: 14px 16px;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(148, 163, 184, 0.15);
      border-radius: 16px;
    }
    .trip-totals-inner { display: grid; gap: 10px; }
    .tt-item { display: flex; flex-direction: column; gap: 4px; }
    .tt-lbl { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #94a3b8; }
    .tt-val { font-size: 0.95rem; font-weight: 800; color: #e0f2fe; }
    .day-block { margin-bottom: 36px; }
    .day-heading {
      font-size: 1.15rem;
      font-weight: 800;
      color: #7dd3fc;
      margin: 0 0 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(56, 189, 248, 0.3);
    }
    .day-totals {
      margin: 0 0 16px 0;
      padding: 12px 14px;
      background: rgba(14, 165, 233, 0.08);
      border: 1px solid rgba(56, 189, 248, 0.22);
      border-radius: 12px;
    }
    .day-totals-inner {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 10px 14px;
      font-size: 0.8rem;
    }
    .dt-item { display: flex; flex-direction: column; gap: 4px; }
    .dt-item-wide { grid-column: 1 / -1; }
    .dt-lbl { color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; font-size: 0.65rem; }
    .dt-val { color: #e0f2fe; font-weight: 800; font-size: 0.9rem; }
    .dt-sub { display: block; margin-top: 4px; font-size: 0.7rem; font-weight: 600; color: #94a3b8; line-height: 1.35; }
    .stop-stack { display: flex; flex-direction: column; gap: 22px; }
    .stop-card {
      background: rgba(15, 23, 42, 0.75);
      border: 1px solid rgba(148, 163, 184, 0.18);
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 12px 32px rgba(0,0,0,0.25);
    }
    .stop-hero { width: 100%; aspect-ratio: 16 / 9; background: #0f172a; }
    .stop-hero img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .stop-hero--empty {
      background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%);
    }
    .stop-body { padding: 16px 18px 18px; }
    .stop-kicker { margin: 0 0 4px; font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #38bdf8; }
    .stop-title { margin: 0 0 12px; font-size: 1.2rem; font-weight: 800; color: #f8fafc; }
    .stop-meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; margin-bottom: 14px; font-size: 0.82rem; }
    .meta-row { display: flex; flex-direction: column; gap: 2px; }
    .meta-k { color: #94a3b8; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
    .meta-v { color: #e2e8f0; font-weight: 600; }
    .block { margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(148, 163, 184, 0.12); }
    .block-title { margin: 0 0 8px; font-size: 0.78rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; }
    .bullet-list { margin: 0; padding-left: 1.15rem; color: #cbd5e1; line-height: 1.5; font-size: 0.9rem; }
    .bullet-list li { margin-bottom: 6px; }
    .src-line { margin: 8px 0 0; font-size: 0.78rem; color: #94a3b8; line-height: 1.4; }
    .src-line a { color: #7dd3fc; }
    .muted { color: #94a3b8; }
    .small { font-size: 0.85rem; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .table-wrap { overflow-x: auto; border-radius: 14px; border: 1px solid rgba(148, 163, 184, 0.15); margin-top: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.86rem; background: rgba(15, 23, 42, 0.65); }
    th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid rgba(148, 163, 184, 0.12); }
    th { background: rgba(30, 41, 59, 0.95); font-weight: 800; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; color: #94a3b8; }
    tr:last-child td { border-bottom: none; }
    .cat { margin-top: 32px; }
    .comments-section { margin-top: 32px; }
    .comment-card {
      background: rgba(30, 41, 59, 0.5);
      border: 1px solid rgba(148, 163, 184, 0.12);
      border-radius: 12px;
      padding: 12px 14px;
      margin-bottom: 10px;
    }
    .comment-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 6px; font-size: 0.88rem; }
    .comment-time { font-size: 0.75rem; color: #94a3b8; }
    .comment-msg { margin: 0; font-size: 0.9rem; line-height: 1.45; color: #e2e8f0; white-space: pre-wrap; }
    .foot { margin-top: 32px; font-size: 0.78rem; color: #64748b; text-align: center; }
    .route-map-figure {
      margin: 0 0 20px;
      border-radius: 18px;
      overflow: hidden;
      border: 1px solid rgba(56, 189, 248, 0.28);
      box-shadow: 0 16px 40px rgba(0,0,0,0.35);
      background: #0f172a;
    }
    .route-map-figure figcaption {
      margin: 0;
      padding: 10px 14px;
      font-size: 0.72rem;
      font-weight: 700;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      background: rgba(15, 23, 42, 0.95);
      border-top: 1px solid rgba(148, 163, 184, 0.12);
    }
    .route-map-img {
      width: 100%;
      display: block;
      aspect-ratio: 16 / 9;
      object-fit: cover;
      vertical-align: middle;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <p class="notice">Bu sayfa rota sunumuna benzer şekilde üretildi: her durak için Wikipedia / Google verileri çevrimiçi alınmış olabilir. Görseller harici sunuculardan yüklenir.</p>
    ${
      routeMapImageUrl && String(routeMapImageUrl).trim()
        ? `<figure class="route-map-figure">
      <img class="route-map-img" src="${escapeAttr(String(routeMapImageUrl).trim())}" alt="Rota haritası — duraklar arası hat" loading="eager" />
      <figcaption>Rota haritası (özet)</figcaption>
    </figure>`
        : ''
    }
    <header class="hero">
      <div class="brand">RouteWise</div>
      <h1>${title}</h1>
      <div class="meta">
        <div><strong>Plan</strong>${escapeHtml(input.scheduleLine)}</div>
        ${input.vehicleLabel ? `<div><strong>Araç</strong>${escapeHtml(input.vehicleLabel)}</div>` : ''}
        <div><strong>Mesafe</strong>${escapeHtml(input.kmLine)}</div>
        <div><strong>Sürüş süresi</strong>${escapeHtml(input.durationLine)}</div>
        <div><strong>Durak sayısı</strong>${input.stopCount}</div>
      </div>
    </header>
    <div class="totals">
      <div class="card"><div class="lbl">Ekstra</div><div class="val">${input.extraTl.toFixed(2)} ₺</div></div>
      <div class="card"><div class="lbl">Yakıt</div><div class="val">${input.fuelTl.toFixed(2)} ₺</div></div>
      <div class="card total"><div class="lbl">Toplam</div><div class="val">${input.grandTl.toFixed(2)} ₺</div></div>
    </div>
    ${
      input.perPersonTl != null && input.goingCount > 0
        ? `<p style="margin:0 0 18px;color:#cbd5e1;font-size:0.9rem;">Kişi başı (${input.goingCount} katılıyor): <strong style="color:#7dd3fc">${input.perPersonTl.toFixed(2)} ₺</strong></p>`
        : ''
    }
    ${wholeTripTotalsBlock(input.stops)}
    ${daySections}
    <section class="cat">
      <h2 class="section-title">Masraf türleri</h2>
      <div class="table-wrap">
        <table><thead><tr><th>Tür</th><th class="num">Toplam</th></tr></thead><tbody>${catRows}</tbody></table>
      </div>
    </section>
    <section class="comments-section">
      <h2 class="section-title">Rota yorumları</h2>
      ${commentsHtml}
    </section>
    <p class="foot">Dışa aktarım: ${escapeHtml(input.exportedAt)} · RouteWise</p>
  </div>
</body>
</html>`;
}

/** Wikipedia / Nominatim / Places ile çakışmayı azaltmak için eşzamanlı istek üst sınırı. */
const PLAN_HTML_ENRICH_CONCURRENCY = 4;

/**
 * Her durak için sunum zenginleştirmesini çeker (ağ istekleri).
 * Sıralı yerine sınırlı paralellik: uzun rotalarda süre belirgin şekilde kısalır.
 */
export async function enrichStopsForPlanPresentationHtml(
  routeOrderedStops: Stop[],
  rows: PlanSummaryStopRow[],
  onProgress?: (done: number, total: number) => void
): Promise<StopPresentationWebBlock[]> {
  const n = routeOrderedStops.length;
  const out: StopPresentationWebBlock[] = new Array(n);
  let completed = 0;
  const bump = () => {
    completed += 1;
    onProgress?.(completed, n);
  };

  let nextIndex = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = nextIndex++;
      if (i >= n) return;
      const stop = routeOrderedStops[i]!;
      const row = rows[i]!;
      try {
        out[i] = await fetchPresentationWebForStop(stop, row);
      } catch {
        out[i] = {
          summaryBullets: [],
          summarySourceLine: '',
          reviewBullets: [],
          reviewSourceLine: '',
          fromGooglePlaces: false,
        };
      }
      bump();
    }
  }

  const pool = Math.min(PLAN_HTML_ENRICH_CONCURRENCY, Math.max(1, n));
  await Promise.all(Array.from({ length: pool }, () => worker()));
  return out;
}

export async function buildPlanSummaryPresentationHtmlAsync(params: {
  input: PlanSummaryExportInput;
  routeOrderedStops: Stop[];
  comments: PlanHtmlCommentLine[];
  onProgress?: (done: number, total: number) => void;
}): Promise<string> {
  const routeMapImageUrl = routeOverviewStaticMapUrl(params.routeOrderedStops, 640, 360);
  const enrichments = await enrichStopsForPlanPresentationHtml(
    params.routeOrderedStops,
    params.input.stops,
    params.onProgress
  );
  return buildPlanSummaryPresentationHtml({
    input: params.input,
    enrichments,
    comments: params.comments,
    routeMapImageUrl,
  });
}
