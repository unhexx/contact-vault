# ADR-003: Multi-Format Parsing Strategy

**Status:** Accepted  
**Date:** 2026-08-10  
**Deciders:** Team

## Context

Contact Vault must ingest person dossiers from at least two observed export formats produced by Void-style tools:

1. **Void HTML SPA report** — self-contained HTML with embedded JSON payload (`status`/`data` with `profile`, `groups`, `addresses`, …).
2. **Sectioned plain-text report** — UTF-8 text file with blocks delimited by `=== Source Name [Year] ===` and `Key: Value` lines under each block. First block is often `=== Общая сводка ===` (aggregated multi-value summary).

Both formats describe the same underlying domain concepts and must converge on the same domain model and Provenance structure.

## Decision

### Format detection

```ts
function detectReportFormat(input: string | Buffer): "void-html" | "sectioned-text" | "unknown"
```

- If content contains `<html` / `<script` and a JSON payload matching the Void shape → `void-html`
- If content matches `/^=== .+ ===\s*$/m` (multiple section headers) → `sectioned-text`
- Otherwise → `unknown` (reject or manual override)

### Parser package layout

```
packages/parser/
  src/
    detect-format.ts
    void-html/          # extract embedded JSON → RawReport
    sectioned-text/     # split sections → RawReport
    normalize/          # RawReport → domain facts / Person draft (shared)
    index.ts            # public parseReport(input) → ParseResult
```

Both format-specific parsers emit the **same intermediate** `RawReport`:

```ts
type RawReport = {
  format: "void-html" | "sectioned-text";
  query?: string;
  contentHash: string;
  summary?: Record<string, string[]>;   // from Общая сводка or profile
  sources: Array<{
    name: string;                       // e.g. "Клиенты T2.ru 2024"
    records: Array<Record<string, string>>;
  }>;
  raw?: unknown;                        // original payload for debugging
};
```

The shared normalizer is the single place that:
- Maps Russian keys → domain fields (alias table)
- Parses FIO + embedded DOB
- Normalizes phones to E.164
- Detects document types (passport / snils / oms / inn…)
- Builds Provenance for every fact
- Emits domain objects / events

### Sectioned-text specifics

1. Split on `/^===\s*(.+?)\s*===\s*$/gm`
2. Section titled (case-insensitive) `Общая сводка` / `Сводка` → `summary` (values split by `,` or `;`)
3. All other sections → `sources[]`. Identical consecutive titles become multiple `records` under one source name.
4. Lines parsed as `^([^:]+):\s*(.*)$` (trim). Empty values kept.
5. Multi-record sources (ФОМС, T2.ru, DPD, credit history…) preserved as separate records.

### Domain impact

- No breaking changes to the Person aggregate.
- Optional structured `meta` or `TelecomSubscription` for PIN/PUK/tariff history attached to the primary phone ContactPoint.
- Related persons appearing in OMS/FOMS (e.g. child) → Relationship + relatedPersonHint (or candidate Person if strong identifiers present).
- Phonebook aliases → NameVariant with low confidence + tag `phonebook` / `noise`.

### Idempotency

`contentHash = sha256(normalized text or JSON)`. Re-import of the same file is a no-op (or provenance refresh only).

## Consequences

**Positive**
- Single domain pipeline for both formats
- Easy to add a third format later (CSV, JSON API, etc.) by implementing another `* → RawReport` adapter
- Agents have a clear extension point

**Trade-offs**
- Alias table for Russian keys must be maintained (document in Report-Mapping.md)
- Some free-text fields will land in `rawAttributes` until promoted

## Implementation notes for agents

See `docs/02-DOMAIN/Report-Mapping.md` (Text format section) and `docs/06-ENGINEERING/Agent-Playbook.md`.
