# Contributing

## For everyone

1. Read `docs/00-OVERVIEW.md`
2. Read `docs/06-ENGINEERING/Agent-Playbook.md` (mandatory for agents)
3. Prefer small, focused changes
4. Update docs when domain or behavior changes

## Neural-network agents

- Types / Zod schemas first
- Provenance is mandatory on every fact
- Fixture tests for **each** parser format (`void-html`, `sectioned-text`, `inline-dossier`)
- Never commit real PII — only synthetic data in `packages/parser/fixtures/` and `samples/`
- Run `pnpm check:fixtures` before commit when touching fixtures/samples
- Follow Definition of Done in the Agent Playbook
- New text report keys → update alias table in Report-Mapping + `keyAliases.ts`

## Local verification

```bash
pnpm typecheck && pnpm test && pnpm check:fixtures
# with Docker Postgres:
pnpm smoke
```

## Humans

Feature branch → PR against `main`.
