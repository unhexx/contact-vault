/**
 * @contact-vault/domain
 *
 * MVP contracts: Zod schemas, content-hash authority, exact-match merge helpers.
 * No Prisma, no parser I/O.
 */

// Content hash (KD13)
export {
  contentHashOf,
  normalizeReportContent,
} from "./content-hash.js";

// Provenance (KD1)
export { ProvenanceSchema, type Provenance } from "./provenance.js";

// Contact points (KD15 optional e164)
export { ContactPointSchema, type ContactPoint } from "./contact-point.js";

// Identity documents
export {
  DocumentTypeSchema,
  IdentityDocumentSchema,
  type DocumentType,
  type IdentityDocument,
} from "./identity-document.js";

// Address
export { AddressSchema, type Address } from "./address.js";

// Relationship (KD17)
export { RelationshipSchema, type Relationship } from "./relationship.js";

// Risk score (v0.1.1)
export { RiskScoreSchema, type RiskScore } from "./risk-score.js";

// Incident (v0.1.1)
export { IncidentSchema, type Incident } from "./incident.js";

// Person draft vs person (KD5)
export {
  NameVariantSchema,
  PersonDraftSchema,
  PersonSchema,
  type NameVariant,
  type Person,
  type PersonDraft,
} from "./person.js";

// Report import / merge suggestion
export {
  MergeSuggestionSchema,
  ReportFormatSchema,
  type MergeSuggestion,
  type ReportFormat,
} from "./report-import.js";

// Exact-match helpers (KD3, KD12, KD15, KD21)
export {
  extractExactMatchKeys,
  normalizeDocumentNumber,
  normalizeEmail,
  scoreExactMatches,
  type ExactMatchHit,
  type ExactMatchKey,
} from "./merge.js";
