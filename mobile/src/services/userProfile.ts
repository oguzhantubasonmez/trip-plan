import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { canonicalizeTrPhoneE164, normalizeE164 } from '../utils/phone';
import { normalizeNameSearchKey } from '../utils/searchText';

function coerceStoredPhoneE164(raw: string): string {
  const t = String(raw ?? '').trim();
  if (!t) return '';
  return canonicalizeTrPhoneE164(t) || normalizeE164(t) || '';
}

export type ExpenseType = {
  id: string;
  name: string;
};

/** Sabit id’ler; durak masrafı ve profil listesi bu kimliklerle hizalanır. */
export const DEFAULT_EXPENSE_TYPES: ExpenseType[] = [
  { id: 'et_std_yemek', name: 'Yemek' },
  { id: 'et_std_icecek', name: 'İçecek' },
  { id: 'et_std_konaklama', name: 'Konaklama' },
  { id: 'et_std_diger', name: 'Diğer' },
];

export const DEFAULT_EXPENSE_TYPE_IDS = new Set(DEFAULT_EXPENSE_TYPES.map((x) => x.id));

/** Firestore’daki listeye standart türleri ekler; sıra: önce dört standart, sonra kullanıcı türleri. */
export function mergeDefaultExpenseTypes(existing: ExpenseType[]): ExpenseType[] {
  const byId = new Map<string, ExpenseType>();
  for (const e of existing) byId.set(e.id, e);
  for (const d of DEFAULT_EXPENSE_TYPES) {
    if (!byId.has(d.id)) byId.set(d.id, d);
  }
  const out: ExpenseType[] = DEFAULT_EXPENSE_TYPES.map((d) => byId.get(d.id)!);
  for (const e of existing) {
    if (!DEFAULT_EXPENSE_TYPE_IDS.has(e.id)) out.push(e);
  }
  return out;
}

function parseExpenseTypes(v: any): ExpenseType[] {
  if (!Array.isArray(v)) return [];
  const out: ExpenseType[] = [];
  for (const x of v) {
    if (x && typeof x.id === 'string' && typeof x.name === 'string' && x.name.trim()) {
      out.push({ id: x.id, name: x.name.trim() });
    }
  }
  return out;
}

export type UserProfile = {
  uid: string;
  phoneNumber: string;
  /** Kayıt e-postası (Auth ile aynı; profil senkronu) */
  email?: string;
  displayName?: string;
  avatar?: string;
  carConsumption?: string;
  friends?: string[];
  /** Kullanıcının tanımladığı ekstra masraf türleri (durak masrafında seçilir) */
  expenseTypes?: ExpenseType[];
};

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const v = snap.data() as any;
  return {
    uid: snap.id,
    phoneNumber: v.phoneNumber ?? '',
    email: v.email,
    displayName: v.displayName,
    avatar: v.avatar,
    carConsumption: v.carConsumption,
    friends: v.friends || [],
    expenseTypes: mergeDefaultExpenseTypes(parseExpenseTypes(v.expenseTypes)),
  };
}

export async function ensureUserDoc(params: {
  uid: string;
  phoneNumber: string;
  displayName?: string;
  email?: string;
}) {
  const ref = doc(db, 'users', params.uid);
  const snap = await getDoc(ref);
  const name = params.displayName?.trim() ?? '';
  const emailNorm = params.email?.trim().toLowerCase() ?? '';
  if (!snap.exists()) {
    await setDoc(
      ref,
      {
        uid: params.uid,
        phoneNumber: coerceStoredPhoneE164(params.phoneNumber),
        email: emailNorm,
        displayName: name,
        displayNameLower: name ? normalizeNameSearchKey(name) : '',
        avatar: '',
        friends: [],
        expenseTypes: DEFAULT_EXPENSE_TYPES,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } else {
    const updates: Record<string, unknown> = {
      phoneNumber: params.phoneNumber,
      updatedAt: serverTimestamp(),
    };
    if (name) {
      updates.displayName = name;
      updates.displayNameLower = normalizeNameSearchKey(name);
    }
    if (emailNorm) updates.email = emailNorm;
    await updateDoc(ref, updates);
  }
}

/** Giriş sonrası: belge yoksa minimal oluşturur; varsa e-postayı günceller. */
export async function ensureUserDocAfterSignIn(params: { uid: string; email: string }): Promise<void> {
  const ref = doc(db, 'users', params.uid);
  const snap = await getDoc(ref);
  const emailNorm = params.email.trim().toLowerCase();
  if (!snap.exists()) {
    await setDoc(
      ref,
      {
        uid: params.uid,
        email: emailNorm,
        phoneNumber: '',
        displayName: '',
        displayNameLower: '',
        avatar: '',
        friends: [],
        expenseTypes: DEFAULT_EXPENSE_TYPES,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    return;
  }
  await updateDoc(ref, { email: emailNorm, updatedAt: serverTimestamp() });
}

export async function updateUserProfile(
  uid: string,
  data: {
    displayName?: string;
    carConsumption?: string;
    expenseTypes?: ExpenseType[];
    /** E.164; rehber eşleştirmesi için */
    phoneNumber?: string;
  }
): Promise<void> {
  const ref = doc(db, 'users', uid);
  const updates: Record<string, any> = { updatedAt: serverTimestamp() };
  if (data.displayName !== undefined) {
    const t = String(data.displayName).trim();
    updates.displayName = t;
    updates.displayNameLower = normalizeNameSearchKey(t);
  }
  if (data.carConsumption !== undefined) updates.carConsumption = data.carConsumption;
  if (data.expenseTypes !== undefined) updates.expenseTypes = mergeDefaultExpenseTypes(data.expenseTypes);
  if (data.phoneNumber !== undefined) {
    const p = String(data.phoneNumber).trim();
    updates.phoneNumber = p ? coerceStoredPhoneE164(p) : '';
  }
  await updateDoc(ref, updates);
}

export async function getUsersByUids(uids: string[]): Promise<Map<string, UserProfile>> {
  const map = new Map<string, UserProfile>();
  const uniqueUids = Array.from(new Set(uids)).filter(Boolean);
  await Promise.all(
    uniqueUids.map(async (id) => {
      const u = await getUserProfile(id);
      if (u) map.set(id, u);
    })
  );
  return map;
}

