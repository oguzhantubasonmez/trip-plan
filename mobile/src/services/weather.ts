import type { Stop } from '../types/trip';
import { effectiveStopYmd, formatTripDayTr } from '../utils/tripSchedule';

export type DayWeatherSnapshot = {
  dateYmd: string;
  minC: number;
  maxC: number;
  weatherCode: number;
  labelTr: string;
  emoji: string;
};

export type CurrentWeatherSnapshot = {
  temperatureC: number;
  weatherCode: number;
  labelTr: string;
  emoji: string;
  windKmh?: number;
};

function todayYmdLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Open-Meteo günlük tahmin üst sınırı (forecast_days ile açılıyor). */
export const OPEN_METEO_MAX_FORECAST_DAYS = 16;

function parseYmdToLocalMidnight(ymd: string): Date | null {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
  return dt;
}

/** Yerel takvimde hedef gün − bugün (geçmiş günler negatif). */
export function daysFromLocalTodayToYmd(ymd: string): number | null {
  const target = parseYmdToLocalMidnight(ymd);
  if (!target) return null;
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - t.getTime()) / 86400000);
}

/** Bugün ve gelecek için günlük tahmin bu tarihi kapsamıyorsa true (geçmiş günler false). */
export function isYmdBeyondOpenMeteoDailyForecast(ymd: string): boolean {
  const d = daysFromLocalTodayToYmd(ymd);
  if (d == null) return true;
  if (d < 0) return false;
  return d > OPEN_METEO_MAX_FORECAST_DAYS;
}

/**
 * Durak kartı özet satırı: ölçüm varsa göster; yoksa neden yok kısaca (koordinat / uzak tarih).
 */
export function buildStopWeatherPeekLine(params: {
  stop: Stop;
  tripStartDate: string;
  snapshot: DayWeatherSnapshot | undefined;
}): string | undefined {
  const { stop, tripStartDate, snapshot } = params;
  if (snapshot) return formatStopWeatherLine(snapshot);
  const ymd = effectiveStopYmd(stop, tripStartDate);
  if (ymd === '1970-01-01') return undefined;
  const lat = stop.coords?.latitude;
  const lon = stop.coords?.longitude;
  if (lat == null || lon == null) {
    return '📍 Konum kaydı yok — hava için durak yerini haritadan yeniden seç';
  }
  const today = todayYmdLocal();
  if (ymd >= today && isYmdBeyondOpenMeteoDailyForecast(ymd)) {
    const day = formatTripDayTr(ymd) || ymd;
    return `🌡️ ${day}: Bu tarih için henüz hava durumu tahmini bulunmuyor`;
  }
  return undefined;
}

/** WMO Weather interpretation codes (Open-Meteo) — kısa Türkçe */
export function wmoCodeToDisplay(code: number): { emoji: string; labelTr: string } {
  if (code === 0) return { emoji: '☀️', labelTr: 'Açık' };
  if (code === 1) return { emoji: '🌤️', labelTr: 'Çoğunlukla açık' };
  if (code === 2) return { emoji: '⛅', labelTr: 'Parçalı bulutlu' };
  if (code === 3) return { emoji: '☁️', labelTr: 'Kapalı' };
  if (code === 45 || code === 48) return { emoji: '🌫️', labelTr: 'Sis' };
  if (code >= 51 && code <= 55) return { emoji: '🌦️', labelTr: 'Çiseleyen yağmur' };
  if (code >= 56 && code <= 57) return { emoji: '🌨️', labelTr: 'Donan çise' };
  if (code >= 61 && code <= 65) return { emoji: '🌧️', labelTr: 'Yağmur' };
  if (code >= 66 && code <= 67) return { emoji: '🌨️', labelTr: 'Donan yağmur' };
  if (code >= 71 && code <= 77) return { emoji: '❄️', labelTr: 'Kar' };
  if (code >= 80 && code <= 82) return { emoji: '🌧️', labelTr: 'Sağanak' };
  if (code >= 85 && code <= 86) return { emoji: '🌨️', labelTr: 'Kar sağanağı' };
  if (code === 95) return { emoji: '⛈️', labelTr: 'Gök gürültülü' };
  if (code >= 96 && code <= 99) return { emoji: '⛈️', labelTr: 'Dolu riski' };
  return { emoji: '🌡️', labelTr: 'Hava' };
}

export function formatStopWeatherLine(w: DayWeatherSnapshot): string {
  const lo = Math.round(w.minC);
  const hi = Math.round(w.maxC);
  const day = formatTripDayTr(w.dateYmd);
  return `${w.emoji} ${day}: ${lo}° / ${hi}° · ${w.labelTr}`;
}

async function fetchDailySlice(
  lat: number,
  lon: number,
  ymd: string,
  useArchive: boolean
): Promise<DayWeatherSnapshot | null> {
  const base = useArchive
    ? 'https://archive-api.open-meteo.com/v1/archive'
    : 'https://api.open-meteo.com/v1/forecast';
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    start_date: ymd,
    end_date: ymd,
  });
  /** `forecast_days` ile `start_date`/`end_date` birlikte verilemez (Open-Meteo 400). Tek gün için sadece tarih aralığı yeterli. */
  const res = await fetch(`${base}?${q.toString()}`);
  if (!res.ok) return null;
  const json = (await res.json()) as {
    daily?: {
      time?: string[];
      weather_code?: (number | null)[];
      temperature_2m_max?: (number | null)[];
      temperature_2m_min?: (number | null)[];
    };
  };
  const d = json.daily;
  if (!d?.time?.length) return null;
  const i = d.time.indexOf(ymd);
  if (i < 0) return null;
  const code = d.weather_code?.[i];
  const max = d.temperature_2m_max?.[i];
  const min = d.temperature_2m_min?.[i];
  if (code == null || max == null || min == null) return null;
  const { emoji, labelTr } = wmoCodeToDisplay(code);
  return { dateYmd: ymd, minC: min, maxC: max, weatherCode: code, labelTr, emoji };
}

/** Tek gün, tek nokta: geçmiş günler arşiv, bugün ve gelecek tahmin. */
export async function fetchDayWeatherAt(
  lat: number,
  lon: number,
  ymd: string
): Promise<DayWeatherSnapshot | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const today = todayYmdLocal();
  const useArchive = ymd < today;
  if (!useArchive && isYmdBeyondOpenMeteoDailyForecast(ymd)) return null;
  try {
    return await fetchDailySlice(lat, lon, ymd, useArchive);
  } catch {
    return null;
  }
}

/**
 * Open-Meteo günlük tahmin: bugünden itibaren en fazla 16 gün (forecast_days).
 */
export async function fetchDailyForecastDays(
  lat: number,
  lon: number,
  days: number = OPEN_METEO_MAX_FORECAST_DAYS
): Promise<DayWeatherSnapshot[]> {
  const n = Math.min(Math.max(1, Math.floor(days)), OPEN_METEO_MAX_FORECAST_DAYS);
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: String(n),
  });
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q.toString()}`);
    if (!res.ok) return [];
    const json = (await res.json()) as {
      daily?: {
        time?: string[];
        weather_code?: (number | null)[];
        temperature_2m_max?: (number | null)[];
        temperature_2m_min?: (number | null)[];
      };
    };
    const d = json.daily;
    if (!d?.time?.length) return [];
    const out: DayWeatherSnapshot[] = [];
    for (let i = 0; i < d.time.length; i++) {
      const ymd = d.time[i];
      if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) continue;
      const code = d.weather_code?.[i];
      const max = d.temperature_2m_max?.[i];
      const min = d.temperature_2m_min?.[i];
      if (code == null || max == null || min == null) continue;
      const { emoji, labelTr } = wmoCodeToDisplay(code);
      out.push({ dateYmd: ymd, minC: min, maxC: max, weatherCode: code, labelTr, emoji });
    }
    return out;
  } catch {
    return [];
  }
}

export async function fetchCurrentWeather(
  lat: number,
  lon: number
): Promise<CurrentWeatherSnapshot | null> {
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,weather_code,wind_speed_10m',
    timezone: 'auto',
  });
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q.toString()}`);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      current?: {
        temperature_2m?: number;
        weather_code?: number;
        wind_speed_10m?: number;
      };
    };
    const c = json.current;
    if (!c || c.temperature_2m == null || c.weather_code == null) return null;
    const { emoji, labelTr } = wmoCodeToDisplay(c.weather_code);
    return {
      temperatureC: c.temperature_2m,
      weatherCode: c.weather_code,
      labelTr,
      emoji,
      windKmh: c.wind_speed_10m != null ? c.wind_speed_10m : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Duraklar için plan günü + koordinat bazlı hava; aynı (lat,lon,gün) tek istek.
 */
export async function fetchWeatherForStops(
  stops: Stop[],
  tripStartDate: string
): Promise<Map<string, DayWeatherSnapshot>> {
  const result = new Map<string, DayWeatherSnapshot>();
  const unique = new Map<string, { lat: number; lon: number; ymd: string }>();

  const today = todayYmdLocal();
  for (const s of stops) {
    const lat = s.coords?.latitude;
    const lon = s.coords?.longitude;
    if (lat == null || lon == null) continue;
    const ymd = effectiveStopYmd(s, tripStartDate);
    if (ymd === '1970-01-01') continue;
    if (ymd >= today && isYmdBeyondOpenMeteoDailyForecast(ymd)) continue;
    const key = `${lat.toFixed(4)},${lon.toFixed(4)},${ymd}`;
    if (!unique.has(key)) unique.set(key, { lat, lon, ymd });
  }

  const cache = new Map<string, DayWeatherSnapshot | null>();
  await Promise.all(
    [...unique.entries()].map(async ([key, { lat, lon, ymd }]) => {
      try {
        const w = await fetchDayWeatherAt(lat, lon, ymd);
        cache.set(key, w);
      } catch {
        cache.set(key, null);
      }
    })
  );

  for (const s of stops) {
    const lat = s.coords?.latitude;
    const lon = s.coords?.longitude;
    if (lat == null || lon == null) continue;
    const ymd = effectiveStopYmd(s, tripStartDate);
    const key = `${lat.toFixed(4)},${lon.toFixed(4)},${ymd}`;
    const w = cache.get(key);
    if (w) result.set(s.stopId, w);
  }

  return result;
}
