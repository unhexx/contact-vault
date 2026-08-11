import type { ParseWarning } from "../types.js";

export type ExtractedScoring = {
  riskScore: {
    overall: number;
    label?: string;
    categories: Array<{ name: string; flag: 0 | 1 }>;
    articles: Array<{ code: string; category?: string; details?: string }>;
  } | null;
  /** Seed incidents from article lines in header */
  incidents: Array<{
    severity: "high" | "medium" | "low";
    title?: string;
    articleCode?: string;
    body?: Record<string, string>;
  }>;
  /** Index into content after scoring header consumed (or 0) */
  headerEndIndex: number;
  warnings: ParseWarning[];
};

const SCORING_START_RE = /Результаты\s+скоринга/i;
const OVERALL_RE =
  /Общий\s+показатель\s*:\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:[-–—]\s*(.+))?/i;
const CATEGORIES_RE = /Категории\s*:?\s*(.+)/i;
const ARTICLE_RE =
  /Статья\s*№?\s*([0-9]+(?:\s*Ч\.?\s*\d+)?)|Ст\.\s*([0-9]+(?:\s*Ч\.?\s*\d+)?)/gi;

/**
 * Normalize overall score (KD39).
 * Invalid → null + SCORE_PARSE_AMBIGUOUS; (1,100]÷100; [0,1] keep; no clamp to 1.0.
 */
export function normalizeOverallScore(
  rawStr: string,
): { overall: number } | { error: true } {
  const raw = Number(rawStr.replace(",", "."));
  if (Number.isNaN(raw) || raw < 0 || raw > 100) {
    return { error: true };
  }
  if (raw > 1 && raw <= 100) {
    return { overall: raw / 100 };
  }
  // [0, 1]
  return { overall: raw };
}

function normalizeArticleCode(code: string): string {
  return code.replace(/\s+/g, " ").trim();
}

/**
 * Extract scoring header → RiskScore seed + Incident seeds.
 */
export function extractScoring(content: string): ExtractedScoring {
  const warnings: ParseWarning[] = [];
  const incidents: ExtractedScoring["incidents"] = [];

  const hasScoring =
    SCORING_START_RE.test(content) || /Общий\s+показатель\s*:/i.test(content);

  if (!hasScoring) {
    return {
      riskScore: null,
      incidents: [],
      headerEndIndex: 0,
      warnings,
    };
  }

  // Header region: from start until first ==== block or first Имя :
  const blockOrImya = content.search(
    /====\s*(?:Доходы|Адреса)\s*====|(?:={3,}\s*)?Имя\s*:/i,
  );
  const headerEndIndex =
    blockOrImya >= 0 ? blockOrImya : Math.min(content.length, 4096);
  const header = content.slice(0, headerEndIndex);

  // Overall score
  let overall: number | null = null;
  let label: string | undefined;
  const overallMatch = OVERALL_RE.exec(header);
  if (overallMatch) {
    const norm = normalizeOverallScore(overallMatch[1]!);
    if ("error" in norm) {
      warnings.push({
        code: "SCORE_PARSE_AMBIGUOUS",
        message: `Could not normalize overall score: ${overallMatch[1]}`,
        section: "Результаты скоринга",
        severity: "warn",
      });
    } else {
      overall = norm.overall;
    }
    if (overallMatch[2]) {
      let lbl = overallMatch[2].trim().replace(/^[-–—]\s*/, "").trim();
      // First word/phrase as label (e.g. "плохо")
      lbl = (lbl.split(/\s{2,}|\n/)[0] ?? lbl).trim();
      // Trim trailing UK RF noise if captured
      lbl = lbl.replace(/\s+Категории.*$/i, "").trim();
      if (lbl) label = lbl;
    }
  } else if (SCORING_START_RE.test(header)) {
    warnings.push({
      code: "SCORE_PARSE_AMBIGUOUS",
      message: "Scoring header present but overall score missing/unparseable",
      section: "Результаты скоринга",
      severity: "warn",
    });
  }

  // Categories
  const categories: Array<{ name: string; flag: 0 | 1 }> = [];
  const catMatch = CATEGORIES_RE.exec(header);
  if (catMatch) {
    let remainder = catMatch[1]!.trim();
    remainder = remainder.split("\n")[0] ?? remainder;
    const segments = remainder
      .split(/[;,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const seg of segments) {
      const m =
        /^\s*(.+?)\s+([01])\s*$/.exec(seg) ?? /(\S.*?)\s+([01])\b/.exec(seg);
      if (m) {
        const name = m[1]!.trim();
        const flag = Number(m[2]) as 0 | 1;
        if (name) categories.push({ name, flag });
      }
    }
  }

  // Articles → riskScore.articles + incidents (severity high always in v0.1.1)
  const articles: Array<{ code: string; category?: string; details?: string }> =
    [];
  const seenCodes = new Set<string>();
  let artMatch: RegExpExecArray | null;
  const artRe = new RegExp(ARTICLE_RE.source, "gi");
  while ((artMatch = artRe.exec(header)) !== null) {
    const codeRaw = artMatch[1] ?? artMatch[2] ?? "";
    const code = normalizeArticleCode(codeRaw);
    if (!code || seenCodes.has(code)) continue;
    seenCodes.add(code);

    const start = Math.max(0, artMatch.index - 20);
    const end = Math.min(
      header.length,
      artMatch.index + artMatch[0].length + 80,
    );
    const details = header
      .slice(start, end)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);

    articles.push({ code, details });
    incidents.push({
      severity: "high",
      title: `Статья ${code}`,
      articleCode: code,
      body: details ? { snippet: details } : undefined,
    });
  }

  // KD39 / design: riskScore requires parseable overall; incidents may still be non-empty
  const riskScore =
    overall !== null
      ? {
          overall,
          ...(label ? { label } : {}),
          categories,
          articles,
        }
      : null;

  return {
    riskScore,
    incidents,
    headerEndIndex,
    warnings,
  };
}
