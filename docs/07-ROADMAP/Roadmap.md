# Contact Vault Roadmap

Living plan after **v0.2.0**. Historical MVP checklist stays in [MVP-Scope.md](./MVP-Scope.md).

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

List search already matches `canonicalFull` / `nameVariants`, phone `e164`, `emailNorm`, and document `numberNorm` (including dashed SNILS).

### v0.2.0 — operator quality

Fuzzy name + compatible partial-DOB merge *suggestions* (no silent merge); Contact 360 **Timeline** (append-only import + audit events); JSContact Card export of identity + contact points (RFC 9553 / RFC 9982 `version: "2.0"`, `uid` = Person id). Extras colliding with reserved Card keys are vendor-prefixed `contact-vault.local:`. Social/messenger points are not exported.

## Next release: v0.3 — rest of the dossier facts

### Research notes (2026-08-18, v0.3)

Contact Vault is still a **provenance-first dossier vault**, not an outreach CRM. v0.3 promotes facts that already appear in Void embeds / inline-dossier extras but are not first-class children.

CDD / FATF Rec. 10 / FinCEN CDD order after identity is already shipped: understand the **nature and purpose of customer relationships** (account / product type), then source-of-wealth assets. That is not a networking-CRM “assets tab first” sketch.

| Priority | Slice | Why this order |
|----------|--------|----------------|
| 1 | **Bank relations** | PRD **G1** lists banks with profile / addresses / socials / documents. The void-html fixture already embeds `data.banks`; the parser used to emit `UNMAPPED_SECTION`. Bank name + optional account hint / BIK is a sourced fact, not a note. |
| 2 | Vehicles | Domain-Model already specifies `Vehicle`. PRD 360 names Assets (vehicles). Collect `vehicles` / `autoregs` only when the embed has them. Photo / lightbox pipelines stay later (MVP-Scope out). |
| 3 | Employment / financial facts | Occupation and income are CDD-relevant, but current fixtures store `====Доходы====` as extras-only lean rows. Promote after banks/vehicles have tables so we do not invent a second extras-shaped type. |

**Modeling rules (same as Risk / Incident):**

- First-class Person child; provenance mandatory.
- Merge **always-moves** children (no silent drop, no bank-name dedupe).
- Preserve unknown bank keys in `extras` / parse warnings.
- Do **not** open merge suggestions on bank name alone (common brands, no identity).
- JSContact export stays identity + phones/emails. Banks / vehicles are out of RFC 9553 Card.

**Skip this release:** vehicle photo lightbox, payment-card PAN as a searchable identity, bank-name matching, employment graph.

### v0.3.x slices

- [x] BankRelation domain + void-html `data.banks` collector + persist + Contact 360 **Banks** tab (first increment).
- [x] Vehicles first-class + void-html `vehicles` / `autoregs` collector + 360 Assets tab (no photo pipeline).
- [x] Employment / FinancialFact promotion from extras + 360 Work tab.

## Later

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
