# ADR-001: Technology Stack

**Status:** Accepted  
**Date:** 2026-08-10  
**Deciders:** Team (Grok, Benjamin, Lucas, Harper)

## Context

We need a stack that:
- Is fully type-safe end-to-end so neural network agents have unambiguous contracts
- Supports a rich, interactive, responsive UI with excellent perceived performance
- Handles structured + semi-structured OSINT data with provenance
- Is modern (2025–2026 best practices) and well-documented
- Allows a clean monorepo with shared domain logic

## Decision

| Concern | Choice | Notes |
|---------|--------|-------|
| Language | **TypeScript 5.x** (strict) | Single language across frontend, backend, domain, parser |
| Monorepo | **pnpm workspaces + Turborepo** | Fast installs, clear package boundaries |
| Frontend framework | **Next.js 15** (App Router) + React 19 | RSC where useful, excellent DX, Vercel-ready |
| Styling / Components | **Tailwind CSS 4 + shadcn/ui** (Radix) | Accessible, customizable, agent-friendly |
| API layer | **tRPC** | End-to-end types without code generation; agents love the inference |
| Database | **PostgreSQL 16 + Prisma** | Relational integrity + JSONB flexibility; Prisma schema is living docs |
| Validation | **Zod** | Shared between parser, API input, form validation |
| Client state / data | **TanStack Query v5 + Zustand** | Server cache + optimistic UI + lightweight local UI state |
| Parser runtime | Node + **linkedom / cheerio** | JSON-first extraction from Void HTML |
| Testing | **Vitest + Playwright + MSW** | Unit + e2e |
| i18n | next-intl (RU + EN) | Source data is predominantly Russian |

## Consequences

**Positive**
- Extremely clear contracts for AI agents
- Fast iteration on UI with shadcn
- Provenance and complex relationships map naturally to Postgres
- One `pnpm install` and type-check across the whole system

**Negative / Trade-offs**
- Prisma migrations require discipline
- tRPC couples frontend and backend more tightly than pure REST (acceptable for this product)
- Next.js App Router learning curve for some agents (mitigated by playbook examples)

## Alternatives considered

- Pure React + Vite SPA + separate NestJS/Fastify API → more boilerplate, weaker type sharing
- MongoDB / document store → weaker for identity graph and merge scenarios
- Graph database (Neo4j) as primary → overkill for MVP; can be added later for relationship exploration
- Drizzle instead of Prisma → also good; Prisma chosen for schema readability and agent familiarity

## Follow-up ADRs

- ADR-002: Data storage & identity resolution strategy
- ADR-003: Parsing strategy (JSON embed first)
- ADR-004: Domain modeling style (DDD-pragmatic)
- ADR-005: Real-time / collaborative features (future)
