# ADR-004: Domain Modeling Style

**Status:** Accepted  
**Date:** 2026-08-10

## Decision

Pragmatic DDD:

- **Person** is the aggregate root
- ContactPoints, Documents, Addresses, Vehicles, Relationships are owned entities
- Every atomic fact carries **Provenance**
- Append-oriented history + current-state projection
- Explicit **Merge / Unmerge** commands with audit events
- `extras` JSON allowed on facts for unknown source keys (especially from sectioned-text)

Inspired by Salesforce Individual + Contact Points, JSContact (RFC 9553), schema.org/Person.
