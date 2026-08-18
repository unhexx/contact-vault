# Contact Vault

**Contact management platform with OSINT report ingestion (void-html, sectioned-text, inline-dossier).**

Version **0.1.1** — three-format import, Person 360 with provenance and Risk tab, exact-match merge *suggestions* (no silent auto-merge).

Designed for collaborative development by neural network agents. Parses person dossiers into a CRM domain model with full provenance, explicit merge control, and a modern responsive UI.

## Vision

Turn complex, multi-source person reports (Void Search HTML/JSON exports and similar) into a clean, queryable, auditable contact graph that feels as responsive and intuitive as modern personal CRMs while preserving every original fact and its source.

## Core Capabilities (v0.1.1)

- **Ingest** Void HTML (`void-html`), sectioned plain-text (`sectioned-text`), and inline-dossier scoring dumps (`inline-dossier`)
- **Normalize** into Person + ContactPoints, IdentityDocuments, Addresses, Relationships; RiskScore + Incident from scoring headers
- **Provenance** on every fact (report, source name, original key/value, timestamps)
- **Merge suggestions** by exact phone / email / document — user confirms; no silent merge
- **360° Contact View** — Overview / Identity / Documents / Addresses / Network / Risk / Sources; copy-on-click
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
│   ├── domain/               # Zod schemas, contentHash, merge helpers
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

Playwright is **not** required for v0.1.1. Use the UI and/or `pnpm smoke`:

1. Import `samples/sectioned-text/person-basic.txt` → format `sectioned-text`, person in list.
2. Import `samples/void-html/person-basic.embed.html` → format `void-html`.
3. Import `samples/inline-dossier/person-scoring-basic.txt` → format `inline-dossier`; Contact 360 **Risk** shows score.
4. Open Contact 360; copy phone; check source badges.
5. Re-import `samples/sectioned-text/person-basic.txt` (same content as step 1) → `duplicate: true`.
6. Import `samples/sectioned-text/person-variant-shared-phone.txt` → merge suggestions (no self-suggestion); Accept or Dismiss.
7. After Accept: survivor **Sources** lists report imports from both persons.
8. Soft-delete hides contact from list; 360 returns not found.

`pnpm smoke` requires Docker Postgres (`docker compose up -d` + `pnpm db:migrate:deploy`). See script header in `scripts/smoke-import.ts`. Automated smoke is 7 API steps (no UI copy-phone step); it covers the three imports, sectioned re-import, merge accept, and soft-delete.

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
| [docs/07-ROADMAP/Roadmap.md](docs/07-ROADMAP/Roadmap.md) | Research notes + v0.1.1 and later |
| [docs/08-LEGAL-ETHICS/Data-Handling.md](docs/08-LEGAL-ETHICS/Data-Handling.md) | PII / fixtures policy |

## Ethics & Legal

This tool is intended for legitimate contact management, due-diligence, and authorized investigation workflows. Users are responsible for compliance with applicable data-protection and privacy laws. Only **synthetic** fixtures may be committed.

## License

TBD (proposed: MIT or Apache-2.0 for code; docs remain project-owned).
