# ADR-003: Parsing Strategy (Multi-Format)

**Status:** Accepted  
**Date:** 2026-08-10  
**Updated:** 2026-08-10 — added sectioned-text and inline-dossier formats

## Decision

Support **three first-class input formats** that all produce the same domain DTOs.

### Format detection

| Signal | Format ID |
|--------|-----------|
| HTML doctype / `__report_embed__` / Void SPA markers | `void-html` |
| Clean `=== Source ===` headers + mostly one key-value per line | `sectioned-text` |
| `\u0420\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u044b \u0441\u043a\u043e\u0440\u0438\u043d\u0433\u0430` / high density of inline `\u0418\u043c\u044f :` \u2026 `Key :` after `====` | `inline-dossier` |
| Otherwise | `unknown` (reject or best-effort) |

Detection runs in `packages/parser` \u2192 `detectFormat.ts`. Prefer the most specific match.

### Pipelines

1. **void-html**  
   Extract embedded JSON \u2192 collectors \u2192 domain facts + provenance.

2. **sectioned-text**  
   Split on `=== Title ===` \u2192 parse line-oriented `Key: Value` \u2192 alias table \u2192 domain.  
   See `docs/02-DOMAIN/Text-Report-Mapping.md` / Report-Mapping Format B.

3. **inline-dossier**  
   Extract scoring header \u2192 RiskScore.  
   Split records on `\u0418\u043c\u044f\\s*:` (with optional preceding `====`).  
   Tokenize **inline** `Key : Value` with longest-key-first.  
   Map criminal sections \u2192 Incident; incomes \u2192 FinancialFact; vehicles \u2192 Vehicle; etc.  
   See `docs/02-DOMAIN/Inline-Dossier-Mapping.md`.

### Shared rules

- Pure functions only inside `packages/parser` (no DB I/O).
- Every fact carries Provenance (`sourceName` = section/source title).
- Idempotent by `sha256(payload)` + query fingerprint.
- Unknown keys go to `extras` / meta \u2014 never silently dropped.
- Warnings array for ambiguous parses (surface in UI later).
- Sensitive telecom secrets (PIN/PUK/IMEI): respect product policy; may redact with flag.

### Package layout (target)

```
packages/parser/
  src/
    detectFormat.ts
    voidHtml/
    sectionedText/
    inlineDossier/
      extractScoring.ts
      splitRecords.ts
      parseInlineKV.ts
      mapToDomain.ts
    normalize/          # phone E.164, FIO, dates, document types
    index.ts            # parseReport(input) \u2192 ParseResult
```

`ParseResult` = `{ format, reportMeta, persons: PersonDraft[], relationships, riskScores?, warnings[] }`.

## Consequences

- One domain model serves all dialects.
- Agents can add a new key alias or a new format front-end without changing storage or UI contracts.
- Criminal / scoring data is first-class (RiskScore + Incident), not buried in free-text notes.

## Follow-up

- Golden sanitized fixtures for all three formats under `fixtures/`.
- Optional promotion of telecom history to a dedicated `TelecomSubscription` entity (v1.1).
