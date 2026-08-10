/**
 * Russian-first phone normalization toward E.164.
 * Success → { e164, raw? }; failure → { raw } only (caller emits PHONE_UNNORMALIZED).
 */

export type PhoneNormalizeResult =
  | { ok: true; e164: string; raw: string }
  | { ok: false; raw: string };

/**
 * Normalize a phone string to E.164 for RU numbers.
 * Accepts: +7…, 8…, 7…, with spaces/dashes/parens.
 * Non-RU international (+other) kept if already valid-looking E.164 digits.
 */
export function normalizePhone(input: string): PhoneNormalizeResult {
  const raw = input.trim();
  if (!raw) {
    return { ok: false, raw: input };
  }

  // Keep only digits and leading +
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");

  if (!digits) {
    return { ok: false, raw };
  }

  // RU: 11 digits starting with 7 or 8 → +7XXXXXXXXXX
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    const national = digits.slice(1);
    if (national.length === 10 && /^[3-9]/.test(national)) {
      return { ok: true, e164: `+7${national}`, raw };
    }
  }

  // RU: 10 digits national (mobile/city starting 3-9)
  if (digits.length === 10 && /^[3-9]/.test(digits)) {
    return { ok: true, e164: `+7${digits}`, raw };
  }

  // Already E.164-ish: + and 10–15 digits, leading country code
  if (hasPlus && digits.length >= 10 && digits.length <= 15) {
    return { ok: true, e164: `+${digits}`, raw };
  }

  // Digits-only international starting with country code (not 8-local)
  if (!hasPlus && digits.length >= 11 && digits.length <= 15 && digits.startsWith("7")) {
    const national = digits.slice(1);
    if (national.length === 10) {
      return { ok: true, e164: `+7${national}`, raw };
    }
  }

  return { ok: false, raw };
}
