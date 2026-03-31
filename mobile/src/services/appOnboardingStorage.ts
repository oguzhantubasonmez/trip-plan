import AsyncStorage from '@react-native-async-storage/async-storage';

const prefix = 'rw_app_onboarding_v1_';

function key(uid: string): string {
  return `${prefix}${uid}`;
}

export async function isAppOnboardingDoneForUser(uid: string): Promise<boolean> {
  const id = String(uid ?? '').trim();
  if (!id) return true;
  const v = await AsyncStorage.getItem(key(id));
  return v === '1';
}

export async function setAppOnboardingDoneForUser(uid: string): Promise<void> {
  const id = String(uid ?? '').trim();
  if (!id) return;
  await AsyncStorage.setItem(key(id), '1');
}
