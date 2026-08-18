# Contact Vault Roadmap

Living plan after **v0.4.0**. Next release is **v0.5** (optional at-rest protection; report blobs first). Historical MVP checklist stays in [MVP-Scope.md](./MVP-Scope.md).

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

### v0.3.0 — rest of the dossier facts

BankRelation from void-html `data.banks` + Contact 360 **Banks** (name required; account*/bik optional; unknown keys extras; no bank-name matching). Vehicle from `vehicles` / `autoregs` + **Assets** (plate|vin|brand|model required; no photos). Employment + FinancialFact (void-html `work`/`companies`/`finance`; promote inline-dossier `====Доходы====`) + **Work**. Persist + merge always-moves those children. JSContact still does not export banks / vehicles / employments / financialFacts.

CDD / FATF Rec. 10 order after identity: bank relations first (PRD G1), then vehicles, then employment / income. Vehicle photo/lightbox, payment-card PAN as a searchable identity, bank-name matching, and employment graph stayed out.

### v0.4.0 — reversible merge

`merge.undo` restores no-collision and collision-path merges from the audit event (`targetScalarsBefore` + `targetProvenanceBefore`; colliding contact/doc soft-deleted on source, skipped PSR kept). Contact 360 Timeline **Undo merge** calls it; disabled when `mergeUndoBlockReason` is set (legacy hard-delete / missing scalars) or the merge is already undone / superseded.

## Next release: v0.5 — optional at-rest protection

### Research notes (2026-08-18, v0.5)

Contact Vault is still a **provenance-first dossier vault**, not an outreach CRM. Identity, CDD facts, and reversible merge are shipped. The remaining gap named in the PRD is **PII handling**, not another matching rule or a graph UI.

PRD **Risk** already deferred “encryption options later.” PRD NFR is local-first: data never leaves the deployment without operator action. [Data-Handling.md](../08-LEGAL-ETHICS/Data-Handling.md) lists the engineering control as **optional encryption at rest for report blobs and document numbers**. Architecture is still **single-user local first**; `STORE_RAW_REPORTS` already writes optional plaintext bodies to `data/reports/{id}.bin`.

This is not a networking-CRM “add auth then a graph” sketch. After v0.3 the stored dossier includes passports, SNILS, bank relations, vehicles, employment, and income. FATF Rec. 10 / Rec. 11 require retaining that CDD evidence; the **original report file** is the complete evidence dump. GDPR Art. 32(1)(a) names encryption as an appropriate technical measure; Art. 34(3)(a) treats data that remains unintelligible after a breach as a reason not to notify every data subject. ICO guidance: if you store personal data, use encryption and have a policy. NIST SP 800-111: AES for storage encryption; distinguish full-disk / volume encryption from application-level file encryption.

Stock PostgreSQL 16 has **no TDE** (ADR-002). Operator LUKS / volume encryption is complementary and stays the host’s job. It does **not** replace application-level blob encryption: a SQL dump, a copied `data/reports/*.bin`, or a DB superuser still sees plaintext. `pgcrypto` is not the first increment (community quality / “encrypt in the database” still leaves the key next to the rows).

| Priority | Slice | Why this order |
|----------|--------|----------------|
| 1 | **Optional report-blob encryption** | Data-Handling names **report blobs** first. `STORE_RAW_REPORTS` + `rawStorage` already exist. The file is not a merge or list-search key. `contentHash` stays SHA-256 of **normalized plaintext** (do not re-hash ciphertext). Envelope: AES-256-GCM, operator key from env, ciphertext in the existing `{id}.bin` path. Off by default (PII minimization: default is hash + metadata only). |
| 2 | Document-number ciphertext | Data-Handling’s second item. `numberNorm` is an exact merge key and list-search field (G2). Encrypting it without an HMAC / blind index breaks search. After blobs. |
| 3 | Multi-user auth | Architecture is still single-user. Login without encrypted blobs leaves disk / backups readable. Not multi-tenant SaaS (PRD non-goal). |

**Modeling rules (same provenance discipline as import):**

- Optional. `STORE_RAW_REPORTS=false` (default) stores no body. No key required.
- `STORE_RAW_REPORTS=true` without a key keeps today’s plaintext files; document the residual risk. With a key, write an envelope (`alg` + nonce + ciphertext) — never a second content hash.
- `contentHash` / idempotency always hash **plaintext**. Timeline still shows that hash.
- Wrong or missing key on a ciphertext file: fail closed. Do not treat ciphertext as report text.
- Key material is env-only. Never commit keys. Never log key bytes or full document numbers.
- Do **not** encrypt `e164` / `emailNorm` / `numberNorm` this release (merge + search keys).
- JSContact export and merge undo are unchanged.

**Skip this release:** vehicle photo / lightbox, payment-card PAN as a searchable identity, bank-name matching, employment graph, inventing Postgres TDE, graph visualization (PRD non-goal; Relationship stays a hint), `pg_trgm` / weighted fuzzy (no suggestion-volume justification; name+partial-DOB already shipped).

### v0.5.x slices

- [x] Optional AES-256-GCM on `STORE_RAW_REPORTS` blobs + env key + round-trip tests (first increment).
- [ ] IdentityDocument number ciphertext + searchable HMAC / blind index (after blobs).
- [ ] Multi-user auth (after blobs; still not multi-tenant SaaS).

## Later

- Graph visualization of relationships.
- Optional `pg_trgm` / weighted fuzzy once suggestion volume justifies it.

## Release gate (any version)

```bash
pnpm typecheck && pnpm test && pnpm check:fixtures
# with Docker Postgres:
pnpm smoke
```

Then bump root `package.json` version, tag `vX.Y.Z`, update README capabilities table.
