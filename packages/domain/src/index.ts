/**
 * @contact-vault/domain
 *
 * MVP contracts: Zod schemas, content-hash authority, match helpers (exact + name/DOB),
 * JSContact Card export mapper. No Prisma, no parser I/O.
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

// Bank relation (v0.3)
export { BankRelationSchema, type BankRelation } from "./bank-relation.js";

// Vehicle (v0.3)
export {
  VehicleOwnershipPeriodSchema,
  VehicleSchema,
  type Vehicle,
  type VehicleOwnershipPeriod,
} from "./vehicle.js";

// Employment / financial fact (v0.3)
export { EmploymentSchema, type Employment } from "./employment.js";
export {
  FinancialFactSchema,
  type FinancialFact,
} from "./financial-fact.js";

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
  MatchedOnFieldSchema,
  MergeSuggestionSchema,
  ReportFormatSchema,
  type MergeSuggestion,
  type ReportFormat,
} from "./report-import.js";

// Person import / audit timeline
export {
  TimelineEventSchema,
  mergePersonTimeline,
  type TimelineAuditInput,
  type TimelineEvent,
  type TimelineImportInput,
} from "./timeline.js";

// JSContact Card export (RFC 9553 / RFC 9982) — mapper only, not the domain
export {
  JSCONTACT_VENDOR_PREFIX,
  JSCONTACT_VERSION,
  jsContactFilename,
  phonesEmailsFromJsContact,
  toJsContact,
  type JsContactCard,
  type JsContactEmail,
  type JsContactEmailPoint,
  type JsContactName,
  type JsContactNameComponent,
  type JsContactPersonInput,
  type JsContactPhone,
  type JsContactPhonePoint,
} from "./jscontact.js";

// FIO / likely-same (parser + name+DOB matching)
export {
  fioEquals,
  isLikelySamePerson,
  parseFio,
  type ParsedName,
} from "./name.js";

// Exact-match + name/DOB matching helpers (KD3, KD12, KD15, KD21)
export {
  collectPersonNames,
  dobsCompatible,
  extractExactMatchKeys,
  normalizeDobForMatch,
  normalizeDocumentNumber,
  normalizeEmail,
  scoreExactMatches,
  scoreNameDobMatch,
  unionMatchCandidates,
  type ExactMatchHit,
  type ExactMatchKey,
  type MatchCandidate,
  type MatchHit,
  type MatchedOnKind,
} from "./merge.js";

// Merge audit payload / undo policy (reversible merge first slice)
export {
  MergeAuditPayloadSchema,
  MergedIntoExistingSchema,
  MovedEntityIdsSchema,
  PersonScalarSnapshotSchema,
  TargetProvenanceSnapshotSchema,
  mergeUndoBlockReason,
  parseMergeAuditPayload,
  type MergeAuditPayload,
  type MergeUndoBlockReason,
  type MergedIntoExisting,
  type MovedEntityIds,
  type PersonScalarSnapshot,
  type TargetProvenanceSnapshot,
} from "./merge-audit.js";
