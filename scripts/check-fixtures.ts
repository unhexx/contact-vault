/**
 * Fixture / sample forbid-list (PR8 release gate).
 *
 * Scans synthetic fixtures and samples for markers that indicate real PII
 * dumps, production data, or high-risk secrets. Exit 1 on any hit.
 *
 * Usage: pnpm check:fixtures
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

/** Directories relative to repo root that must stay synthetic-only. */
const SCAN_ROOTS = [
  "packages/parser/fixtures",
  "samples",
] as const;

const TEXT_EXT = new Set([
  ".txt",
  ".html",
  ".htm",
  ".json",
  ".md",
  ".csv",
  ".xml",
  ".js",
  ".ts",
]);

/**
 * Patterns that must never appear in committed fixtures/samples.
 * Intentional: catch non-synthetic dumps and telecom secrets.
 */
const FORBIDDEN: Array<{ id: string; re: RegExp; hint: string }> = [
  {
    id: "REAL_PII_MARKER",
    re: /REAL[_\s-]?PII/i,
    hint: "explicit real-PII marker",
  },
  {
    id: "LIVE_DUMP",
    re: /\blive\s+dump\b/i,
    hint: "live dump wording",
  },
  {
    id: "PRODUCTION_DATA",
    re: /\bproduction\s+data\b/i,
    hint: "production data wording",
  },
  {
    id: "REDACTED_FROM_LIVE",
    re: /redacted\s+from\s+(live|real|prod)/i,
    hint: "redacted live/prod dump",
  },
  {
    id: "NOT_FOR_GIT",
    re: /NOT[_\s-]?FOR[_\s-]?(GIT|COMMIT|REPO)/i,
    hint: "not-for-git marker",
  },
  {
    id: "CONFIDENTIAL_MARKER",
    re: /\bCONFIDENTIAL\b/,
    hint: "confidential marker (use synthetic fixtures only)",
  },
  {
    id: "FROM_PRODUCTION",
    re: /\bfrom\s+production\b/i,
    hint: "from-production wording",
  },
  // High-risk telecom secrets — reject non-placeholder PIN/PUK values
  {
    id: "PIN_VALUE",
    re: /\bPIN\s*[:=]\s*(?!0{4,8}\b)\d{4,8}\b/i,
    hint: "non-placeholder PIN value",
  },
  {
    id: "PUK_VALUE",
    re: /\bPUK\s*[:=]\s*(?!0{6,12}\b)\d{6,12}\b/i,
    hint: "non-placeholder PUK value",
  },
];

type Hit = {
  file: string;
  id: string;
  hint: string;
  line: number;
  excerpt: string;
};

function walkFiles(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".git" || name === "private") {
      continue;
    }
    const full = path.join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walkFiles(full, out);
    } else if (st.isFile()) {
      const ext = path.extname(name).toLowerCase();
      if (TEXT_EXT.has(ext) || ext === "") {
        // skip empty-ext binaries heuristically by size later
        out.push(full);
      }
    }
  }
}

function scanFile(abs: string): Hit[] {
  let content: string;
  try {
    const buf = readFileSync(abs);
    // skip likely binary
    if (buf.includes(0)) return [];
    content = buf.toString("utf8");
  } catch {
    return [];
  }

  const rel = path.relative(repoRoot, abs);
  const hits: Hit[] = [];
  const lines = content.split(/\r?\n/);

  for (const rule of FORBIDDEN) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (rule.re.test(line)) {
        hits.push({
          file: rel,
          id: rule.id,
          hint: rule.hint,
          line: i + 1,
          excerpt: line.trim().slice(0, 160),
        });
      }
    }
  }
  return hits;
}

function main(): number {
  const files: string[] = [];
  for (const root of SCAN_ROOTS) {
    const abs = path.join(repoRoot, root);
    walkFiles(abs, files);
  }

  if (files.length === 0) {
    console.error(
      "check:fixtures: no files found under packages/parser/fixtures or samples/",
    );
    return 1;
  }

  const allHits: Hit[] = [];
  for (const f of files) {
    allHits.push(...scanFile(f));
  }

  console.log(
    `check:fixtures: scanned ${files.length} file(s) under ${SCAN_ROOTS.join(", ")}`,
  );

  if (allHits.length === 0) {
    console.log("check:fixtures: OK — no forbidden markers");
    return 0;
  }

  console.error(
    `check:fixtures: FAILED — ${allHits.length} forbidden marker hit(s):\n`,
  );
  for (const h of allHits) {
    console.error(
      `  [${h.id}] ${h.file}:${h.line} — ${h.hint}\n    ${h.excerpt}`,
    );
  }
  console.error(
    "\nOnly synthetic fixtures/samples may be committed (see docs/08-LEGAL-ETHICS/Data-Handling.md).",
  );
  return 1;
}

process.exit(main());
