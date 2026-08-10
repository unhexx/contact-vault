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

```ts
type Vehicle = {
  id: string;
  brand?: string;
  model?: string;
  year?: number;
  plate?: string;
  vin?: string;
  ownershipPeriods?: Array<{
    from?: string;
    to?: string;
    ownerName?: string;
  }>;
  photos?: Array<{
    url: string;
    date?: string;
    listingPrice?: number;
    mileage?: number;
    mileageSuspect?: boolean;
  }>;
  provenance: Provenance[];
};
```

### Relationship

```ts
type Relationship = {
  id: string;
  type: "family" | "possible" | "colleague" | "neighbor" | "other";
  relationLabel?: string;        // "мать", "супруг"...
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

  sourceReports: Array<{
    reportId: string;
    query: string;
    contentHash: string;
    importedAt: string;
  }>;

  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};
```

Supporting types (`Employment`, `FinancialFact`, `TravelRecord`, `Incident`, `BankRelation`, `PaymentCard`, `PhoneReputation`) follow the same pattern: structured fields + `provenance[]`.

## Invariants & Rules

- A Person should have at least one strong identifier (phone, email, passport, or high-confidence Name+DOB).
- Merge is an explicit domain command that produces an audit event; it never happens silently.
- Soft-delete only; hard delete is a privileged, logged operation.
- Confidence scores are informational; UI must always show sources.

## Mapping from Void reports

See `Report-Mapping.md` for the detailed field-by-field correspondence.
