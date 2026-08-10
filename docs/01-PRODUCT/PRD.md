# Product Requirements Document — Contact Vault

## 1. Problem

Investigators, compliance teams, and power users receive rich multi-source person reports (exemplified by Void Search HTML exports). These reports are excellent for one-off viewing but poor for ongoing contact management: hard to merge duplicates, track changes over time, search across people, or keep an auditable trail of every fact.

## 2. Solution

A web application that:

1. Ingests Void-compatible reports (and later other formats).
2. Normalizes every fact into a best-practice contact domain model with mandatory provenance.
3. Provides a fast, intuitive 360° contact interface with merge/dedup, search, and timeline.
4. Is built so that neural-network agents can continue development safely and productively.

## 3. Target Users

- OSINT / investigation professionals who already use Void-style tools
- Compliance / KYC teams needing auditable contact dossiers
- Power users who want a personal CRM that can absorb deep data dumps

## 4. Goals (MVP)

| ID | Goal | Success metric |
|----|------|----------------|
| G1 | Parse a typical Void phone/FIO report into the domain model without data loss of key fields | 100% of profile, addresses, socials, banks, documents mapped |
| G2 | Display a Contact 360 view that is faster and cleaner than the original report SPA | User can find any fact + its sources in < 3 clicks / keystrokes |
| G3 | Support explicit merge of two Person records with full audit | Merge produces reversible event; no silent data loss |
| G4 | Agent-ready codebase | New entity can be added by following Agent Playbook in one focused session |

## 5. Non-Goals (MVP)

- Multi-tenant SaaS billing
- Live crawling / active OSINT collection
- Automatic (silent) person merging
- Mobile native apps
- Full graph visualization (basic list of relationships is enough)

## 6. Functional Requirements

### Ingestion
- Upload HTML report file or paste report ID / URL (if API available)
- Extract embedded JSON; fallback structural parse
- Create or update Person(s) with provenance
- Content-hash idempotency

### Contact Management
- List / search contacts (by name, phone, email, document number)
- 360° view with sections: Overview, Identity & Docs, Contact Points, Addresses, Network, Assets (vehicles), Activity (travel/incidents), Sources
- Copy any value with one click
- Soft-delete contact
- Explicit merge flow with preview of conflicts

### Provenance & Audit
- Every displayed fact shows source badge(s)
- Full source report list on the contact
- Audit log of merges, edits, imports

## 7. Non-Functional

- Responsive: desktop primary, usable on tablet/phone
- Perceived performance: skeletons, optimistic UI, virtualized lists
- Accessibility baseline (keyboard, labels, contrast)
- Data never leaves the deployment without user action (local-first friendly)
- Clear privacy / ethics documentation

## 8. Risks

- Report format drift → mitigate by versioned parser + unknown-key logging
- PII handling → no real PII in git; encryption options later
- Overly large aggregates → keep Person lean; heavy history in side tables / JSONB
