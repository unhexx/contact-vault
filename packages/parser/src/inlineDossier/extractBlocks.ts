export type ExtractedBlocks = {
  incomesRaw?: string;
  addressesRaw?: string;
  /**
   * Full content for record scan (splitRecords keys off Имя markers).
   * Scoring header and block bodies remain in this string; they are not stripped.
   */
  body: string;
};

/**
 * Block body ends before:
 * - next ====Доходы==== / ====Адреса==== header
 * - record delimiter Label==== Имя : (source label must NOT be absorbed into block)
 * - bare Имя : at line start
 * - EOS
 *
 * Critical: `(?:={3,}\s*)?Имя` alone is wrong — optional equals sits in the lookahead
 * and leaves `ИсточникТест` inside the capture (Issue 1).
 */
// NOTE: do NOT use /m — `$` would match end-of-line and truncate multi-line bodies.
const BLOCK_RE =
  /====\s*(Доходы|Адреса)\s*====\s*([\s\S]*?)(?=\n====\s*(?:Доходы|Адреса)\s*====|\n\S+={3,}\s*Имя\s*:|\n\s*Имя\s*:|$)/gi;

/**
 * Defense-in-depth: drop a trailing bare source-label line (no address/income markers).
 */
function stripTrailingSourceLabel(body: string): string {
  let cleaned = body.trim();
  // Trailing "Label====" without Имя (shouldn't happen with fixed lookahead, but safe)
  cleaned = cleaned.replace(/(?:\r?\n)+\S+={3,}\s*$/u, "").trim();

  const lines = cleaned.split(/\n/);
  if (lines.length === 0) return cleaned;
  const last = lines[lines.length - 1]!.trim();
  if (
    last &&
    !/[;,]|г\.|ул\.|д\.|обл|край|респ|\d{4,}|ооо|ип/i.test(last) &&
    /^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё0-9_]*$/.test(last)
  ) {
    lines.pop();
    cleaned = lines.join("\n").trim();
  }
  return cleaned;
}

/**
 * Extract ====Доходы==== / ====Адреса==== bodies.
 * `body` is the full input (records located via Имя markers in splitRecords).
 */
export function extractBlocks(content: string): ExtractedBlocks {
  let incomesRaw: string | undefined;
  let addressesRaw: string | undefined;

  const re = new RegExp(BLOCK_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const title = m[1]!.toLowerCase();
    const body = stripTrailingSourceLabel(m[2] ?? "");
    if (title === "доходы") {
      incomesRaw = body;
    } else if (title === "адреса") {
      addressesRaw = body;
    }
  }

  return {
    ...(incomesRaw !== undefined ? { incomesRaw } : {}),
    ...(addressesRaw !== undefined ? { addressesRaw } : {}),
    body: content,
  };
}

export type LeanFinancialFact = {
  raw: string;
  amount?: string;
  year?: string;
  employer?: string;
};

/**
 * Parse incomes block lines → lean financial rows.
 * Heuristic: employer text + amount + year (e.g. "ООО ТестСтрой 450000 2022").
 */
export function parseIncomesBlock(raw: string): LeanFinancialFact[] {
  const lines = raw
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const facts: LeanFinancialFact[] = [];

  for (const line of lines) {
    const m = /^(.+?)\s+(\d[\d\s]*)\s+((?:19|20)\d{2})\s*$/.exec(line);
    if (m) {
      facts.push({
        raw: line,
        employer: m[1]!.trim(),
        amount: m[2]!.replace(/\s+/g, ""),
        year: m[3],
      });
      continue;
    }
    const yearOnly = line.match(/\b((?:19|20)\d{2})\b/);
    const amountOnly = line.match(/\b(\d{4,})\b/);
    const employer = line
      .replace(/\b\d[\d\s]*\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    facts.push({
      raw: line,
      ...(amountOnly ? { amount: amountOnly[1] } : {}),
      ...(yearOnly ? { year: yearOnly[1] } : {}),
      ...(employer ? { employer } : {}),
    });
  }

  return facts;
}

/**
 * Split addresses blob on region/city patterns / semicolons.
 */
export function parseAddressesBlob(raw: string): {
  addresses: string[];
  unsplit: boolean;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { addresses: [], unsplit: false };

  let parts = trimmed
    .split(/[;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    const aggressive = trimmed
      .split(/(?=\s*г\.\s)|(?=\s*обл\.)|(?=\s*край\b)|(?=\s*респ\.)/i)
      .map((s) => s.trim())
      .filter(Boolean);
    if (aggressive.length > 1) {
      parts = aggressive;
    }
  }

  if (parts.length <= 1) {
    return { addresses: [trimmed], unsplit: true };
  }

  return { addresses: parts, unsplit: false };
}
