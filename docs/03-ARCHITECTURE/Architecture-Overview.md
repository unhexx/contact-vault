# Architecture Overview

## Style

- Modular **pnpm + Turborepo** monorepo
- Domain-driven core in `packages/domain`
- CQRS-light (Person write model + 360° read models)
- Type-safe boundaries via **Zod + tRPC**
- Parser is pure (no DB dependency) and **multi-format**

## Packages

| Package | Role |
|---------|------|
| `packages/domain` | Types, Zod schemas, pure merge/score helpers |
| `packages/parser` | void-html, sectioned-text, **and** inline-dossier → domain DTOs |
| `packages/db` | Prisma schema + repositories |
| `packages/ui` | Shared shadcn-based components |
| `apps/web` | Next.js 15 UI + tRPC |

## Import flow

1. Upload file → store blob + content hash
2. **Detect format** (`void-html` | `sectioned-text` | `inline-dossier`)
3. Parse via format-specific pipeline → domain DTOs + provenance
4. Match existing Person candidates
5. Create Person or propose merge
6. Persist facts with Provenance
7. Invalidate TanStack Query caches

## Contact 360

Load Person + children. Group by section. Every value copyable and source-badged.

## Cross-cutting

- Auth: single-user local first
- i18n: next-intl (RU/EN)
- PII: never log full document numbers at info level

See ADRs for detailed decisions.
