/**
 * Extract Void SPA embedded JSON (Appendix A).
 * Priority short-circuit on first successful JSON parse:
 * 1. window.__REPORT_EMBED__ = …
 * 2. <script id="__report_embed__" type="application/json">…
 * No live /api/report poll (out of scope).
 */

export type EmbedExtractResult =
  | { ok: true; data: unknown; source: "window.__REPORT_EMBED__" | "script#__report_embed__" }
  | { ok: false; reason: "missing" | "parse_error"; message: string };

/**
 * Try to parse a JS object-literal / JSON assignment body.
 * Supports trailing semicolon; input should be the `{...}` payload.
 */
function tryParseJsonPayload(raw: string): unknown | undefined {
  const trimmed = raw.trim().replace(/;\s*$/, "");
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

/** Extract balanced `{...}` starting at first `{`. */
function extractBalancedObject(src: string, fromIndex: number): string | undefined {
  const start = src.indexOf("{", fromIndex);
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  let escape = false;
  let quote: string | null = null;
  for (let i = start; i < src.length; i++) {
    const ch = src[i]!;
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === quote) {
        inString = false;
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return src.slice(start, i + 1);
      }
    }
  }
  return undefined;
}

/**
 * 1) window.__REPORT_EMBED__ = { ... };
 *    Also matches bare __REPORT_EMBED__ = { ... };
 */
function extractWindowAssign(html: string): EmbedExtractResult | null {
  const re = /(?:window\.)?__REPORT_EMBED__\s*=\s*/;
  const m = re.exec(html);
  if (!m || m.index === undefined) return null;
  const obj = extractBalancedObject(html, m.index + m[0].length - 1);
  if (!obj) {
    return {
      ok: false,
      reason: "parse_error",
      message: "Found __REPORT_EMBED__ assignment but could not extract object",
    };
  }
  const parsed = tryParseJsonPayload(obj);
  if (parsed === undefined) {
    return {
      ok: false,
      reason: "parse_error",
      message: "Failed to JSON.parse window.__REPORT_EMBED__ payload",
    };
  }
  return { ok: true, data: parsed, source: "window.__REPORT_EMBED__" };
}

/**
 * 2) <script id="__report_embed__" type="application/json">…</script>
 * Attribute order flexible; id match case-insensitive.
 */
function extractScriptTag(html: string): EmbedExtractResult | null {
  const re =
    /<script\b[^>]*\bid\s*=\s*["']__report_embed__["'][^>]*>([\s\S]*?)<\/script>/i;
  const m = re.exec(html);
  if (!m) {
    // Also try type=application/json with __report_embed__ nearby
    const re2 =
      /<script\b[^>]*type\s*=\s*["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;
    while ((match = re2.exec(html)) !== null) {
      const openEnd = html.indexOf(">", match.index);
      const openTag = html.slice(match.index, openEnd + 1);
      if (!/__report_embed__/i.test(openTag)) continue;
      const body = match[1] ?? "";
      const parsed = tryParseJsonPayload(body);
      if (parsed !== undefined) {
        return { ok: true, data: parsed, source: "script#__report_embed__" };
      }
    }
    return null;
  }
  const body = m[1] ?? "";
  const parsed = tryParseJsonPayload(body);
  if (parsed === undefined) {
    return {
      ok: false,
      reason: "parse_error",
      message: "Failed to JSON.parse script#__report_embed__ body",
    };
  }
  return { ok: true, data: parsed, source: "script#__report_embed__" };
}

/**
 * Extract embed JSON from Void HTML content.
 * Short-circuits on first successful parse (window assign then script tag).
 */
export function extractReportEmbed(html: string): EmbedExtractResult {
  // Prefer window assign first per design priority
  const fromWindow = extractWindowAssign(html);
  if (fromWindow?.ok) return fromWindow;
  // If window assign present but failed parse, still try script tag before failing
  const fromScript = extractScriptTag(html);
  if (fromScript?.ok) return fromScript;
  if (fromWindow && !fromWindow.ok) return fromWindow;
  if (fromScript && !fromScript.ok) return fromScript;
  return {
    ok: false,
    reason: "missing",
    message: "No __REPORT_EMBED__ / __report_embed__ payload found",
  };
}
