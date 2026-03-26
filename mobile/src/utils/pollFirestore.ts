/** Firestore’da anket seçenekleri: yeni şekil `optionLabels` + `voteCounts`; eski: optionA/B + countA/B */

export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 8;

export type NormalizedPollDoc = {
  labels: string[];
  counts: number[];
  /** true ise oy güncellemesi countA/countB (yalnızca 2 şık) */
  usesLegacyCounters: boolean;
};

export function normalizePollDocument(raw: Record<string, unknown> | undefined | null): NormalizedPollDoc {
  const p = raw ?? {};
  const labelsRaw = (p as { optionLabels?: unknown }).optionLabels;
  if (Array.isArray(labelsRaw) && labelsRaw.length >= POLL_MIN_OPTIONS) {
    const labels = labelsRaw
      .map((x) => String(x ?? '').trim())
      .filter((s) => s.length > 0)
      .slice(0, POLL_MAX_OPTIONS);
    if (labels.length >= POLL_MIN_OPTIONS) {
      let counts = Array.isArray((p as { voteCounts?: unknown }).voteCounts)
        ? ((p as { voteCounts: unknown[] }).voteCounts as unknown[]).map((n) => Math.max(0, Number(n) || 0))
        : [];
      while (counts.length < labels.length) counts.push(0);
      counts = counts.slice(0, labels.length);
      return { labels, counts, usesLegacyCounters: false };
    }
  }
  const a = String((p as { optionA?: unknown }).optionA ?? 'A');
  const b = String((p as { optionB?: unknown }).optionB ?? 'B');
  return {
    labels: [a, b],
    counts: [
      Math.max(0, Number((p as { countA?: unknown }).countA) || 0),
      Math.max(0, Number((p as { countB?: unknown }).countB) || 0),
    ],
    usesLegacyCounters: true,
  };
}

export function optionsFromNormalized(labels: string[], counts: number[]): Array<{
  id: string;
  text: string;
  count: number;
}> {
  return labels.map((text, i) => ({
    id: String(i),
    text,
    count: counts[i] ?? 0,
  }));
}

/** Oy belgesinden seçenek kimliği: "0".."n-1" */
export function parseStoredVote(
  vv: Record<string, unknown> | undefined | null,
  optionCount: number
): string | null {
  if (!vv || optionCount <= 0) return null;
  const idx = Number((vv as { choiceIndex?: unknown }).choiceIndex);
  if (Number.isFinite(idx) && Number.isInteger(idx) && idx >= 0 && idx < optionCount) {
    return String(idx);
  }
  const ch = (vv as { choice?: unknown }).choice;
  if (ch === 'a' && optionCount >= 1) return '0';
  if (ch === 'b' && optionCount >= 2) return '1';
  return null;
}

export function sanitizeNewOptionTexts(texts: string[]): string[] {
  return texts
    .map((t) => String(t ?? '').trim())
    .filter((t) => t.length > 0)
    .slice(0, POLL_MAX_OPTIONS);
}

export function parseChoiceIndex(choiceId: string, optionCount: number): number {
  const idx = parseInt(choiceId, 10);
  if (!Number.isInteger(idx) || idx < 0 || idx >= optionCount) {
    throw new Error('Geçersiz oy.');
  }
  return idx;
}
