/**
 * Sürüm notları: `app.json` içindeki `expo.version` ile anahtar eşleşmeli.
 * Yeni sürüm yayınlarken sürüm numarasını artırıp buraya madde ekleyin.
 * Bu sürüm için kayıt yoksa veya metin boşsa modal gösterilmez.
 */
export const RELEASE_NOTES_BY_VERSION: Record<string, string> = {
  '1.0.2': [
    '• Hava durumu: karta dokunarak 16 günlük tahmin; başka konum seçebilirsin.',
    '• Yurtdışı konumları arama özelliği eklendi.',
    '• Rota kopyalama özelliği eklendi.',
    '• Rota paylaşma özelliği ile paylaşım kanallarından katılımcıya direkt link ile katılım gerçekleştirilebilir. Katılımcılar a gir ve davet linki gönder.',
    '• Yeni sürüm notları: ilk açılışta bir kez gösterilir; «bir daha gösterme» ile kapatılabilir.',
  ].join('\n'),
};

export function getReleaseNotesForVersion(version: string): string | null {
  const v = String(version ?? '').trim();
  if (!v) return null;
  const text = RELEASE_NOTES_BY_VERSION[v];
  if (text == null || !String(text).trim()) return null;
  return String(text).trim();
}
