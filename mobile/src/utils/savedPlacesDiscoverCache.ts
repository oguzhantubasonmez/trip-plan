import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StopPresentationPayload } from './presentationModel';

const PREFIX = 'rw_disc_saved:v1:';

function key(googlePlaceId: string): string {
  return `${PREFIX}${googlePlaceId.trim()}`;
}

type Stored = {
  v: 1;
  savedAtMs: number;
  payload: StopPresentationPayload;
};

export async function readSavedPlaceDiscoverCache(
  googlePlaceId: string
): Promise<StopPresentationPayload | null> {
  const gid = googlePlaceId.trim();
  if (!gid) return null;
  try {
    const raw = await AsyncStorage.getItem(key(gid));
    if (!raw) return null;
    const j = JSON.parse(raw) as Stored;
    if (j?.v !== 1 || !j.payload || typeof j.payload !== 'object') return null;
    return j.payload as StopPresentationPayload;
  } catch {
    return null;
  }
}

export async function writeSavedPlaceDiscoverCache(
  googlePlaceId: string,
  payload: StopPresentationPayload
): Promise<void> {
  const gid = googlePlaceId.trim();
  if (!gid) return;
  try {
    const row: Stored = { v: 1, savedAtMs: Date.now(), payload };
    await AsyncStorage.setItem(key(gid), JSON.stringify(row));
  } catch {
    /* */
  }
}

export async function removeSavedPlaceDiscoverCache(googlePlaceId: string): Promise<void> {
  const gid = googlePlaceId.trim();
  if (!gid) return;
  try {
    await AsyncStorage.removeItem(key(gid));
  } catch {
    /* */
  }
}
