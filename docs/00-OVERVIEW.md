# Contact Vault — Overview for Agents & Contributors

## What this project is

A modern contact / dossier management web application that can **ingest complex multi-source person reports** (starting with Void Search HTML exports), normalize them into a clean domain model with full provenance, support intelligent merging, and present the information in a fast, intuitive, responsive UI.

Development is expected to be performed primarily by neural-network coding agents. Therefore every contract (types, Zod schemas, Prisma models, API procedures, UI patterns) is deliberately explicit and documented.

## Reading order for a new agent

1. This file
2. `docs/06-ENGINEERING/Agent-Playbook.md` (mandatory)
3. `docs/02-DOMAIN/Domain-Model.md`
4. `docs/03-ARCHITECTURE/Architecture-Overview.md` + ADRs
5. `docs/07-ROADMAP/MVP-Scope.md`
6. `docs/02-DOMAIN/Report-Mapping.md` when working on the parser

## Current phase

**Documentation + scaffold.** Implementation of parser, domain services, and UI begins after the core docs and package skeletons are stable.

## Key design goals

- **Provenance first** — never lose where a fact came from
- **Best-practice contact model** (inspired by Salesforce Customer 360, JSContact, schema.org/Person, DDD)
- **Agent-friendly contracts** (TypeScript + Zod + Prisma)
- **Snappy UX** (optimistic updates, keyboard nav, copy-on-click, progressive disclosure)
- **Extensible** to other report formats later

## Primary data source example

Void Search self-contained HTML reports contain an embedded JSON payload (`status` / `data` with `profile`, `addresses`, `social_profiles`, `banks`, `groups`, etc.). The parser prioritizes this payload.
