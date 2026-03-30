import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPPRESS_ALL_KEY = '@rw/release_notes_suppress_all';

function storageKey(version: string): string {
  return `@rw/release_notes_dismissed_${String(version ?? '').trim()}`;
}

export async function isReleaseNotesSuppressedGlobally(): Promise<boolean> {
  try {
    const x = await AsyncStorage.getItem(SUPPRESS_ALL_KEY);
    return x === '1' || x === 'true';
  } catch {
    return false;
  }
}

/** Bu sürüm notları daha önce kapatıldıysa true. */
export async function isReleaseNotesDismissedForVersion(version: string): Promise<boolean> {
  const v = String(version ?? '').trim();
  if (!v) return true;
  try {
    const x = await AsyncStorage.getItem(storageKey(v));
    return x === '1' || x === 'true';
  } catch {
    return false;
  }
}

/** Tamam: bu sürümü bir daha gösterme. suppressAll: gelecekteki tüm sürüm notlarını kapat. */
export async function acknowledgeReleaseNotes(
  version: string,
  suppressAllFuture: boolean
): Promise<void> {
  const v = String(version ?? '').trim();
  try {
    if (v) await AsyncStorage.setItem(storageKey(v), '1');
    if (suppressAllFuture) await AsyncStorage.setItem(SUPPRESS_ALL_KEY, '1');
  } catch {
    /* yok say */
  }
}
