/** Arkadaş adı araması — Firestore `displayNameLower` ile aynı kuralla yazılmalı */
export function normalizeNameSearchKey(s: string): string {
  return String(s ?? '').trim().toLocaleLowerCase('tr-TR');
}
