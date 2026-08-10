# MVP Scope

**Goal:** Import reports in **either** Void HTML **or** sectioned plain-text format and manage the resulting contact.

## In scope

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

Full vehicle photo pipelines, full financials/flights/incidents UI, advanced fuzzy merge wizard, multi-user auth, graph visualization, PIN/PUK as first-class secrets UI (store in meta only).

## Checklist

1. [x] Core documentation package (incl. dual-format mapping)
2. [ ] `packages/domain` Zod schemas
3. [ ] `packages/db` Prisma schema + migrate
4. [ ] `packages/parser` sectioned-text + void-html happy paths + tests
5. [ ] `apps/web` upload + list + 360
6. [ ] Merge suggestion UI
7. [ ] Anonymized fixtures for **both** formats in `samples/`

## Success criterion

An agent following only the docs can import the attached-style `.txt` report **and** a Void HTML report, producing structured Contact 360 views without clarifying domain questions.
