# MVP Scope

**Goal (v0.1.0):** Import reports in **either** Void HTML **or** sectioned plain-text format and manage the resulting contact.

## In scope (v0.1.0)

### Parser
- Format detection: `void-html` | `sectioned-text`
- **sectioned-text**: split sections, key aliases, summary seeding, multi-record sections, phone normalization
- **void-html**: JSON-embed path for person dossier (basic collectors)
- Map common fields: names, phones, emails, DOB, passports, SNILS, OMS, addresses, basic social/messengers
- Provenance per fact; idempotent by hash
- Parse warnings surfaced to API

### Domain / DB
- Person, ContactPoint, IdentityDocument, Address, Relationship (hint), ReportImport (with `format`)
- Soft-delete; exact-match merge suggestions (phone/email/doc)

### UI
- Upload (accept `.html` and `.txt`)
- Show detected format + warnings
- Contact list, Contact 360 (Overview / Identity / Documents / Addresses / Network / Sources)
- Copy-to-clipboard + source indicators

### Engineering
- Monorepo, Zod, Prisma, parser unit tests for **both** formats, Agent Playbook compliance

## Out of scope

Full vehicle photo pipelines, full financials/flights dedicated tabs, advanced fuzzy merge wizard, multi-user auth, graph visualization, PIN/PUK as first-class secrets UI (store in meta only).

---

v0.1.0 is **shipped**. v0.1.1, v0.2.0, v0.3.0, v0.4.0, and later versions live in [Roadmap.md](./Roadmap.md).

## v0.3 note

Research (see Roadmap) changed the original vehicles-first sketch. **Bank relations** shipped first (PRD G1 / Void `banks`), then Vehicles (**Assets**) and Employment / FinancialFact (**Work**). Vehicle **photo** pipelines remain out of scope.

## Checklist (v0.1.0)

1. [x] Core documentation package (incl. dual-format mapping)
2. [x] `packages/domain` Zod schemas
3. [x] `packages/db` Prisma schema + migrate
4. [x] `packages/parser` sectioned-text + void-html happy paths + tests
5. [x] `apps/web` upload + list + 360
6. [x] Merge suggestion UI
7. [x] Anonymized fixtures for **both** formats in `samples/`

## Success criterion (v0.1.0)

An agent following only the docs can import the attached-style `.txt` report **and** a Void HTML report, producing structured Contact 360 views without clarifying domain questions.
