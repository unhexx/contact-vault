# @contact-vault/db

Prisma schema, client, and repositories for Contact Vault.

## Prerequisites

- PostgreSQL 16 (Docker Compose from monorepo root)
- `DATABASE_URL` (see root `.env.example`)

```bash
# From monorepo root
docker compose up -d postgres
cp -n .env.example .env   # if needed
export DATABASE_URL=postgresql://contactvault:contactvault@localhost:5432/contactvault
```

## Migrate commands

All commands run from `packages/db` (or via root filters).

```bash
# Generate Prisma Client after schema changes
pnpm --filter @contact-vault/db db:generate
# or: pnpm --filter @contact-vault/db exec prisma generate

# Create / apply migrations in development (interactive name prompt)
pnpm --filter @contact-vault/db db:migrate
# or: pnpm --filter @contact-vault/db exec prisma migrate dev --name <name>

# Apply existing migrations (CI / production / tests)
pnpm --filter @contact-vault/db db:migrate:deploy
# or: pnpm --filter @contact-vault/db exec prisma migrate deploy

# Push schema without migration history (local prototyping only)
pnpm --filter @contact-vault/db db:push

# Prisma Studio
pnpm --filter @contact-vault/db db:studio
```

Root convenience scripts:

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

Migrations:

- `prisma/migrations/0001_init/` — greenfield schema
- `prisma/migrations/0002_merge_suggestion_guards/` — merge suggestion CHECK + unique
- `prisma/migrations/0003_inline_dossier_risk/` — `ReportFormat.inline_dossier`, `RiskScore`, `Incident`

After pulling schema/migration changes:

```bash
pnpm db:generate
pnpm --filter @contact-vault/db db:migrate:deploy
```

## Integration tests

Tests require a live Postgres (same `DATABASE_URL`). They migrate/deploy and truncate between cases.

```bash
docker compose up -d postgres
export DATABASE_URL=postgresql://contactvault:contactvault@localhost:5432/contactvault
pnpm --filter @contact-vault/db db:generate
pnpm --filter @contact-vault/db db:migrate:deploy
pnpm --filter @contact-vault/db test
```

## Soft-delete rules

- `list` / `get360` / `findByExactKeys` only see `Person.deletedAt IS NULL`
- `softDelete` sets `deletedAt` and dismisses open `MergeSuggestion` rows involving that person
- Children are not hard-deleted; they are invisible via parent filter
