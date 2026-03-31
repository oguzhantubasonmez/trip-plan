/** Aynı rota için eşzamanlı iki PowerPoint dışa aktarımını engeller (unmount sonrası iş bitene kadar). */
const activeTripIds = new Set<string>();

export function tryBeginPptxExportForTrip(tripId: string): boolean {
  if (activeTripIds.has(tripId)) return false;
  activeTripIds.add(tripId);
  return true;
}

export function endPptxExportForTrip(tripId: string): void {
  activeTripIds.delete(tripId);
}
