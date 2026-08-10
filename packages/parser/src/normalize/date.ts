/**
 * Best-effort date normalization for RU report formats.
 * Accepts: DD.MM.YYYY, MM.YYYY, YYYY, ISO (YYYY-MM-DD[T…]).
 * Returns a stable string (prefer ISO date when full date known).
 */

export function normalizeDate(input: string): string | undefined {
  const s = input.trim();
  if (!s) return undefined;

  // ISO full date (optionally with time)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  // DD.MM.YYYY or DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dmy) {
    const dd = dmy[1]!.padStart(2, "0");
    const mm = dmy[2]!.padStart(2, "0");
    const yyyy = dmy[3]!;
    return `${yyyy}-${mm}-${dd}`;
  }

  // MM.YYYY or MM/YYYY
  const my = s.match(/^(\d{1,2})[./](\d{4})$/);
  if (my) {
    const mm = my[1]!.padStart(2, "0");
    return `${my[2]}-${mm}`;
  }

  // Year only
  if (/^\d{4}$/.test(s)) {
    return s;
  }

  // Fallback: return trimmed original (partial / free-form)
  return s;
}
