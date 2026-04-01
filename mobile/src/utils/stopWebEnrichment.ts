import { Platform } from 'react-native';
import { fetchPlacePresentationRich, findPlaceIdFromTextQuery } from '../services/places';
import type { Stop } from '../types/trip';
import type { PlanSummaryStopRow } from './planSummaryExport';
import { getGoogleMapsApiKey } from './googleMapsApiKey';

const NOMINATIM_UA = 'RouteWise/1.0 (trip export; https://expo.dev)';

/**
 * Wikimedia Policy: https://foundation.wikimedia.org/wiki/Policy:User-Agent_policy
 * Tarayıcı kendi UA’sını gönderir; React Native (OkHttp) genelde yetersiz kalır ve REST/API 403 vb. dönebilir.
 */
const WIKIPEDIA_UA = 'RouteWise/1.0 (https://expo.dev; rota planlayıcı; Android iOS Web)';

const wikiRequestInit: RequestInit = {
  headers: {
    'User-Agent': WIKIPEDIA_UA,
    'Api-User-Agent': WIKIPEDIA_UA,
    Accept: 'application/json',
  },
};

export type PptxStopWebBlock = {
  bullets: string[];
  sourceLine: string;
  url?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(url: string, timeoutMs: number, init?: RequestInit): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchJson<T>(url: string, timeoutMs = 8000, init?: RequestInit): Promise<T | null> {
  const res = await fetchWithTimeout(url, timeoutMs, init);
  if (!res || !res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Wikipedia explaintext: çok paragraflı giriş; tek paragraf uzunsa cümleleri birleştirerek bloklar (maxLen).
 */
function extractToParagraphBullets(extract: string, maxBullets: number, maxLen: number): string[] {
  const stripped = extract.replace(/<[^>]+>/g, '').trim();
  if (!stripped) return [];

  const paragraphs = stripped
    .split(/\n+/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0);

  const sentencesFrom = (p: string): string[] => {
    const parts = p.split(/(?<=[.!?])\s+/u).map((s) => s.trim()).filter((s) => s.length > 0);
    return parts.length > 0 ? parts : [p];
  };

  const bullets: string[] = [];
  let buf = '';

  const flush = () => {
    const t = buf.trim();
    if (t) bullets.push(t);
    buf = '';
  };

  const pushOversized = (s: string) => {
    let rest = s;
    while (rest.length > 0 && bullets.length < maxBullets) {
      bullets.push(rest.length > maxLen ? `${rest.slice(0, maxLen - 1)}…` : rest);
      rest = rest.length > maxLen ? rest.slice(maxLen - 1).trim() : '';
    }
  };

  for (const para of paragraphs) {
    if (bullets.length >= maxBullets) break;
    flush();
    if (para.length <= maxLen) {
      bullets.push(para);
      continue;
    }
    for (const s of sentencesFrom(para)) {
      if (bullets.length >= maxBullets) break;
      if (s.length > maxLen) {
        flush();
        pushOversized(s);
        continue;
      }
      const next = buf ? `${buf} ${s}` : s;
      if (next.length <= maxLen) buf = next;
      else {
        flush();
        buf = s;
      }
    }
  }
  flush();
  return bullets.slice(0, maxBullets);
}

async function wikiGeosearchTitles(
  lang: 'tr' | 'en',
  lat: number,
  lon: number,
  limit = 12
): Promise<string[]> {
  const u =
    `https://${lang}.wikipedia.org/w/api.php?action=query&list=geosearch` +
    `&gscoord=${encodeURIComponent(String(lat))}|${encodeURIComponent(String(lon))}` +
    `&gsradius=2500&gslimit=${limit}&format=json&origin=*`;
  const data = await fetchJson<{ query?: { geosearch?: { title: string }[] } }>(u, 8000, wikiRequestInit);
  const rows = data?.query?.geosearch || [];
  const out: string[] = [];
  for (const g of rows) {
    const t = g?.title?.trim();
    if (t) out.push(t);
  }
  return out;
}

async function wikiSearchTitles(lang: 'tr' | 'en', q: string, limit: number): Promise<string[]> {
  const qq = q.trim();
  if (!qq) return [];
  const u =
    `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*` +
    `&srlimit=${limit}&srsearch=${encodeURIComponent(qq)}`;
  const data = await fetchJson<{ query?: { search?: { title: string }[] } }>(u, 8000, wikiRequestInit);
  const rows = data?.query?.search || [];
  const out: string[] = [];
  for (const s of rows) {
    const t = s?.title?.trim();
    if (t) out.push(t);
  }
  return out;
}

function normalizeWikiMediaUrl(u: string | undefined): string | undefined {
  if (!u || typeof u !== 'string') return undefined;
  const t = u.trim();
  if (t.startsWith('https://')) return t;
  if (t.startsWith('//')) return `https:${t}`;
  if (t.startsWith('http://')) return `https://${t.slice('http://'.length)}`;
  return undefined;
}

export type WikiSummaryRich = {
  extract: string;
  title: string;
  url: string;
  thumbnailUrl?: string;
  originalImageUrl?: string;
};

type WikiQueryPage = {
  pageid?: number;
  title?: string;
  extract?: string;
  missing?: true;
  thumbnail?: { source?: string };
};

/**
 * Giriş bölümünün tamamı (ilk == başlığına kadar); REST summary yalnızca tek paragraf verebiliyor.
 */
async function wikiPageLeadRich(lang: 'tr' | 'en', title: string): Promise<WikiSummaryRich | null> {
  const u =
    `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts|pageimages&redirects=1` +
    `&exintro=1&explaintext=1&piprop=thumbnail&pithumbsize=800` +
    `&format=json&origin=*&titles=${encodeURIComponent(title)}`;
  const data = await fetchJson<{ query?: { pages?: Record<string, WikiQueryPage> } }>(u, 8000, wikiRequestInit);
  const pages = data?.query?.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0];
  if (!page || page.missing) return null;
  const extract = typeof page.extract === 'string' ? page.extract.trim() : '';
  if (!extract) return null;
  const resolvedTitle = (page.title || title).trim();
  const enc = encodeURIComponent(resolvedTitle.replace(/ /g, '_'));
  const url = `https://${lang}.wikipedia.org/wiki/${enc}`;
  const thumbnailUrl = normalizeWikiMediaUrl(
    typeof page.thumbnail?.source === 'string' ? page.thumbnail.source : undefined
  );
  return { extract, title: resolvedTitle, url, thumbnailUrl, originalImageUrl: undefined };
}

async function wikiPageSummary(lang: 'tr' | 'en', title: string): Promise<WikiSummaryRich | null> {
  const enc = encodeURIComponent(title.replace(/ /g, '_'));
  const u = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${enc}`;
  const res = await fetchWithTimeout(u, 8000, wikiRequestInit);
  if (!res || !res.ok) return null;
  try {
    const j = (await res.json()) as {
      type?: string;
      extract?: string;
      title?: string;
      content_urls?: { desktop?: { page?: string }; mobile?: { page?: string } };
      thumbnail?: { source?: string };
      originalimage?: { source?: string };
    };
    if (j.type === 'disambiguation') return null;
    const extract = typeof j.extract === 'string' ? j.extract.trim() : '';
    if (!extract) return null;
    const url =
      j.content_urls?.desktop?.page ||
      j.content_urls?.mobile?.page ||
      `https://${lang}.wikipedia.org/wiki/${enc}`;
    const thumbnailUrl = normalizeWikiMediaUrl(
      typeof j.thumbnail?.source === 'string' ? j.thumbnail.source : undefined
    );
    const originalImageUrl = normalizeWikiMediaUrl(
      typeof j.originalimage?.source === 'string' ? j.originalimage.source : undefined
    );
    return { extract, title: j.title || title, url, thumbnailUrl, originalImageUrl };
  } catch {
    return null;
  }
}

async function wikiPageRichForPresentation(lang: 'tr' | 'en', title: string): Promise<WikiSummaryRich | null> {
  const lead = await wikiPageLeadRich(lang, title);
  if (!lead?.extract) return wikiPageSummary(lang, title);
  if (!lead.thumbnailUrl && !lead.originalImageUrl) {
    const rest = await wikiPageSummary(lang, lead.title);
    if (rest && (rest.thumbnailUrl || rest.originalImageUrl)) {
      return {
        ...lead,
        thumbnailUrl: lead.thumbnailUrl || rest.thumbnailUrl,
        originalImageUrl: rest.originalImageUrl,
      };
    }
  }
  return lead;
}

/** OSM statik önizleme (koordinat var, Wikipedia görseli yoksa). */
export function staticMapPreviewUrl(lat: number, lon: number, width = 640, height = 360): string {
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}&zoom=14&size=${width}x${height}&maptype=mapnik`;
}

/** Sunum: Wikipedia/OSM özet dilimi (durak başlığına göre). */
export type StopPresentationWebBlock = {
  summaryBullets: string[];
  summarySourceLine: string;
  summarySourceUrl?: string;
  summaryWikipediaPageTitle?: string;
  /** Google Places yalnızca örnek yorumlar (özet ayrı). */
  reviewBullets: string[];
  reviewSourceLine: string;
  heroImageUrl?: string;
  /** Yorum satırları Google’dan geldiyse. */
  fromGooglePlaces?: boolean;
};

function truncatePresentationText(s: string, maxLen: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length > maxLen ? `${t.slice(0, maxLen - 1)}…` : t;
}

function uniquePlaceSearchNames(fullName: string): string[] {
  const n = fullName.trim();
  if (!n) return [];
  const seen = new Set<string>();
  const add = (s: string) => {
    const t = s.trim();
    if (t.length >= 2) seen.add(t);
  };
  add(n);
  const beforeDash = n.replace(/\s*[-–—]\s*.+$/u, '').trim();
  add(beforeDash);
  const beforeAmp = n.split('&')[0]?.trim() ?? '';
  add(beforeAmp);
  const paren = n.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  add(paren);
  return Array.from(seen);
}

type GoogleReviewsSlice = {
  bullets: string[];
  sourceLine: string;
  heroImageUrl?: string;
};

/** Yalnızca Google yorumları (editorial özet burada kullanılmaz). */
async function tryGoogleReviewsSlice(stop: Stop, row: PlanSummaryStopRow): Promise<GoogleReviewsSlice | null> {
  if (stop.placeRating == null || stop.placeRating <= 0) return null;
  if (!getGoogleMapsApiKey()) return null;
  try {
    let placeId = stop.googlePlaceId?.trim() ?? '';
    if (!placeId) {
      if (Platform.OS === 'web') return null;
      const baseName = (stop.locationName || row.name || '').trim();
      const lat = stop.coords?.latitude;
      const lng = stop.coords?.longitude;
      if (!baseName || lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
      }
      for (const variant of uniquePlaceSearchNames(baseName)) {
        placeId = (await findPlaceIdFromTextQuery(variant, lat, lng)) || '';
        if (placeId) break;
        await sleep(90);
      }
    }
    if (!placeId) return null;

    const rich = await fetchPlacePresentationRich(placeId);
    if (!rich) return null;

    const bullets: string[] = [];
    if (rich.reviewBest) {
      const t = truncatePresentationText(rich.reviewBest.text, 420);
      if (t) {
        bullets.push(`En yüksek puanlı yorum (${rich.reviewBest.rating.toFixed(1)}★): ${t}`);
      }
    }
    if (rich.reviewWorst) {
      const t = truncatePresentationText(rich.reviewWorst.text, 420);
      if (t) {
        bullets.push(`En düşük puanlı yorum (${rich.reviewWorst.rating.toFixed(1)}★): ${t}`);
      }
    }

    if (bullets.length === 0 && !rich.heroImageUrl) return null;

    return {
      bullets,
      sourceLine: 'Kaynak: Google Places (yorumlar, anlık veri)',
      heroImageUrl: rich.heroImageUrl,
    };
  } catch {
    return null;
  }
}

function pickHeroFromWiki(sum: WikiSummaryRich): string | undefined {
  return sum.originalImageUrl || sum.thumbnailUrl;
}

/** İşletme / mağaza / konaklama vb.: koordinata en yakın “cografi” madde genelde yanlış çıkar. */
function isPoiLikeStopName(raw: string): boolean {
  const n = raw.toLocaleLowerCase('tr-TR');
  return /(otel|hotel|motel|pansiyon|hostel|resort|tatil|restoran|restaurant|lokanta|café|cafe|\bkahve\b|köftec|kebap|mutfak|balık|pizza|\bbar\b|pub|dükkan|mağaza|market|migros|bim|a101|şok |carrefour|avm|işletme|konaklama|suite|brunch)/u.test(
    n
  );
}

function normalizeMatchBlob(s: string): string {
  return s
    .normalize('NFKC')
    .toLocaleLowerCase('tr-TR')
    .replace(/[.,;:'"()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * "Kavala, Yunanistan" → "Kavala" (TR maddesi Yunanistan demeden de eşleşsin).
 * Sondaki parantez: "X (ilçe)" → "X".
 */
function primaryLocationLabelForWiki(raw: string): string {
  let s = raw.trim();
  const noParen = s.replace(/\s*\([^)]{0,120}\)\s*$/u, '').trim();
  if (noParen.length >= 2) s = noParen;
  const beforeComma = s.split(',')[0]?.trim() ?? s;
  return beforeComma.length >= 2 ? beforeComma : raw.trim();
}

/** Özette “cami” / “camii” / “camidir” gibi varyantlar aynı anahtar kelime sayılır. */
function blobContainsToken(blob: string, token: string): boolean {
  if (blob.includes(token)) return true;
  if (token.startsWith('cami')) {
    return /\b(camii|cami|camisi|caminin|camidir|camide|camiye|mescit)\b/u.test(blob);
  }
  return false;
}

const STOPWORDS = new Set([
  've',
  'ile',
  'bir',
  'the',
  'and',
  'tarihi',
  'eski',
  'yeni',
  'merkez',
  'büyük',
]);

function significantTokens(stopName: string): string[] {
  return normalizeMatchBlob(stopName)
    .split(' ')
    .map((w) => w.replace(/^[0-9]+[m]?$/i, '').replace(/[0-9]/g, ''))
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/** Örn. “Deniz Feneri” durağına en yakın “Cami” maddesini ele. */
function landmarkTopicContradictsStop(stopName: string, wikiTitle: string, extract: string): boolean {
  const s = normalizeMatchBlob(stopName);
  const wt = normalizeMatchBlob(wikiTitle);
  const ex = normalizeMatchBlob(extract.slice(0, 280));
  const blob = `${wt} ${ex}`;
  const wantsLighthouse =
    /\b(deniz feneri|deniz\s+feneri|deniz\s+fener|lighthouse)\b/u.test(s) ||
    (/\bfeneri\b/u.test(s) && /\bdeniz\b/u.test(s));
  const wikiMosque = /\b(cami|camii|mosque|mescit|mosque)\b/u.test(wt);
  const wikiHasLighthouse = /\b(fener|lighthouse|fanari|pharos|φάρο|deniz feneri)\b/u.test(blob);
  if (wantsLighthouse && wikiMosque && !wikiHasLighthouse) return true;
  return false;
}

export type GeoAdminHints = {
  countryCode: string | null;
  /** Nominatim state (TR’de çoğunlukla il). */
  provinceLabel: string | null;
  /** Nominatim county (TR’de sık ilçe); yer adıyla aynı olabilir. */
  districtLabel: string | null;
  /** Şehir / kasaba / köy (arama için). */
  localityLabel: string | null;
};

function cleanAdminLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw
    .trim()
    .replace(/\s+(ili|province|ilçesi|county|region)\s*$/iu, '')
    .trim();
  return t.length >= 2 ? t : null;
}

/**
 * Wikipedia başlığı/özeti durak adıyla yeterince örtüşüyor mu (stadyum vs köfteci ayrımı).
 * geoHints: koordinattan il/ilçe bilgisi varsa, tek kelimeli Türkiye yer adlarında özette veya başlıkta
 * il (veya duraktan farklı ilçe) geçmesini ister — aynı addaki tarihî/soy anlatı maddelerini genel olarak eler.
 */
export function wikiSnippetRelevantToStop(
  stopName: string,
  wikiTitle: string,
  extract: string,
  geoHints?: GeoAdminHints | null
): boolean {
  if (landmarkTopicContradictsStop(stopName, wikiTitle, extract)) return false;
  const label = primaryLocationLabelForWiki(stopName);
  const tokens = significantTokens(label);
  const blob = normalizeMatchBlob(`${wikiTitle} ${extract.slice(0, 520)}`);
  const hits = tokens.filter((t) => blobContainsToken(blob, t));
  if (tokens.length === 0) return true;
  if (tokens.length >= 2) {
    if (hits.length < 2) return false;
  } else if (hits.length < 1) {
    return false;
  }

  const blobWide = normalizeMatchBlob(`${wikiTitle} ${extract.slice(0, 1600)}`);
  const primNorm = normalizeMatchBlob(label);
  const prov = geoHints?.provinceLabel?.trim() ?? '';
  const provNorm = prov ? normalizeMatchBlob(prov) : '';
  const oneWordPlace = tokens.length === 1;
  const trLike = geoHints?.countryCode === 'tr' || geoHints?.countryCode === 'cy';

  if (oneWordPlace && trLike && prov && primNorm !== provNorm) {
    const provToks = significantTokens(prov);
    const provHit =
      provToks.length === 0 || provToks.some((t) => blobContainsToken(blobWide, t));
    const dist = geoHints?.districtLabel?.trim() ?? '';
    const distNorm = dist ? normalizeMatchBlob(dist) : '';
    const distHit =
      Boolean(dist && distNorm && primNorm !== distNorm) &&
      significantTokens(dist).some((t) => blobContainsToken(blobWide, t));
    if (!provHit && !distHit) return false;
  }

  return true;
}

async function fetchGeoAdminHints(lat: number, lon: number): Promise<GeoAdminHints> {
  const headers = { 'User-Agent': NOMINATIM_UA };
  const u = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;
  const res = await fetchWithTimeout(u, 8000, { headers });
  if (!res?.ok) {
    return { countryCode: null, provinceLabel: null, districtLabel: null, localityLabel: null };
  }
  try {
    const row = (await res.json()) as { address?: Record<string, string> };
    const a = row.address || {};
    const countryCode = (a.country_code || '').toLowerCase().trim() || null;
    const provinceLabel = cleanAdminLabel(a.state || a.province);
    const districtLabel = cleanAdminLabel(a.county || a.city_district);
    const parts = [a.city, a.town, a.village, a.municipality].filter(
      (x): x is string => Boolean(x && String(x).trim())
    );
    const localityLabel = parts[0]?.trim() ?? null;
    return { countryCode, provinceLabel, districtLabel, localityLabel };
  } catch {
    return { countryCode: null, provinceLabel: null, districtLabel: null, localityLabel: null };
  }
}

type SummarySlice = {
  bullets: string[];
  sourceLine: string;
  url?: string;
  heroImageUrl?: string;
  wikipediaPageTitle?: string;
};

/**
 * Durak başlığına göre Wikipedia (+ isteğe bağlı konum/OSM yedekleri).
 * Google puanı olan duraklarda yalnızca metin araması (geosearch/OSM kapalı): özet, başlıkla uyumlu kalsın.
 */
function dedupeQueryList(queries: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of queries) {
    const k = q.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(q.trim());
  }
  return out;
}

async function fetchPresentationSummarySlice(
  stop: Stop,
  row: PlanSummaryStopRow,
  mapFallback: string | undefined,
  opts: { allowGeosearch: boolean; allowOsm: boolean }
): Promise<SummarySlice> {
  const name = (stop.locationName || row.name || '').trim();
  const lat = stop.coords?.latitude;
  const lon = stop.coords?.longitude;
  const primary = primaryLocationLabelForWiki(name);

  const tryWikiArticle = async (
    lang: 'tr' | 'en',
    articleTitle: string,
    sourceTag: string
  ): Promise<SummarySlice | null> => {
    const sum = await wikiPageRichForPresentation(lang, articleTitle);
    if (!sum?.extract) return null;
    if (!wikiSnippetRelevantToStop(name, sum.title, sum.extract, geoHints)) return null;
    return {
      bullets: extractToParagraphBullets(sum.extract, 32, 1600),
      sourceLine: `Kaynak: Wikipedia (${lang.toUpperCase()})${sourceTag}`,
      url: sum.url,
      heroImageUrl: pickHeroFromWiki(sum) || mapFallback,
      wikipediaPageTitle: sum.title,
    };
  };

  let geoHints: GeoAdminHints | null = null;
  if (lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)) {
    geoHints = await fetchGeoAdminHints(lat, lon);
  }
  const locality = geoHints?.localityLabel ?? null;
  const province = geoHints?.provinceLabel ?? null;
  const district = geoHints?.districtLabel ?? null;

  const priorityTrDirectTitles: string[] = [];
  const pushPri = (t: string) => {
    const s = t.trim();
    if (s.length < 4) return;
    const k = normalizeMatchBlob(s);
    if (priorityTrDirectTitles.some((x) => normalizeMatchBlob(x) === k)) return;
    priorityTrDirectTitles.push(s);
  };
  if (province && normalizeMatchBlob(province) !== normalizeMatchBlob(primary)) {
    pushPri(`${primary}, ${province}`);
    pushPri(`${primary} (${province})`);
  }
  if (district && province && normalizeMatchBlob(district) !== normalizeMatchBlob(province)) {
    pushPri(`${district}, ${province}`);
    pushPri(`${district} (${province})`);
  }
  if (
    locality &&
    province &&
    normalizeMatchBlob(locality) !== normalizeMatchBlob(primary) &&
    normalizeMatchBlob(locality) !== normalizeMatchBlob(province)
  ) {
    pushPri(`${primary}, ${locality}`);
    pushPri(`${locality}, ${province}`);
  }

  const sharedQueries: string[] = [];
  if (locality) sharedQueries.push(`${name} ${locality}`);
  sharedQueries.push(name);
  for (const variant of uniquePlaceSearchNames(name)) {
    if (variant !== name) sharedQueries.push(variant);
  }
  if (primary.length >= 2 && normalizeMatchBlob(primary) !== normalizeMatchBlob(name)) {
    sharedQueries.push(primary, `${primary} tarihi`);
  }
  sharedQueries.push(`${name} tarihi`, `${name} müzesi`);

  const trOnlyQueries: string[] = [];
  if (primary.length >= 3) {
    if (province && normalizeMatchBlob(province) !== normalizeMatchBlob(primary)) {
      trOnlyQueries.push(`${primary} ${province}`, `${primary}, ${province}`);
    }
    if (district && province && normalizeMatchBlob(district) !== normalizeMatchBlob(province)) {
      trOnlyQueries.push(`${district} ${province}`, `${district}, ${province}`);
    }
    trOnlyQueries.push(
      `${primary} ilçesi`,
      `${primary} Türkiye`,
      `${primary} Yunanistan`,
      `${primary} belediyesi`,
      `${primary} şehri`
    );
    const loc = locality?.trim();
    if (loc && loc.length >= 2) trOnlyQueries.push(`${primary} ${loc}`);
  }

  /** Önce Nominatim il/ilçe ile "Yer, İl" doğrudan madde (arama sırasına bağlı kalmadan). */
  for (const t of priorityTrDirectTitles) {
    const block = await tryWikiArticle('tr', t, '');
    if (block) return block;
  }

  /** Önce tüm TR yolları (Kınık gibi maddeler EN’e düşmesin), sonra EN yedek. */
  for (const t of uniquePlaceSearchNames(name)) {
    if (t.length < 3) continue;
    const block = await tryWikiArticle('tr', t, '');
    if (block) return block;
  }

  const trSearchQueries = dedupeQueryList([...trOnlyQueries, ...sharedQueries]);
  for (const q of trSearchQueries) {
    const titles = await wikiSearchTitles('tr', q, 12);
    for (const t of titles) {
      const block = await tryWikiArticle('tr', t, '');
      if (block) return block;
    }
  }

  for (const t of uniquePlaceSearchNames(name)) {
    if (t.length < 3) continue;
    const block = await tryWikiArticle('en', t, '');
    if (block) return block;
  }

  const enSearchQueries = dedupeQueryList([...sharedQueries]);
  for (const q of enSearchQueries) {
    const titles = await wikiSearchTitles('en', q, 12);
    for (const t of titles) {
      const block = await tryWikiArticle('en', t, '');
      if (block) return block;
    }
  }

  if (opts.allowGeosearch) {
    const skipGeo = isPoiLikeStopName(name);
    if (!skipGeo && lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)) {
      for (const geoLang of ['tr', 'en'] as const) {
        const geoTitles = await wikiGeosearchTitles(geoLang, lat, lon, 14);
        for (const geoTitle of geoTitles) {
          const block = await tryWikiArticle(geoLang, geoTitle, ' — konum');
          if (block) return block;
        }
      }
    }
  }

  if (opts.allowOsm) {
    const osm = await nominatimEnrich(name, lat, lon);
    if (osm && osm.bullets.length > 0) {
      return {
        bullets: osm.bullets,
        sourceLine: osm.sourceLine,
        url: osm.url,
        heroImageUrl: mapFallback,
      };
    }
  }

  return {
    bullets: [],
    sourceLine: '',
    url: undefined,
    heroImageUrl: undefined,
    wikipediaPageTitle: undefined,
  };
}

/**
 * Sunum: özet = Wikipedia (durak başlığı); Google puanı varsa yorumlar ayrı blokta.
 */
export async function fetchPresentationWebForStop(
  stop: Stop,
  row: PlanSummaryStopRow
): Promise<StopPresentationWebBlock> {
  const name = (stop.locationName || row.name || '').trim();
  const lat = stop.coords?.latitude;
  const lon = stop.coords?.longitude;
  const mapFallback =
    lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)
      ? staticMapPreviewUrl(lat, lon)
      : undefined;

  const rated = stop.placeRating != null && stop.placeRating > 0;

  if (!name) {
    return {
      summaryBullets: [],
      summarySourceLine: '',
      summarySourceUrl: undefined,
      summaryWikipediaPageTitle: undefined,
      reviewBullets: [],
      reviewSourceLine: '',
      heroImageUrl: mapFallback,
      fromGooglePlaces: false,
    };
  }

  const summary = await fetchPresentationSummarySlice(stop, row, mapFallback, {
    allowGeosearch: !rated,
    allowOsm: !rated,
  });

  let reviewBullets: string[] = [];
  let reviewSourceLine = '';
  let googleHero: string | undefined;
  if (rated && getGoogleMapsApiKey()) {
    try {
      const g = await tryGoogleReviewsSlice(stop, row);
      if (g) {
        reviewBullets = g.bullets;
        reviewSourceLine = g.sourceLine;
        googleHero = g.heroImageUrl;
      }
    } catch {
      /* */
    }
  }

  /** İşletme fotoğrafı Google’da güçlü; puanlı duraklarda önce Places görseli (Wikipedia küçük/boş kalabiliyor). */
  const heroImageUrl = rated
    ? googleHero || summary.heroImageUrl || mapFallback
    : summary.heroImageUrl || googleHero || mapFallback;

  return {
    summaryBullets: summary.bullets,
    summarySourceLine: summary.sourceLine,
    summarySourceUrl: summary.url,
    summaryWikipediaPageTitle: summary.wikipediaPageTitle,
    reviewBullets,
    reviewSourceLine: reviewBullets.length > 0 ? reviewSourceLine : '',
    heroImageUrl,
    fromGooglePlaces: reviewBullets.length > 0,
  };
}

/**
 * Rota dışı “yer keşfet” — tek nokta için rota sunumuyla aynı Wikipedia / Google zenginleştirme.
 */
export async function fetchPresentationWebForPlaceSpotlight(params: {
  locationName: string;
  coords: { latitude: number; longitude: number };
  googlePlaceId?: string;
  placeRating?: number;
  placeUserRatingsTotal?: number;
}): Promise<StopPresentationWebBlock> {
  const stop: Stop = {
    stopId: 'spotlight',
    tripId: 'spotlight',
    locationName: params.locationName,
    coords: params.coords,
    googlePlaceId: params.googlePlaceId,
    placeRating: params.placeRating,
    placeUserRatingsTotal: params.placeUserRatingsTotal,
    status: 'approved',
  };
  const row: PlanSummaryStopRow = {
    routeIndex: 1,
    dayLabel: '—',
    name: params.locationName,
    stopRestMin: null,
    stopRestDisplay: '—',
    extrasSummary: '—',
    stopTotalTl: 0,
  };
  return fetchPresentationWebForStop(stop, row);
}

type NominatimRow = {
  display_name?: string;
  address?: Record<string, string>;
  lat?: string;
  lon?: string;
};

async function nominatimEnrich(
  name: string,
  lat?: number,
  lon?: number
): Promise<PptxStopWebBlock | null> {
  const headers = { 'User-Agent': NOMINATIM_UA };
  try {
    let row: NominatimRow | null = null;

    if (
      lat != null &&
      lon != null &&
      Number.isFinite(lat) &&
      Number.isFinite(lon)
    ) {
      const u = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
      const res = await fetchWithTimeout(u, 8000, { headers });
      if (res?.ok) {
        row = (await res.json()) as NominatimRow;
      }
    }

    if (!row?.display_name) {
      const u = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name.trim())}&format=json&limit=1`;
      const res = await fetchWithTimeout(u, 8000, { headers });
      if (!res?.ok) return null;
      const arr = (await res.json()) as NominatimRow[];
      row = Array.isArray(arr) && arr[0] ? arr[0] : null;
    }

    if (!row?.display_name) return null;

    const lines: string[] = [String(row.display_name)];
    const a = row.address || {};
    const parts = [a.road, a.suburb, a.city, a.town, a.village, a.state, a.country].filter(
      (x) => Boolean(x && String(x).trim())
    ) as string[];
    if (parts.length) lines.push(parts.join(', '));

    const la = row.lat != null ? parseFloat(String(row.lat)) : NaN;
    const lo = row.lon != null ? parseFloat(String(row.lon)) : NaN;
    const mapUrl =
      Number.isFinite(la) && Number.isFinite(lo)
        ? `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}&zoom=15`
        : undefined;

    return {
      bullets: lines.slice(0, 4).map((s) => (s.length > 280 ? `${s.slice(0, 279)}…` : s)),
      sourceLine: 'Kaynak: OpenStreetMap (Nominatim)',
      url: mapUrl,
    };
  } catch {
    return null;
  }
}

async function fetchWebForStop(stop: Stop, row: PlanSummaryStopRow): Promise<PptxStopWebBlock> {
  const pres = await fetchPresentationWebForStop(stop, row);
  const bullets = [...pres.summaryBullets, ...pres.reviewBullets];
  return {
    bullets,
    sourceLine: pres.summarySourceLine || pres.reviewSourceLine || '',
    url: pres.summarySourceUrl,
  };
}

/**
 * PowerPoint için her durakta Wikipedia (TR/EN, önce koordinat) ve gerekirse Nominatim ile kısa metin.
 * İstekler sırayla yapılır (kota / CORS için). Web’de Nominatim bazen CORS nedeniyle düşebilir; Wikipedia genelde çalışır.
 */
export async function enrichStopsForPptxExport(
  stops: Stop[],
  rows: PlanSummaryStopRow[]
): Promise<Record<number, PptxStopWebBlock>> {
  const out: Record<number, PptxStopWebBlock> = {};
  const n = Math.min(stops.length, rows.length);
  for (let i = 0; i < n; i++) {
    const row = rows[i]!;
    const stop = stops[i]!;
    out[row.routeIndex] = await fetchWebForStop(stop, row);
    if (i < n - 1) await sleep(420);
  }
  return out;
}
