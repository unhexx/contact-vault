# Contact Vault Roadmap

Living plan after v0.1.0. Historical MVP checklist stays in [MVP-Scope.md](./MVP-Scope.md).

## Research notes (2026-08)

Contact Vault is **not** a networking personal CRM (Dex / Clay / follow-up reminders). It is a **provenance-first dossier vault** for OSINT / KYC-style reports. The useful practices come from three places:

### Contact model (JSContact RFC 9553)

- Typed objects, not free-text blobs: names as components, phones/emails as maps with `kind` / `contexts` / `pref`.
- **Preserve unknown properties** rather than drop them (interoperability + format drift).
- Stable `uid` across views; version the card, do not silently rewrite history.
- We already follow the spirit (Person aggregate, ContactPoint kinds, extras). Do **not** replace the domain with a JSContact Card — dossier facts (documents, risk, incidents) are out of RFC 9553. A later export mapper is enough.

### Duplicate management (Salesforce Customer 360)

- Split **matching rules** (how we find candidates) from **duplicate rules** (what the user may do).
- Exact vs fuzzy are both matching rules. Action stays explicit: suggest, never silent merge.
- Survivor-wins on scalars; move children; keep an audit event. We already do this.
- Next matching increment is **fuzzy name + partial DOB**, not auto-merge.

### OSINT / case-management defensibility

- Preserve the source, the method, the timestamp, and the handling chain. A store that overwrites old values destroys the audit trail.
- Entity resolution + link analysis belong *after* facts are first-class and sourced.
- Risk / incidents / scoring are first-class entities, not notes (already in Domain-Model).
- Unknown keys and parse warnings stay visible (parser + Sources tab).

### What we deliberately skip (not this product)

LinkedIn auto-sync, outreach sequences, follow-up reminders, silent enrichment from the public web, multi-tenant SaaS. Monica-style **self-hosted / data-does-not-leave** remains an NFR we keep.

## Current: v0.1.0 (shipped)

Dual-format import (`void-html`, `sectioned-text`), Person 360, exact-match merge suggestions, persist-path dedup, extras-only name mapping.

## Next release: v0.1.1 — third format + risk (this ship)

**Goal:** Import an inline-dossier / scoring dump the same way as the two MVP formats, and show risk + incidents on Contact 360.

This is the highest-value slice: Domain-Model and Inline-Dossier-Mapping already specify it; a complete stack exists on `execute-plan/2a01c582-*` and must land on current `main` (post `fbf5226` architecture).

| Layer | Delivery |
|-------|----------|
| Domain | `RiskScore`, `Incident` Zod schemas on Person draft; `ReportFormat` includes `inline-dossier` |
| Parser | `detectFormat` third branch; `inlineDossier/**` pipeline; scoring → RiskScore / Incident; fixtures |
| DB | `ReportFormat.inline_dossier`; RiskScore + Incident tables; mapper + persist; merge always-moves these children |
| Format table | `format.ts` knows `inline-dossier` / `inline_dossier`; unknown still stays unknown |
| UI | Three-format import copy; Contact 360 **Risk** tab + Overview teaser |
| Packaging | `samples/inline-dossier/`, smoke third-format path, version **0.1.1** |

**Success:** `pnpm smoke` imports the synthetic inline-dossier sample; 360 Risk tab shows overall score + incidents with source badges; re-import is idempotent; merge of two people moves risk children onto the survivor.

**Still out of this release:** Vehicles / Financials / Flights dedicated tabs, fuzzy merge wizard, JSContact export, multi-user auth, graph UI.

## Later

### v0.2 — operator quality

- Fuzzy matching rules (name + partial DOB) producing suggestions only.
- Contact list search covers phones, emails, documents (not only names).
- Import timeline on the person (append-only event list from ReportImport + audit).
- JSContact-shaped **export** of identity + contact points (not a domain rewrite).

### v0.3 — rest of the dossier UI

- Vehicles, employment / financial facts, bank relations as 360 tabs (types already in Domain-Model).
- Void HTML collectors for banks / vehicles where the embed already has them (PRD G1).

### Later still

- Reversible merge (undo from audit event).
- Optional at-rest encryption.
- Multi-user auth.
- Graph visualization of relationships.

## Release gate (any version)

```bash
pnpm typecheck && pnpm test && pnpm check:fixtures
# with Docker Postgres:
pnpm smoke
```

Then bump root `package.json` version, tag `vX.Y.Z`, update README capabilities table.
