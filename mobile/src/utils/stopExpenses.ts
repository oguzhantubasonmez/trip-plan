import type { Stop, StopExtraExpense } from '../types/trip';

/** Firestore `extraExpenses` alanını oku */
export function parseStopExtraExpensesFromFirestore(raw: unknown): StopExtraExpense[] | undefined {
  return parseStoredExtraExpenses(raw);
}

function parseStoredExtraExpenses(raw: unknown): StopExtraExpense[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: StopExtraExpense[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    let expenseId = typeof o.expenseId === 'string' && o.expenseId.trim() ? o.expenseId.trim() : '';
    const amount = typeof o.amount === 'number' ? o.amount : parseFloat(String(o.amount));
    if (Number.isNaN(amount) || amount <= 0) continue;
    if (!expenseId) expenseId = `fs_${out.length}_${Math.round(amount * 100)}`;
    out.push({
      expenseId,
      amount: Math.round(amount * 100) / 100,
      extraExpenseTypeId:
        o.extraExpenseTypeId === null || o.extraExpenseTypeId === undefined
          ? undefined
          : String(o.extraExpenseTypeId),
      extraExpenseTypeName:
        o.extraExpenseTypeName === null || o.extraExpenseTypeName === undefined
          ? undefined
          : String(o.extraExpenseTypeName),
    });
  }
  return out.length > 0 ? out : undefined;
}

/** Tek satır gösterim metni (örn. 200 TL · İçecek) */
export function formatStopExtraExpenseLine(e: StopExtraExpense): string {
  const name = e.extraExpenseTypeName?.trim();
  return name ? `${e.amount} TL · ${name}` : `${e.amount} TL`;
}

/** Firestore’dan gelen durak için tek liste (çoklu masraf + eski tek `cost` uyumu) */
export function normalizeStopExtraExpenses(stop: Stop): StopExtraExpense[] {
  const fromArray = parseStoredExtraExpenses(stop.extraExpenses as unknown);
  if (fromArray && fromArray.length > 0) return fromArray;
  if (stop.cost != null && !Number.isNaN(stop.cost) && stop.cost > 0) {
    return [
      {
        expenseId: 'legacy',
        amount: Math.round(stop.cost * 100) / 100,
        extraExpenseTypeId: stop.extraExpenseTypeId ?? undefined,
        extraExpenseTypeName: stop.extraExpenseTypeName ?? undefined,
      },
    ];
  }
  return [];
}

export function stopExtraTotal(stop: Stop): number {
  return Math.round(
    normalizeStopExtraExpenses(stop).reduce((s, e) => s + e.amount, 0) * 100
  ) / 100;
}

export function newExpenseId(): string {
  return `ex_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Kayıt için: legacy satırları kalıcı id ile değiştir */
export function materializeExpenseIds(list: StopExtraExpense[]): StopExtraExpense[] {
  return list.map((e) =>
    e.expenseId === 'legacy' ? { ...e, expenseId: newExpenseId() } : e
  );
}

/** Kayıt / API öncesi: geçersiz satırları at, tutarları yuvarla */
export function sanitizeExtraExpensesInput(list: StopExtraExpense[] | null | undefined): StopExtraExpense[] {
  if (!Array.isArray(list)) return [];
  const out: StopExtraExpense[] = [];
  for (const e of list) {
    if (!e || typeof e !== 'object') continue;
    const id = typeof e.expenseId === 'string' && e.expenseId.trim() ? e.expenseId.trim() : '';
    const amt = typeof e.amount === 'number' ? e.amount : parseFloat(String(e.amount));
    if (!id || Number.isNaN(amt) || amt <= 0) continue;
    out.push({
      expenseId: id,
      amount: Math.round(amt * 100) / 100,
      extraExpenseTypeId:
        e.extraExpenseTypeId === null || e.extraExpenseTypeId === undefined || e.extraExpenseTypeId === ''
          ? null
          : String(e.extraExpenseTypeId),
      extraExpenseTypeName:
        e.extraExpenseTypeName === null || e.extraExpenseTypeName === undefined
          ? null
          : String(e.extraExpenseTypeName).trim() || null,
    });
  }
  return out;
}
