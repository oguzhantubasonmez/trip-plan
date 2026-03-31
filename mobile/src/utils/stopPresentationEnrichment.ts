import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Stop } from '../types/trip';
import type { PlanSummaryStopRow } from './planSummaryExport';
import type { StopPresentationPayload } from './presentationModel';
import { fetchPresentationWebForStop } from './stopWebEnrichment';

const CACHE_PREFIX = 'rw_pres:v9:';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CONCURRENCY = 4;

type CachedWeb = {
  cachedAt: number;
  summaryBullets: string[];
  summarySourceLine: string;
  summarySourceUrl?: string;
  summaryWikipediaPageTitle?: string;
  reviewBullets: string[];
  reviewSourceLine: string;
  heroImageUrl?: string;
  webFromGooglePlaces?: boolean;
};

function cacheKey(tripId: string, stopId: string): string {
  return `${CACHE_PREFIX}${tripId}:${stopId}`;
}

async function readCache(tripId: string, stopId: string): Promise<CachedWeb | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(tripId, stopId));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<CachedWeb>;
    if (!v || typeof v.cachedAt !== 'number') return null;
    if (Date.now() - v.cachedAt > TTL_MS) return null;
    if (!Array.isArray(v.summaryBullets) || !Array.isArray(v.reviewBullets)) return null;
    return v as CachedWeb;
  } catch {
    return null;
  }
}

async function writeCache(tripId: string, stopId: string, data: Omit<CachedWeb, 'cachedAt'>): Promise<void> {
  try {
    const payload: CachedWeb = { ...data, cachedAt: Date.now() };
    await AsyncStorage.setItem(cacheKey(tripId, stopId), JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

/** Odak indeksine göre önce merkez, sonra komşular, sonra geri kalan. */
export function presentationFetchPriorityOrder(focusIndex: number, length: number): number[] {
  if (length <= 0) return [];
  const clamped = Math.max(0, Math.min(focusIndex, length - 1));
  const ordered: number[] = [];
  const seen = new Set<number>();
  let radius = 0;
  while (ordered.length < length) {
    const left = clamped - radius;
    const right = clamped + radius;
    if (radius === 0) {
      if (left >= 0 && left < length && !seen.has(left)) {
        ordered.push(left);
        seen.add(left);
      }
    } else {
      if (left >= 0 && left < length && !seen.has(left)) {
        ordered.push(left);
        seen.add(left);
      }
      if (right < length && !seen.has(right)) {
        ordered.push(right);
        seen.add(right);
      }
    }
    radius += 1;
  }
  return ordered;
}

async function runPool<T>(items: T[], limit: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  let cursor = 0;
  async function runWorker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      await worker(items[i]!, i);
    }
  }
  const n = Math.min(limit, Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => runWorker()));
}

export type EnrichPresentationParams = {
  tripId: string;
  stops: Stop[];
  rows: PlanSummaryStopRow[];
  focusIndex: number;
  onIndexUpdated: (index: number, patch: Partial<StopPresentationPayload>) => void;
  signal?: AbortSignal;
};

/**
 * Önbellek + öncelik sırası + dalgalı paralellik (dalga başına en fazla CONCURRENCY istek).
 */
export async function enrichPresentationPayloads(params: EnrichPresentationParams): Promise<void> {
  const { tripId, stops, rows, focusIndex, onIndexUpdated, signal } = params;
  const n = Math.min(stops.length, rows.length);
  if (n === 0) return;

  const order = presentationFetchPriorityOrder(focusIndex, n);
  const pending: number[] = [];

  for (const idx of order) {
    if (signal?.aborted) return;
    const stop = stops[idx]!;
    const cached = await readCache(tripId, stop.stopId);
    if (cached) {
      onIndexUpdated(idx, {
        summaryBullets: cached.summaryBullets,
        summarySourceLine: cached.summarySourceLine,
        summarySourceUrl: cached.summarySourceUrl,
        summaryWikipediaPageTitle: cached.summaryWikipediaPageTitle,
        reviewBullets: cached.reviewBullets,
        reviewSourceLine: cached.reviewSourceLine,
        heroImageUrl: cached.heroImageUrl,
        webFromGooglePlaces: cached.webFromGooglePlaces,
        webLoading: false,
      });
    } else {
      pending.push(idx);
    }
  }

  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    if (signal?.aborted) return;
    const chunk = pending.slice(i, i + CONCURRENCY);
    await runPool(chunk, chunk.length, async (idx) => {
      if (signal?.aborted) return;
      const stop = stops[idx]!;
      const row = rows[idx]!;
      try {
        const web = await fetchPresentationWebForStop(stop, row);
        if (signal?.aborted) return;
        await writeCache(tripId, stop.stopId, {
          summaryBullets: web.summaryBullets,
          summarySourceLine: web.summarySourceLine,
          summarySourceUrl: web.summarySourceUrl,
          summaryWikipediaPageTitle: web.summaryWikipediaPageTitle,
          reviewBullets: web.reviewBullets,
          reviewSourceLine: web.reviewSourceLine,
          heroImageUrl: web.heroImageUrl,
          webFromGooglePlaces: web.fromGooglePlaces,
        });
        onIndexUpdated(idx, {
          summaryBullets: web.summaryBullets,
          summarySourceLine: web.summarySourceLine,
          summarySourceUrl: web.summarySourceUrl,
          summaryWikipediaPageTitle: web.summaryWikipediaPageTitle,
          reviewBullets: web.reviewBullets,
          reviewSourceLine: web.reviewSourceLine,
          heroImageUrl: web.heroImageUrl,
          webFromGooglePlaces: web.fromGooglePlaces,
          webLoading: false,
        });
      } catch {
        if (signal?.aborted) return;
        onIndexUpdated(idx, {
          webLoading: false,
          summarySourceLine: '',
          summaryBullets: [],
          reviewBullets: [],
          reviewSourceLine: '',
          webFromGooglePlaces: false,
        });
      }
    });
  }
}
