const NON_DIGIT = /[^\d+]/g;

export function digitsOnly(input: string): string {
  return String(input ?? '').replace(/\D/g, '');
}

/**
 * TR cep için kanonik rakamlar: 905XXXXXXXXX (12 hane, ülke kodu 90 + 10 haneli 5… numara).
 * Düzeltir: +9090… (çift ülke kodu), 9005… (+90 sonrası fazla 0), vb.
 */
export function canonicalizeTurkeyE164Digits(d: string): string | null {
  let x = digitsOnly(d);
  if (!x) return null;
  if (x.startsWith('00')) x = x.slice(2);

  // 90905374266829 → 905374266829 (90 + 90 + 5xxxxxxxx)
  for (let i = 0; i < 4; i++) {
    const dup = x.match(/^90(90)(5\d{9})$/);
    if (dup) {
      x = '90' + dup[2];
      continue;
    }
    const zero5 = x.match(/^900(5\d{9})$/);
    if (zero5) {
      x = '90' + zero5[1];
      continue;
    }
    break;
  }

  if (x.startsWith('9090') && x.length >= 13) {
    const rest = x.slice(4);
    if (/^5\d{9}$/.test(rest)) x = '90' + rest;
    else if (/^05\d{9}$/.test(rest)) x = '90' + rest.slice(1);
  }

  if (x.length === 11 && x.startsWith('05')) x = '90' + x.slice(1);
  if (x.length === 11 && x.startsWith('0') && x[1] === '5') x = '90' + x.slice(1);
  if (x.length === 10 && x.startsWith('5')) x = '90' + x;

  if (/^905\d{9}$/.test(x)) return x;

  if (x.startsWith('90') && x.length >= 12) return x;

  return null;
}

/** Giriş / profil / Firestore için tek biçim +905XXXXXXXXX */
export function canonicalizeTrPhoneE164(input: string | null | undefined): string | null {
  if (input == null || !String(input).trim()) return null;
  const c = canonicalizeTurkeyE164Digits(input);
  return c ? `+${c}` : null;
}

/**
 * Rehberdeki doğru numarayla Firestore’daki hatalı kayıtları (ör. +9090…) bulmak için
 * `in` sorgusunda denenecek tüm stringler (kanonik + bilinen hatalı varyantlar).
 */
export function trPhoneFirestoreMatchVariants(e164OrRaw: string): string[] {
  const canon = canonicalizeTrPhoneE164(e164OrRaw);
  if (!canon) return [e164OrRaw.trim()].filter(Boolean);
  const d = digitsOnly(canon);
  const out = new Set<string>();
  out.add(canon);
  if (/^905\d{9}$/.test(d)) {
    const nat10 = d.slice(2);
    out.add(`+9090${nat10}`);
    out.add(`+900${nat10}`);
  }
  return [...out];
}

export function normalizeE164(input: string, countryCode = '90'): string | null {
  const raw = (input || '').trim();
  if (!raw) return null;

  let digits = raw.replace(NON_DIGIT, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);

  if (countryCode === '90') {
    if (!digits.startsWith('90')) {
      if (digits.length === 11 && digits.startsWith('0')) digits = '90' + digits.slice(1);
      else if (digits.length === 10 && digits.startsWith('5')) digits = '90' + digits;
      else if (raw.startsWith('+') && digits.length >= 10) return `+${digits}`;
      else return null;
    }

    const c = canonicalizeTurkeyE164Digits(digits);
    return c ? `+${c}` : null;
  }

  if (raw.startsWith('+')) {
    return digits.length >= 10 ? `+${digits}` : null;
  }

  return digits.length >= 10 ? `+${digits}` : null;
}

/** Profil düzenlemede +90 sonrası gösterilecek rakamlar. */
export function nationalDigitsAfterTrCountry(e164: string): string {
  const canon = canonicalizeTrPhoneE164(e164);
  const t = canon?.trim() || e164.trim();
  if (t.startsWith('+90')) return t.slice(3).replace(/[^\d]/g, '');
  const digits = t.replace(/[^\d]/g, '');
  if (digits.startsWith('90') && digits.length >= 12) return digits.slice(2);
  return digits.replace(/^0/, '');
}

export function maskPhone(e164: string): string {
  const digits = e164.replace(/[^\d]/g, '');
  if (digits.length < 6) return e164;
  return `+${digits.slice(0, 2)} ${digits.slice(2, 5)}***${digits.slice(-2)}`;
}
