# Contact Vault Roadmap

Living plan after **v0.1.1**. Historical MVP checklist stays in [MVP-Scope.md](./MVP-Scope.md).

## Research notes (2026-08-18)

Contact Vault is **not** a networking personal CRM (Dex / Clay / follow-up reminders). It is a **provenance-first dossier vault** for OSINT / KYC-style reports. Useful practices still come from JSContact, Salesforce-style matching, and forensic OSINT — not from outreach CRMs.

### Contact model (JSContact RFC 9553 + RFC 9982)

- Typed objects, not free-text blobs: names as components, phones/emails as maps with `kind` / `contexts` / `pref`.
- **Preserve unknown properties** rather than drop them (RFC 9553 §1.7.4). That is also our extras / parse-warning rule.
- RFC **9982** (May 2026) makes Card `uid` **optional** in JSContact version `2.0`. Ephemeral generated uids are harmful (invalid `relatedTo` / `members` references).
- We already have a stable Person UUID. Export as `version: "2.0"` with `uid` = that id. Do **not** mint a second identifier.
- Do **not** replace the domain with a JSContact Card. Dossier facts (documents, risk, incidents, provenance) are out of the RFC. A mapper that emits identity + contact points is enough.

### Duplicate management (matching vs action)

- Salesforce still splits **matching rules** (how candidates are found) from **duplicate rules** (what the operator may do). Matching rules alone must not merge.
- Exact vs fuzzy are both matching rules. Action stays explicit: suggest, never silent merge. Industry “protection rules” say the same: never auto-merge on unreviewed name hits.
- Fuzzy matching **alone is not entity resolution**. A single similarity score is not an audit-grade confidence (Tilores, 2026). Multi-field corroboration is required.
- For this product, name + **compatible partial DOB** is the next matching rule. Conflicting full dates (`1990-01-15` vs `1991-01-15`) must **not** suggest. Year-only / `YYYY-MM` that is a prefix of a fuller date **is** corroboration.
- Name-only (no DOB on either side) is too weak — common FIO collisions. Do not suggest.
- Intra-report `isLikelySamePerson` (token / last+first, conflicting отчество blocks) is already a matching helper in the parser. Reuse it for cross-person suggestions; do **not** introduce a numeric Jaro-Winkler cutoff this release (threshold tuning is a false-positive factory).
- Survivor-wins on scalars; move children; keep an audit event. Already shipped.

### OSINT / KYC defensibility

- Forensic OSINT practice: preserve the **source**, the **method**, the **timestamp**, a **content hash**, and the handling chain. Overwriting old values destroys the audit trail.
- A person-level **import timeline** is the operator-facing evidence log (Pagefreezer / Neotas-style central log): ReportImport rows + `audit_log` actions, append-only, newest first.
- `contentHash` is already stored. Show it. Do not re-hash silently or hide duplicate imports.
- Entity resolution and graph UI belong *after* facts are first-class and sourced.
- Risk / incidents stay first-class entities, not notes.

### What we deliberately skip (not this product)

LinkedIn auto-sync, outreach sequences, follow-up reminders, silent enrichment from the public web, multi-tenant SaaS. Monica-style **self-hosted / data-does-not-leave** remains an NFR we keep.

## Shipped

### v0.1.0

Dual-format import (`void-html`, `sectioned-text`), Person 360, exact-match merge suggestions, persist-path dedup, extras-only name mapping.

### v0.1.1 — third format + risk

Inline-dossier / scoring import; `RiskScore` + `Incident` on the Person draft; Contact 360 **Risk** tab; merge always-moves those children; unknown format still stays unknown.

List search already matches `canonicalFull` / `nameVariants`, phone `e164`, `emailNorm`, and document `numberNorm` (including dashed SNILS). That item is **not** open work for v0.2.

## Next release: v0.2 — operator quality (this ship)

**Goal:** Operators can find likely-same people without a shared phone/email/doc, see the import/audit chain on a person, and export identity + contact points as a JSContact Card. No silent merge. No domain rewrite.

| # | Slice | Delivery |
|---|-------|----------|
| 1 | Fuzzy matching (name + partial DOB) | New matching rule only. Candidate when `isLikelySamePerson` on canonical/variants **and** DOBs are compatible (equal or one is a prefix of the other). Conflicting full dates → no hit. Missing DOB on either side → no hit. Emit `MergeSuggestion` with `matchedOn` field `name` (and `dob` if the enum is extended). Inbox UI already exists. |
| 2 | Import timeline | Append-only event list on Contact 360 from `PersonSourceReport` / ReportImport + `audit_log` (`listForEntity("Person", id)`). Show action, actor, timestamp, contentHash, format. Do not mutate or collapse history. |
| 3 | JSContact export | Mapper + download of identity + contact points: `@type: Card`, `version: "2.0"`, `uid` = Person id, `kind: individual`, `name` components, `phones` / `emails` maps. Pass extras through as unknown properties. **Not** documents / risk / incidents. **Not** a Prisma/Zod rewrite. |

**Success:** two people with the same last+first (or token-prefix FIO) and compatible partial DOB get an **open suggestion** and nothing is merged until accept; 360 shows import + merge/dismiss events in time order; exporting a person yields a Card whose `uid` is the Person UUID and whose phones/emails round-trip the stored points; `pnpm test` + `pnpm check:fixtures` stay green; unknown format stays unknown.

**Still out of this release:** Vehicles / Financials / Flights tabs, reversible merge, numeric fuzzy thresholds / `pg_trgm`, multi-user auth, graph UI, LinkedIn/reminders.

## Later

### v0.3 — rest of the dossier UI

- Vehicles, employment / financial facts, bank relations as 360 tabs (types already in Domain-Model).
- Void HTML collectors for banks / vehicles where the embed already has them (PRD G1).

### Later still

- Reversible merge (undo from audit event).
- Optional at-rest encryption.
- Multi-user auth.
- Graph visualization of relationships.
- Optional `pg_trgm` / weighted fuzzy once suggestion volume justifies it.

## Release gate (any version)

```bash
pnpm typecheck && pnpm test && pnpm check:fixtures
# with Docker Postgres:
pnpm smoke
```

Then bump root `package.json` version, tag `vX.Y.Z`, update README capabilities table.
