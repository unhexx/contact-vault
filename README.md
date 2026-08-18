# Contact Vault

<p align="center">
  <img src="docs/assets/logo.jpg" alt="Contact Vault logo" width="192" height="192" />
</p>

<p align="center">
  <img alt="Version 0.2.0" src="https://img.shields.io/badge/version-0.2.0-0ea5e9?style=flat-square" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-000000?style=flat-square&logo=nextdotjs&logoColor=white" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white" />
  <img alt="pnpm" src="https://img.shields.io/badge/pnpm-F69220?style=flat-square&logo=pnpm&logoColor=white" />
  <img alt="RFC 9553 JSContact" src="https://img.shields.io/badge/RFC_9553-JSContact-555?style=flat-square" />
</p>

**Contact management platform with OSINT report ingestion (void-html, sectioned-text, inline-dossier).**

Version **0.2.0** — three-format import, Person 360 with provenance, Risk, and Timeline, merge *suggestions* (exact phone/email/document or name + compatible partial DOB; no silent auto-merge), JSContact Card export.

Designed for collaborative development by neural network agents. Parses person dossiers into a CRM domain model with full provenance, explicit merge control, and a modern responsive UI.

## Vision

Turn complex, multi-source person reports (Void Search HTML/JSON exports and similar) into a clean, queryable, auditable contact graph that feels as responsive and intuitive as modern personal CRMs while preserving every original fact and its source.

## Core Capabilities (v0.2.0)

- **Ingest** Void HTML (`void-html`), sectioned plain-text (`sectioned-text`), and inline-dossier scoring dumps (`inline-dossier`)
- **Normalize** into Person + ContactPoints, IdentityDocuments, Addresses, Relationships; RiskScore + Incident from scoring headers
- **Provenance** on every fact (report, source name, original key/value, timestamps)
- **Merge suggestions** by exact phone / email / document, or by name + compatible partial DOB — user confirms; no silent merge
- **360° Contact View** — Overview / Identity / Documents / Addresses / Network / Risk / Timeline / Sources; copy-on-click
- **JSContact export** — identity + phones/emails as RFC 9553 / RFC 9982 Card `version: "2.0"`; `uid` is the Person UUID; colliding extras are vendor-prefixed `contact-vault.local:`
- **Responsive** dark/light UI — Next.js 15 + shadcn/ui

## Tech Stack (ADR-001)

| Layer | Choice |
|-------|--------|
| Language | TypeScript (strict) |
| Monorepo | pnpm + Turborepo |
| Frontend | Next.js 15 (App Router) + React 19 + Tailwind + shadcn/ui |
| API | tRPC (hosted in Next.js) |
| Database | PostgreSQL 16 + Prisma |
| Validation | Zod (`@contact-vault/domain`) |
| Parser | `@contact-vault/parser` (pure; no DB) |
| State | TanStack Query + Zustand |

## Repository Layout

```
contact-vault/
├── apps/web/                 # Next.js 15 + tRPC + UI
├── packages/
│   ├── domain/               # Zod schemas, contentHash, merge helpers, JSContact
│   ├── parser/               # void-html + sectioned-text + inline-dossier pipelines
│   ├── db/                   # Prisma schema + repositories
│   └── ui/                   # empty stub (UI lives in apps/web)
├── samples/                  # synthetic reports (three formats)
├── scripts/                  # smoke-import + check-fixtures
├── docs/                     # product, domain, architecture, playbook
├── docker-compose.yml
└── .env.example
```

## Local run (runbook)

### Prerequisites

- Node.js ≥ 20
- pnpm 9.15.0 (`corepack enable` or install via [pnpm.io](https://pnpm.io))
- Docker (for PostgreSQL)

### 1. Install

```bash
pnpm install
cp .env.example .env
```

### 2. Database

```bash
docker compose up -d
pnpm db:generate
pnpm db:migrate          # interactive dev migrations
# or non-interactive:
pnpm db:migrate:deploy
```

Default connection (see `.env.example`):

```text
DATABASE_URL=postgresql://contactvault:contactvault@localhost:5432/contactvault
```

Postgres is bound to `127.0.0.1:5432` only (not all interfaces).

### 3. Dev server

```bash
pnpm dev
# → http://127.0.0.1:3000
```

### 4. Quality gates

```bash
pnpm typecheck
pnpm test
pnpm check:fixtures   # forbid-list: no non-synthetic markers in fixtures/samples
pnpm smoke            # three-format import + re-import + merge path (requires Postgres)
```

### Optional env

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | (required) | Prisma connection string |
| `STORE_RAW_REPORTS` | `false` | When `true`, write raw bodies to `data/reports/{id}.bin` (gitignored) |
| `NEXT_PUBLIC_APP_URL` | — | Optional public base URL |
| `SKIP_DB_TESTS` | — | Set `1` to skip Postgres integration tests |

## Samples

Synthetic only — never commit real PII (see [Data-Handling](docs/08-LEGAL-ETHICS/Data-Handling.md)).

| Path | Format |
|------|--------|
| `samples/sectioned-text/person-basic.txt` | sectioned-text |
| `samples/sectioned-text/person-variant-shared-phone.txt` | sectioned-text (shares phone with basic — for merge demos) |
| `samples/void-html/person-basic.embed.html` | void-html |
| `samples/inline-dossier/person-scoring-basic.txt` | inline-dossier (scoring → Risk tab) |

Parser unit fixtures live under `packages/parser/fixtures/` (same synthetic policy).

## Manual smoke checklist (release gate)

Playwright is **not** required for v0.2.0. Use the UI and/or `pnpm smoke`:

1. Import `samples/sectioned-text/person-basic.txt` → format `sectioned-text`, person in list.
2. Import `samples/void-html/person-basic.embed.html` → format `void-html`.
3. Import `samples/inline-dossier/person-scoring-basic.txt` → format `inline-dossier`; Contact 360 **Risk** shows score.
4. Open Contact 360; copy phone; check source badges.
5. **Timeline** lists the import (newest first) with format and content hash.
6. **Export JSContact** downloads a Card whose `uid` is the Person UUID and whose phones/emails match stored points.
7. Re-import `samples/sectioned-text/person-basic.txt` (same content as step 1) → `duplicate: true`.
8. Import `samples/sectioned-text/person-variant-shared-phone.txt` → merge suggestions (no self-suggestion); Accept or Dismiss.
9. After Accept: survivor **Sources** lists report imports from both persons; Timeline includes the merge event.
10. Soft-delete hides contact from list; 360 returns not found.

`pnpm smoke` requires Docker Postgres (`docker compose up -d` + `pnpm db:migrate:deploy`). See script header in `scripts/smoke-import.ts`. Automated smoke is 7 API steps (no UI copy-phone / Timeline / JSContact steps); it covers the three imports, sectioned re-import, merge accept, and soft-delete.

## Documentation Map

| Document | Purpose |
|----------|---------|
| [docs/00-OVERVIEW.md](docs/00-OVERVIEW.md) | Project orientation for agents |
| [docs/01-PRODUCT/PRD.md](docs/01-PRODUCT/PRD.md) | Product requirements |
| [docs/02-DOMAIN/Domain-Model.md](docs/02-DOMAIN/Domain-Model.md) | Aggregates, entities, value objects |
| [docs/02-DOMAIN/Report-Mapping.md](docs/02-DOMAIN/Report-Mapping.md) | void-html / sectioned-text / inline-dossier → domain |
| [docs/02-DOMAIN/Inline-Dossier-Mapping.md](docs/02-DOMAIN/Inline-Dossier-Mapping.md) | Inline-dossier scoring format mapping |
| [docs/03-ARCHITECTURE/](docs/03-ARCHITECTURE/) | Architecture + ADRs |
| [docs/06-ENGINEERING/Agent-Playbook.md](docs/06-ENGINEERING/Agent-Playbook.md) | **How NN agents must work** |
| [docs/07-ROADMAP/MVP-Scope.md](docs/07-ROADMAP/MVP-Scope.md) | v0.1.0 checklist (complete) |
| [docs/07-ROADMAP/Roadmap.md](docs/07-ROADMAP/Roadmap.md) | Research notes + v0.3 plan (v0.2.0 shipped) |
| [docs/08-LEGAL-ETHICS/Data-Handling.md](docs/08-LEGAL-ETHICS/Data-Handling.md) | PII / fixtures policy |

## Ethics & Legal

This tool is intended for legitimate contact management, due-diligence, and authorized investigation workflows. Users are responsible for compliance with applicable data-protection and privacy laws. Only **synthetic** fixtures may be committed.

## License

TBD (proposed: MIT or Apache-2.0 for code; docs remain project-owned).
