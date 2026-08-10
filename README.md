# Contact Vault

**Contact management platform with OSINT report ingestion (Void Search compatible).**

Designed for collaborative development by neural network agents. Parses rich person dossiers into a best-practice CRM domain model with full provenance, intelligent merge/dedup, and a modern responsive UI.

> **Status:** Project documentation & scaffold phase. Implementation by AI agents follows the Agent Playbook.

## Vision

Turn complex, multi-source person reports (Void Search HTML/JSON exports and similar) into a clean, queryable, auditable contact graph that feels as responsive and intuitive as modern personal CRMs while preserving every original fact and its source.

## Core Capabilities (MVP)

- **Ingest** Void Search-style HTML reports (primary: embedded JSON payload)
- **Normalize** into a rich Person aggregate with ContactPoints, IdentityDocuments, Addresses, Vehicles, Relationships, Financials, Travel, etc.
- **Provenance** on every fact (report, source name, original key/value, confidence, timestamps)
- **Merge & Deduplicate** people by phone / email / passport / FIO+DOB with explicit user control and audit trail
- **360° Contact View** — fast, keyboard-friendly, copy-everywhere, faceted sources, timeline
- **Responsive** dark/light UI built with Next.js 15 + shadcn/ui

## Tech Stack (see ADR-001)

| Layer | Choice |
|-------|--------|
| Language | TypeScript (strict) |
| Monorepo | pnpm + Turborepo |
| Frontend | Next.js 15 (App Router) + React 19 + Tailwind + shadcn/ui |
| API | tRPC |
| Database | PostgreSQL + Prisma |
| Validation | Zod (shared) |
| Parser | Dedicated package, JSON-first + Cheerio fallback |
| State | TanStack Query + Zustand |

## Repository Layout (target)

```
contact-vault/
├── apps/
│   ├── web/                 # Next.js application
│   └── api/                 # optional standalone if needed
├── packages/
│   ├── domain/              # pure types, Zod schemas, domain logic
│   ├── parser/              # Void report → domain
│   ├── db/                  # Prisma schema + client
│   └── ui/                  # shared UI primitives
├── docs/                   # Full project documentation (start here)
├── prisma/
└── ...
```

## Documentation Map

| Document | Purpose |
|----------|---------|
| [docs/00-OVERVIEW.md](docs/00-OVERVIEW.md) | Project orientation for agents |
| [docs/01-PRODUCT/PRD.md](docs/01-PRODUCT/PRD.md) | Product requirements |
| [docs/02-DOMAIN/Domain-Model.md](docs/02-DOMAIN/Domain-Model.md) | Aggregates, entities, value objects |
| [docs/02-DOMAIN/Report-Mapping.md](docs/02-DOMAIN/Report-Mapping.md) | Void → Domain mapping |
| [docs/03-ARCHITECTURE/](docs/03-ARCHITECTURE/) | Architecture + ADRs |
| [docs/06-ENGINEERING/Agent-Playbook.md](docs/06-ENGINEERING/Agent-Playbook.md) | **How NN agents must work** |
| [docs/07-ROADMAP/MVP-Scope.md](docs/07-ROADMAP/MVP-Scope.md) | What to build first |

## Getting Started (once scaffolded)

```bash
pnpm install
pnpm dev
```

## Ethics & Legal

This tool is intended for legitimate contact management, due-diligence, and authorized investigation workflows. Users are responsible for compliance with applicable data-protection and privacy laws. The project documentation includes guidance on data handling and minimization.

## License

TBD (proposed: MIT or Apache-2.0 for code; docs remain project-owned).
