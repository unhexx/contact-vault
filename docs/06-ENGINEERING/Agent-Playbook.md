# Agent Playbook — How Neural Network Agents Must Work on Contact Vault

This document is **mandatory reading** for every coding agent that touches the repository.

## 1. Guiding Principles

1. **Contracts first.** Prefer changing or extending Zod schemas / Prisma models / tRPC routers *before* writing UI or ad-hoc logic.
2. **Small, reviewable diffs.** One logical change per commit / PR. Do not mix parser changes with UI restyling.
3. **Provenance is sacred.** Never invent a fact without attaching a `Provenance` object. Never drop source information.
4. **Type safety is non-negotiable.** `tsc --noEmit` and Zod parse must pass.
5. **Match existing patterns.** Before inventing a new abstraction, search the codebase and docs.
6. **RU data awareness.** Names, addresses, document formats are Russian-first. Normalization must handle Cyrillic, partial dates (MM.YYYY, YYYY), and common document number formats.

## 2. Definition of Done (any feature)

- [ ] Types / Zod schemas updated and exported from `packages/domain`
- [ ] Prisma model + migration (if persistence involved)
- [ ] Unit tests for pure domain logic (Vitest)
- [ ] Parser tests with fixtures derived from real Void samples (anonymized)
- [ ] UI shows source / confidence where relevant
- [ ] Optimistic or skeleton states for async work
- [ ] Keyboard / accessibility basics (focus, labels)
- [ ] No secrets or full real PII committed to the repo
- [ ] Short note in the PR / commit body describing the mapping or decision

## 3. Working on the Parser (`packages/parser`)

1. Always prefer the embedded JSON payload over DOM scraping.
2. Add fixtures under `packages/parser/fixtures/` (redacted).
3. Output only domain objects or domain events defined in `packages/domain`.
4. Parsing must be idempotent with respect to content hash.
5. Log (or return) unknown keys rather than silently dropping them — helps evolve the model.

## 4. Working on Domain Logic

- Pure functions preferred (easy to test).
- Merge / dedup algorithms live in domain services and are fully unit-tested with edge cases (name variants, partial DOB, same phone different casing, etc.).
- Never mutate aggregates in place from UI code; go through commands / use-cases.

## 5. Working on UI (`apps/web`)

- Use existing shadcn components and design tokens.
- Copy-on-click for every meaningful value (preserve Void UX strength).
- Every list that can grow must be virtualized or paginated.
- Prefer TanStack Query for server state; Zustand only for ephemeral UI (open panels, selected tab, local filters).
- Mobile: test with narrow viewport; use bottom sheets for secondary detail.

## 6. Commit & PR Hygiene

```
feat(parser): extract bank relations from Void groups
fix(domain): normalize partial Russian dates
docs: clarify Relationship strength semantics
chore: add redacted fixture for phone-only report
```

PRs should reference the relevant section of Domain-Model or Report-Mapping when changing data shape.

## 7. What agents must NOT do

- Commit real personal data from the sample report or any live OSINT source.
- Introduce a second source of truth for types (no parallel interfaces that drift from Zod).
- Add heavy dependencies without an ADR or explicit team agreement.
- Implement silent auto-merge of people.
- Bypass the provenance requirement “just for the MVP”.

## 8. Getting unstuck

1. Re-read Domain-Model.md and the relevant ADR.
2. Look for an existing similar entity (e.g. how Address was modeled).
3. Add a failing test that expresses the desired behavior, then implement.
4. If the domain model itself is insufficient, propose an additive change in a dedicated docs PR first.

## 9. Sample agent workflow for a new entity (e.g. Vehicle photos)

1. Extend `Vehicle` type + Zod schema in `packages/domain`.
2. Update Report-Mapping.md with the Void source fields.
3. Implement extraction in parser + fixture test.
4. Add Prisma fields / JSONB if needed + migration.
5. Expose via tRPC query.
6. Render in the Contact 360 Vehicles tab with lightbox and provenance badges.
7. Update MVP checklist if it was in scope.

Follow this loop; do not skip documentation or tests.
