/**
 * Phone number normalization utility.
 *
 * Accepted Ethiopian formats (assuming country code +251):
 *   0911223344    → +251911223344
 *   911223344     → +251911223344
 *   +251911223344 → +251911223344
 *   251911223344  → +251911223344
 *   2510911223344 → +251911223344  (leading 0 after country code)
 *
 * Also supports Safaricom Ethiopia (07xx, 7xx) and generic E.164.
 */

/** Default country code used when the input has no international prefix. */
const DEFAULT_COUNTRY_CODE = '251';

/**
 * Normalise any recognised phone format into E.164 (`+<cc><subscriber>`).
 *
 * @param raw  The raw phone string from the user.
 * @param countryCode  Optional override for the default country code (without '+').
 * @returns The normalised E.164 string, or `null` if the input is unparseable.
 */
export function normalizePhone(raw: string, countryCode = DEFAULT_COUNTRY_CODE): string | null {
  if (!raw) return null;

  // Strip whitespace, dashes, dots, parentheses
  let cleaned = raw.replace(/[\s\-().]/g, '');

  // ── Handle explicit "+" prefix ────────────────────────────────────────
  if (cleaned.startsWith('+')) {
    const digits = cleaned.slice(1);
    if (!/^\d{7,15}$/.test(digits)) return null;

    // Strict validation for known country codes:
    if (digits.startsWith('251')) {
      // Ethiopia (+251)
      if (digits.startsWith('2510') && digits.length === 13) {
        const sub = digits.slice(4);
        if (/^[97]\d{8}$/.test(sub)) return `+251${sub}`;
        return null;
      }
      if (digits.length === 12) {
        const sub = digits.slice(3);
        if (/^[97]\d{8}$/.test(sub)) return `+251${sub}`;
        return null;
      }
      // Any other length for +251 is invalid (missing or extra digits)
      return null;
    }

    if (digits.startsWith('1') && digits.length !== 11) return null; // US/Canada
    if (digits.startsWith('44') && digits.length !== 12) return null; // UK
    if (digits.startsWith('254') && digits.length !== 12) return null; // Kenya
    if (digits.startsWith('234') && digits.length !== 13) return null; // Nigeria

    return `+${digits}`;
  }

  // ── From here on everything is digits only ────────────────────────────
  if (!/^\d+$/.test(cleaned)) return null;

  // ── Ethiopian-specific normalisation ──────────────────────────────────
  if (countryCode === '251' || cleaned.startsWith('251') || cleaned.startsWith('09') || cleaned.startsWith('07') || ((cleaned.startsWith('9') || cleaned.startsWith('7')) && cleaned.length === 9)) {
    // Pattern: 2510XXXXXXXXX (13 digits — country code + leading 0 + 9 subscriber)
    if (cleaned.startsWith('2510') && cleaned.length === 13) {
      const sub = cleaned.slice(4);
      if (/^[97]\d{8}$/.test(sub)) return `+251${sub}`;
      return null;
    }

    // Pattern: 251XXXXXXXXX (12 digits — country code + 9 subscriber digits)
    if (cleaned.startsWith('251')) {
      if (cleaned.length === 12) {
        const sub = cleaned.slice(3);
        if (/^[97]\d{8}$/.test(sub)) return `+251${sub}`;
      }
      return null;
    }

    // Pattern: 09XXXXXXXX or 07XXXXXXXX (10 digits — local format with leading 0)
    if (cleaned.startsWith('0')) {
      if (cleaned.length === 10) {
        const sub = cleaned.slice(1);
        if (/^[97]\d{8}$/.test(sub)) return `+251${sub}`;
      }
      return null;
    }

    // Pattern: 9XXXXXXXX or 7XXXXXXXX (9 digits — subscriber-only)
    if (cleaned.length === 9 && (cleaned.startsWith('9') || cleaned.startsWith('7'))) {
      return `+251${cleaned}`;
    }

    // If it looked like an Ethiopian number but didn't match the strict lengths
    return null;
  }

  // ── Generic international without "+" ─────────────────────────────────
  // If the number starts with the country code, prepend "+"
  if (cleaned.startsWith(countryCode)) {
    return `+${cleaned}`;
  }

  // ── Local number for non-Ethiopian country codes ──────────────────────
  // Starts with 0 → strip it and prepend country code
  if (cleaned.startsWith('0') && cleaned.length >= 7) {
    return `+${countryCode}${cleaned.slice(1)}`;
  }

  // Pure subscriber digits (7-10 digits, no leading 0)
  if (cleaned.length >= 7 && cleaned.length <= 10) {
    return `+${countryCode}${cleaned}`;
  }

  return null;
}

/**
 * Quick check: does the string look like it could be a phone number?
 * Used to decide whether to attempt normalisation (vs treating as username).
 */
export function looksLikePhone(value: string): boolean {
  const stripped = value.replace(/[\s\-().]/g, '');
  // Starts with '+' or is all-digits with length 7-15
  if (stripped.startsWith('+') && /^\+\d{7,15}$/.test(stripped)) return true;
  if (/^\d{7,15}$/.test(stripped)) return true;
  // Ethiopian local with leading 0
  if (/^0\d{9}$/.test(stripped)) return true;
  return false;
}
