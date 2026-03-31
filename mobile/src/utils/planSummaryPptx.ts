import pptxgen from 'pptxgenjs';
import type { Stop } from '../types/trip';
import type { PlanSummaryExportInput } from './planSummaryExport';
import { computeDayTotals, formatDurationTr } from './planSummaryExport';
import type { PptxStopWebBlock } from './stopWebEnrichment';

const BG = '0F172A';
const ACCENT = '38BDF8';
const TEXT = 'F1F5F9';
const MUTED = '94A3B8';

/**
 * PowerPoint (.pptx) — özet, durak başına slayt (plan + Wikipedia/OSM özeti), ipuçları.
 * `stopWebByRouteIndex`: `routeIndex` → web maddeleri; `routeStops` ile `input.stops` aynı sırada olmalı.
 */
export async function buildPlanSummaryPptxBase64(
  input: PlanSummaryExportInput,
  insightLines: string[],
  stopWebByRouteIndex: Record<number, PptxStopWebBlock>,
  routeStops: Stop[]
): Promise<string> {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'RouteWise';
  pptx.title = input.tripTitle;
  pptx.subject = 'Plan özeti';
  pptx.company = 'RouteWise';

  const masterBg = { color: BG };

  const addTitleSlide = () => {
    const slide = pptx.addSlide();
    slide.background = masterBg;
    slide.addText('RouteWise', {
      x: 0.5,
      y: 0.45,
      w: 9,
      h: 0.45,
      fontSize: 13,
      color: ACCENT,
      fontFace: 'Arial',
      bold: true,
    });
    slide.addText(input.tripTitle, {
      x: 0.5,
      y: 1,
      w: 9,
      h: 1.2,
      fontSize: 32,
      color: TEXT,
      fontFace: 'Arial',
      bold: true,
    });
    slide.addText(input.scheduleLine, {
      x: 0.5,
      y: 2.35,
      w: 9,
      h: 0.55,
      fontSize: 15,
      color: MUTED,
      fontFace: 'Arial',
    });
    const meta = [
      input.vehicleLabel ? `Araç: ${input.vehicleLabel}` : null,
      `Mesafe: ${input.kmLine}`,
      `Sürüş: ${input.durationLine}`,
      `Durak: ${input.stopCount}`,
    ]
      .filter(Boolean)
      .join('   ·   ');
    slide.addText(meta, {
      x: 0.5,
      y: 3.05,
      w: 9,
      h: 0.9,
      fontSize: 13,
      color: MUTED,
      fontFace: 'Arial',
    });
    slide.addText(`Dışa aktarım: ${input.exportedAt}`, {
      x: 0.5,
      y: 4.95,
      w: 9,
      h: 0.35,
      fontSize: 10,
      color: MUTED,
      fontFace: 'Arial',
    });
  };

  const addSectionSlide = (title: string, subtitle?: string) => {
    const slide = pptx.addSlide();
    slide.background = masterBg;
    slide.addText(title, {
      x: 0.5,
      y: 1.35,
      w: 9,
      h: 1,
      fontSize: 28,
      color: TEXT,
      fontFace: 'Arial',
      bold: true,
    });
    if (subtitle) {
      slide.addText(subtitle, {
        x: 0.5,
        y: 2.45,
        w: 9,
        h: 0.6,
        fontSize: 14,
        color: MUTED,
        fontFace: 'Arial',
      });
    }
  };

  const addBulletSlide = (title: string, bullets: string[]) => {
    const slide = pptx.addSlide();
    slide.background = masterBg;
    slide.addText(title, {
      x: 0.5,
      y: 0.35,
      w: 9,
      h: 0.55,
      fontSize: 20,
      color: ACCENT,
      fontFace: 'Arial',
      bold: true,
    });
    slide.addText(
      bullets.map((b) => ({ text: b, options: { bullet: true } })),
      {
        x: 0.55,
        y: 1.05,
        w: 9,
        h: 4.5,
        fontSize: 13,
        color: TEXT,
        fontFace: 'Arial',
        valign: 'top',
      }
    );
  };

  const addStopDetailSlide = (
    row: PlanSummaryExportInput['stops'][0],
    stop: Stop | undefined,
    web: PptxStopWebBlock | undefined
  ) => {
    const slide = pptx.addSlide();
    slide.background = masterBg;
    slide.addText(`Durak ${row.routeIndex}`, {
      x: 0.5,
      y: 0.28,
      w: 9,
      h: 0.32,
      fontSize: 12,
      color: MUTED,
      fontFace: 'Arial',
      bold: true,
    });
    slide.addText(row.name, {
      x: 0.5,
      y: 0.52,
      w: 9,
      h: 0.78,
      fontSize: 22,
      color: TEXT,
      fontFace: 'Arial',
      bold: true,
    });
    slide.addText(
      `${row.dayLabel} · Varış ${row.arrival ?? '—'} – Ayrılış ${row.departure ?? '—'} · Durakta ${row.stopRestDisplay}`,
      {
        x: 0.5,
        y: 1.28,
        w: 9,
        h: 0.42,
        fontSize: 11,
        color: MUTED,
        fontFace: 'Arial',
      }
    );
    slide.addText('Plandaki bilgiler', {
      x: 0.5,
      y: 1.78,
      w: 9,
      h: 0.32,
      fontSize: 12,
      color: ACCENT,
      fontFace: 'Arial',
      bold: true,
    });
    const planBullets: string[] = [
      `Masraflar: ${row.extrasSummary} — durak toplamı ${row.stopTotalTl.toFixed(2)} ₺`,
    ];
    if (row.legKm != null || row.legMin != null) {
      planBullets.push(
        `Önceki duraktan: ${row.legKm != null ? `${row.legKm} km` : '—'}${row.legMin != null ? `, ${row.legMin} dk` : ''}`
      );
    }
    if (stop?.placeRating != null && stop.placeRating > 0) {
      planBullets.push(
        `Google puanı: ${stop.placeRating.toFixed(1)}${
          stop.placeUserRatingsTotal != null && stop.placeUserRatingsTotal > 0
            ? ` (${stop.placeUserRatingsTotal} değerlendirme)`
            : ''
        }`
      );
    }
    slide.addText(
      planBullets.map((t) => ({ text: t, options: { bullet: true } })),
      {
        x: 0.55,
        y: 2.08,
        w: 8.9,
        h: 1.05,
        fontSize: 11,
        color: TEXT,
        fontFace: 'Arial',
        valign: 'top',
      }
    );

    const webBlock = web ?? { bullets: [], sourceLine: '', url: undefined };
    const webBullets =
      webBlock.bullets.length > 0
        ? webBlock.bullets
        : [
            'Bu durak için Wikipedia veya OpenStreetMap üzerinden otomatik özet bulunamadı. Yer adını netleştirin veya haritadan konum ekleyin.',
          ];
    slide.addText('Web’den otomatik özet', {
      x: 0.5,
      y: 3.2,
      w: 9,
      h: 0.3,
      fontSize: 12,
      color: ACCENT,
      fontFace: 'Arial',
      bold: true,
    });
    slide.addText(
      webBullets.map((t) => ({ text: t, options: { bullet: true } })),
      {
        x: 0.55,
        y: 3.48,
        w: 8.9,
        h: 1.35,
        fontSize: 10,
        color: TEXT,
        fontFace: 'Arial',
        valign: 'top',
      }
    );
    const foot =
      webBlock.bullets.length > 0 && webBlock.sourceLine
        ? `${webBlock.sourceLine}${webBlock.url ? `\n${webBlock.url}` : ''}`
        : webBlock.bullets.length > 0
          ? webBlock.url || ''
          : 'Kaynak: otomatik arama sonucu yok';
    slide.addText(foot, {
      x: 0.5,
      y: 4.95,
      w: 9,
      h: 0.55,
      fontSize: 9,
      color: MUTED,
      fontFace: 'Arial',
    });
  };

  addTitleSlide();

  addSectionSlide('Plan özeti', 'Maliyet ve genel bilgiler');

  const summarySlide = pptx.addSlide();
  summarySlide.background = masterBg;
  summarySlide.addText('Özet rakamlar', {
    x: 0.5,
    y: 0.35,
    w: 9,
    h: 0.5,
    fontSize: 20,
    color: ACCENT,
    fontFace: 'Arial',
    bold: true,
  });
  const summaryRows = [
    [{ text: 'Ekstra masraflar' }, { text: `${input.extraTl.toFixed(2)} ₺` }],
    [{ text: 'Yakıt' }, { text: `${input.fuelTl.toFixed(2)} ₺` }],
    [{ text: 'Toplam' }, { text: `${input.grandTl.toFixed(2)} ₺` }],
  ];
  if (input.perPersonTl != null && input.goingCount > 0) {
    summaryRows.push([
      { text: 'Kişi başı' },
      { text: `${input.perPersonTl.toFixed(2)} ₺ (${input.goingCount} katılıyor)` },
    ]);
  }
  summarySlide.addTable(summaryRows, {
    x: 0.5,
    y: 1,
    w: 6.2,
    colW: [3.4, 2.8],
    fontSize: 13,
    border: { type: 'solid', color: '334155', pt: 1 },
    fill: { color: '1E293B' },
    color: TEXT,
    align: 'left',
    valign: 'middle',
  });

  const totals = computeDayTotals(input.stops);
  const wholeTripLine = [
    totals.totalLegKm > 0 ? `Toplam mesafe (bacak): ${totals.totalLegKm} km` : null,
    totals.totalLegDriveMin > 0 ? `Toplam sürüş: ${formatDurationTr(totals.totalLegDriveMin)}` : null,
    totals.totalRestMin > 0 ? `Duraklarda toplam: ${formatDurationTr(totals.totalRestMin)}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  if (wholeTripLine) {
    summarySlide.addText(wholeTripLine, {
      x: 0.5,
      y: 3.15,
      w: 9,
      h: 1.1,
      fontSize: 12,
      color: MUTED,
      fontFace: 'Arial',
    });
  }

  addSectionSlide('Duraklar', 'Her slayt bir durak — plan verisi + Wikipedia / OSM özeti');
  const overviewLines = input.stops.map((s) => `${s.routeIndex}. ${s.name} (${s.dayLabel})`);
  const maxOverview = 14;
  for (let i = 0; i < overviewLines.length; i += maxOverview) {
    const chunk = overviewLines.slice(i, i + maxOverview);
    const totalParts = Math.max(1, Math.ceil(overviewLines.length / maxOverview));
    const part = Math.floor(i / maxOverview) + 1;
    const title =
      overviewLines.length > maxOverview ? `Güzergâh listesi (${part}/${totalParts})` : 'Güzergâh listesi';
    addBulletSlide(title, chunk);
  }

  for (let i = 0; i < input.stops.length; i++) {
    const row = input.stops[i]!;
    const stop = routeStops[i];
    const web = stopWebByRouteIndex[row.routeIndex];
    addStopDetailSlide(row, stop, web);
  }

  if (input.extraByCategory.length > 0) {
    const slide = pptx.addSlide();
    slide.background = masterBg;
    slide.addText('Masraf türleri', {
      x: 0.5,
      y: 0.35,
      w: 9,
      h: 0.5,
      fontSize: 20,
      color: ACCENT,
      fontFace: 'Arial',
      bold: true,
    });
    const rows = [
      [{ text: 'Tür' }, { text: 'Toplam (₺)' }],
      ...input.extraByCategory.map((c) => [{ text: c.name }, { text: c.total.toFixed(2) }]),
    ];
    slide.addTable(rows, {
      x: 0.5,
      y: 1,
      w: 7,
      colW: [4.2, 2.8],
      fontSize: 12,
      border: { type: 'solid', color: '334155', pt: 1 },
      fill: { color: '1E293B' },
      color: TEXT,
      align: 'left',
      valign: 'middle',
    });
  }

  const insights = insightLines.length > 0 ? insightLines : ['Keyifli ve güvenli yolculuklar!'];
  const maxInsightPerSlide = 8;
  for (let i = 0; i < insights.length; i += maxInsightPerSlide) {
    const chunk = insights.slice(i, i + maxInsightPerSlide);
    const label =
      insights.length > maxInsightPerSlide
        ? `İpuçları ve öneriler (${Math.floor(i / maxInsightPerSlide) + 1})`
        : 'İpuçları ve öneriler';
    addBulletSlide(label, chunk);
  }

  const last = pptx.addSlide();
  last.background = masterBg;
  last.addText('RouteWise', {
    x: 0.5,
    y: 1.85,
    w: 9,
    h: 0.55,
    fontSize: 22,
    color: ACCENT,
    fontFace: 'Arial',
    bold: true,
  });
  last.addText('İyi yolculuklar!', {
    x: 0.5,
    y: 2.55,
    w: 9,
    h: 0.6,
    fontSize: 28,
    color: TEXT,
    fontFace: 'Arial',
    bold: true,
  });
  last.addText(
    'Bu sunum uygulama verilerinizle otomatik oluşturuldu. Durak özetleri Wikipedia ve OpenStreetMap (Nominatim) kaynaklarından çekilir; ağ ve platforma bağlıdır. Hava özeti Open-Meteo verisine dayanır.',
    {
      x: 0.5,
      y: 3.35,
      w: 9,
      h: 1,
      fontSize: 12,
      color: MUTED,
      fontFace: 'Arial',
    }
  );

  const out = await pptx.write({ outputType: 'base64', compression: true });
  if (typeof out !== 'string' || !out.length) {
    throw new Error('PowerPoint oluşturulamadı.');
  }
  return out;
}
