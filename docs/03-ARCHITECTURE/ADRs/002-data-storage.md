# ADR-002: Data Storage

**Status:** Accepted  
**Date:** 2026-08-10

## Decision

PostgreSQL 16 + Prisma.

- Normalized tables for Person, ContactPoint, IdentityDocument, Address, Vehicle, Relationship, etc.
- JSONB for sparse meta / unknown original keys from text reports
- Soft deletes (`deletedAt`) + `audit_log` for merge/unmerge
- `ReportImport.format` enum: `void-html` | `sectioned-text` | `unknown`
- Future: `pg_trgm` for fuzzy FIO; optional `pgvector`

## Consequences

Strong integrity for identity documents and merges. Unknown text keys survive in JSONB without schema churn.
