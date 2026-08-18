# Domain Model — Contact Vault

## Design Principles

1. **Person is the Aggregate Root.**
2. **Separate identity, attributes, relationships, and interactions.**
3. **Every atomic fact carries Provenance.**
4. **Append-oriented history** + current-state projection. Facts are not silently overwritten.
5. **Inspired by:** Salesforce Customer 360 (Individual + Contact Points), JSContact (RFC 9553), schema.org/Person, pragmatic DDD.
6. **Russian-specific identity documents** are first-class citizens.

## Core Types (conceptual)

### Provenance

```ts
type Provenance = {
  reportId: string;
  reportQuery?: string;          // phone, FIO, etc.
  sourceName: string;            // e.g. "Клиенты T2.ru 2024"
  section?: string;
  originalKey?: string;
  originalValue?: string;
  extractedAt: string;           // ISO-8601
  confidence?: number;           // 0..1 or derived from count/total_sources
  count?: number;
};
```

### NameVariant

Supports multiple variants (maiden/married names, short forms) observed in Void data.

```ts
type NameVariant = {
  full: string;
  last?: string;
  first?: string;
  middle?: string;
  dobHint?: string;              // sometimes embedded in FIO string
  provenance: Provenance[];
};
```

### ContactPoint

```ts
type ContactPoint =
  | {
      kind: "phone";
      e164: string;              // normalized
      raw?: string;
      isPrimary?: boolean;
      tags?: string[];
      meta?: Record<string, unknown>; // e.g. telecomHistory[]
      provenance: Provenance[];
    }
  | {
      kind: "email";
      value: string;
      isPrimary?: boolean;
      provenance: Provenance[];
    }
  | {
      kind: "social";
      network: string;           // gosuslugi, telegram, vk, ...
      username?: string;
      url?: string;
      displayName?: string;
      meta?: Record<string, string>;
      provenance: Provenance[];
    }
  | {
      kind: "messenger";
      network: "telegram" | "whatsapp" | "max" | string;
      identifier: string;
      provenance: Provenance[];
    };
```

### IdentityDocument

```ts
type DocumentType =
  | "passport_ru"
  | "passport_foreign"
  | "snils"
  | "inn"
  | "oms"
  | "driving_license"
  | "birth_cert"
  | "military"
  | "other";

type IdentityDocument = {
  id: string;
  type: DocumentType;
  number: string;
  series?: string;
  issuedAt?: string;             // date
  issuedBy?: string;
  departmentCode?: string;       // код подразделения
  validUntil?: string;
  status?: "valid" | "invalid" | "unknown";
  meta?: Record<string, string>;
  provenance: Provenance[];
};
```

### Address

```ts
type Address = {
  id: string;
  raw: string;
  normalized?: string;
  category: "registration" | "residence" | "delivery" | "work" | "other";
  period?: { from?: string; to?: string };
  components?: {
    country?: string;
    region?: string;
    city?: string;
    street?: string;
    house?: string;
    flat?: string;
    postalCode?: string;
  };
  geo?: { lat: number; lon: number };
  provenance: Provenance[];
};
```

### Vehicle

First-class OSINT fact (v0.3). Requires **plate, vin, brand, or model**. Unknown embed keys go in `extras`. Not a merge key. Photos / lightbox stay later (MVP-Scope out).

```ts
type Vehicle = {
  id?: string;                 // assigned on persist
  brand?: string;
  model?: string;
  year?: number;
  plate?: string;
  vin?: string;
  powerHp?: number;
  engineVolumeCc?: number;
  category?: string;
  ownershipPeriods?: Array<{
    from?: string;
    to?: string;
    ownerName?: string;
    operationCode?: string;
  }>;
  extras?: Record<string, unknown>;
  provenance: Provenance[];
};
```

### Employment

First-class CDD/OSINT fact (v0.3). Requires **employer or position**. Wish / period stay as observed. Unknown embed keys go in `extras`. Not a merge key.

```ts
type Employment = {
  id?: string;                 // assigned on persist
  employer?: string;
  position?: string;
  wish?: string;               // желаемая должность
  periodFrom?: string;
  periodTo?: string;
  extras?: Record<string, unknown>;
  provenance: Provenance[];
};
```

### FinancialFact

First-class income / source-of-funds row (v0.3). Requires **amount, raw, or employer**. Amount stays a string as observed (do not invent currency or masking). Unknown keys go in `extras`. Not a merge key.

```ts
type FinancialFact = {
  id?: string;                 // assigned on persist
  amount?: string;
  currency?: string;
  year?: string;
  kind?: string;               // salary, income, … as observed
  employer?: string;
  raw?: string;
  extras?: Record<string, unknown>;
  provenance: Provenance[];
};
```

### BankRelation

First-class KYC/OSINT fact (v0.3). Bank **name** is required. Account numbers stay optional hints (as observed — do not invent masking). Unknown embed keys go in `extras`. Not a merge key.

```ts
type BankRelation = {
  id?: string;                 // assigned on persist
  bankName: string;
  accountHint?: string;        // last4 / masked / source account token
  role?: string;               // client, cardholder, … as observed
  bik?: string;
  extras?: Record<string, unknown>;
  provenance: Provenance[];
};
```

### Relationship

```ts
type Relationship = {
  id: string;
  type: "family" | "possible" | "colleague" | "neighbor" | "other";
  relationLabel?: string;        // "мать", "родитель"...
  relatedPersonId?: string;      // if already in system
  relatedPersonHint: {
    fio?: string;
    dob?: string;
    phones?: string[];
  };
  sharedAddress?: string;
  strength?: number;
  provenance: Provenance[];
};
```

### RiskScore (scoring / inline-dossier exports)

```ts
type RiskScore = {
  overall: number;               // 0..1 (e.g. 0.8 = "плохо")
  label?: string;
  categories: Array<{ name: string; flag: 0 | 1 }>;
  articles: Array<{ code: string; category?: string; details?: string }>;
  provenance: Provenance[];
};
```

### Incident (incl. criminal / court)

```ts
type Incident = {
  id: string;
  severity: "high" | "medium" | "low";
  title?: string;
  body?: Record<string, string>;
  articleCode?: string;          // e.g. "228 Ч.2"
  caseNumber?: string;
  sentenceDate?: string;
  decision?: string;             // "Вынесен ПРИГОВОР"
  region?: string;
  tags?: string[];
  provenance: Provenance[];
};
```

### Person (Aggregate Root)

```ts
type Person = {
  id: string;                    // UUID
  canonicalName?: NameVariant;
  nameVariants: NameVariant[];
  dateOfBirth?: string;          // ISO or partial YYYY / YYYY-MM
  placeOfBirth?: string;
  gender?: "male" | "female" | "other" | "unknown";

  contactPoints: ContactPoint[];
  documents: IdentityDocument[];
  addresses: Address[];
  relationships: Relationship[];
  vehicles: Vehicle[];
  employments: Employment[];
  financialFacts: FinancialFact[];
  travelRecords: TravelRecord[];
  incidents: Incident[];
  bankRelations: BankRelation[];
  paymentCards: PaymentCard[];
  phoneReputation?: PhoneReputation;
  riskScores?: RiskScore[];

  sourceReports: Array<{
    reportId: string;
    query: string;
    contentHash: string;
    importedAt: string;
    mode?: "void_html" | "text_export" | "inline_dossier" | "telegram" | "fio" | "facesearch" | "other";
  }>;

  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};
```

Supporting types (`TravelRecord`, `PaymentCard`, `PhoneReputation`) follow the same pattern: structured fields + `provenance[]`.

## Invariants & Rules

- A Person should have at least one strong identifier (phone, email, passport, or high-confidence Name+DOB).
- Matching rules produce `MergeSuggestion` only. Exact keys: phone e164 / emailNorm / document type+numberNorm. Name+DOB: `isLikelySamePerson` on canonical/variants **and** compatible partial DOB (equal or hyphen-boundary prefix). Missing DOB or conflicting full dates do not suggest. Never silent merge.
- Merge is an explicit domain command that produces an audit event; it never happens silently.
- Merge audit payload is the undo record (`movedEntityIds`, collision lists, `targetScalarsBefore`, `dismissedSuggestionIds`). Undo is a separate `unmerge` event; do not rewrite the merge row.
- First undo slice: only no-collision merges that recorded `targetScalarsBefore`. Hard-deleted colliding phones/emails/docs/PSR rows are not restorable yet. Pre-payload merges cannot be undone.
- BankRelation is a first-class child (v0.3). Merge always-moves bank rows. Bank name is not a matching key.
- Employment and FinancialFact are first-class children (v0.3). Merge always-moves those rows. Employer / income is not a matching key.
- Person 360 **import timeline** is append-only: `PersonSourceReport` / ReportImport rows plus `audit_log` for that Person (`import` via source link, `merge` / `unmerge` / `dismiss` / `soft_delete`). Newest first. Do not collapse or rewrite history.
- Soft-delete only; hard delete is a privileged, logged operation.
- Confidence scores are informational; UI must always show sources.
- Criminal / scoring data is first-class (RiskScore + Incident), not free-text notes.

## Mapping from report formats

| Format | Document |
|--------|----------|
| Void HTML / JSON embed | `Report-Mapping.md` (Format A) |
| Sectioned plain text (`===` headers) | `Report-Mapping.md` (Format B) |
| Inline dossier / scoring (`====`, inline Key : Value) | `Inline-Dossier-Mapping.md` |

All formats normalize into the same Person aggregate and child entities above.
