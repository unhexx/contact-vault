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
 * - record delimiter Label==== Имя : (with or without leading newline — Issue 8)
 * - bare Имя : at line start (newline-required to avoid mid-prose matches)
 * - EOS
 *
 * Critical: `(?:={3,}\s*)?Имя` alone is wrong — optional equals sits in the lookahead
 * and leaves `ИсточникТест` inside the capture (Issue 1).
 * Use `\S+={3,}\s*Имя` so the source label is part of the stop pattern, not the body.
 */
// NOTE: do NOT use /m — `$` would match end-of-line and truncate multi-line bodies.
const BLOCK_RE =
  /====\s*(Доходы|Адреса)\s*====\s*([\s\S]*?)(?=\n====\s*(?:Доходы|Адреса)\s*====|\S+={3,}\s*Имя\s*:|\n\s*Имя\s*:|$)/gi;

/**
 * Only strip a true trailing source-label stub: `Label====` with no following Имя
 * (partial delimiter left if content was malformed). Never drop arbitrary single-word
 * lines like `Москва` or `Зарплата` (Issue 7).
 */
function stripTrailingSourceLabelStub(body: string): string {
  return body.replace(/(?:\r?\n)+\S+={3,}\s*$/u, "").trim();
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
    const body = stripTrailingSourceLabelStub(m[2] ?? "");
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
