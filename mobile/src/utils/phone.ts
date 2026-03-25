const NON_DIGIT = /[^\d+]/g;

export function normalizeE164(input: string, countryCode = '90'): string | null {
  const raw = (input || '').trim().replace(NON_DIGIT, '');
  if (!raw) return null;

  // Already E.164-ish
  if (raw.startsWith('+')) {
    const digits = raw.replace(/[^\d]/g, '');
    return digits.length >= 10 ? `+${digits}` : null;
  }

  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length < 10) return null;

  // TR common cases:
  // - 05xxxxxxxxx (11) -> +90 5xxxxxxxxx
  // - 5xxxxxxxxx (10) -> +90 5xxxxxxxxx
  if (countryCode === '90') {
    if (digits.length === 11 && digits.startsWith('0')) return `+90${digits.slice(1)}`;
    if (digits.length === 10 && digits.startsWith('5')) return `+90${digits}`;
    if (digits.length === 12 && digits.startsWith('90')) return `+${digits}`;
  }

  // Fallback: assume given digits already include country code.
  return `+${digits}`;
}

/** Profil düzenlemede +90 sonrası gösterilecek rakamlar. */
export function nationalDigitsAfterTrCountry(e164: string): string {
  if (!e164?.trim()) return '';
  const t = e164.trim();
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

