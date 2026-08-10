# ADR-003: Parsing Strategy (Multi-Format)

**Status:** Accepted  
**Date:** 2026-08-10  
**Updated:** 2026-08-10 — added sectioned-text format

## Decision

Support two first-class input formats that both produce the same domain DTOs.

### Format detection

| Signal | Format |
|--------|--------|
| HTML doctype / `__report_embed__` / Void SPA markers | `void-html` |
| ≥1 line matching `=== ... ===` | `sectioned-text` |
| Otherwise | `unknown` (reject or best-effort) |

### void-html pipeline

1. Extract embedded JSON (`__REPORT_EMBED__` / `#__report_embed__`)
2. If missing → structural DOM parse of known cards
3. Map collectors → domain DTOs + provenance

### sectioned-text pipeline

1. Split into sections by `=== Title ===` headers
2. Parse key: value lines; support multi-value (comma-separated) and multi-record sections
3. Apply Russian key alias table → domain fields
4. Treat `Общая сводка` as seed summary
5. Unknown keys → `extras` bag (never drop)
6. Related-person heuristic (different FIO+DOB sharing phone) → Relationship or Person stub

### Shared rules

- Pure functions only inside `packages/parser` (no DB)
- Every fact carries Provenance (`sourceName` = section/source title)
- Idempotent by `sha256(payload)` + query fingerprint
- Warnings array for ambiguous parses (agents must surface in UI later)

## Consequences

One domain model, multiple report dialects. Agents can add a new text key alias without touching HTML parsers.
