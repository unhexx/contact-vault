/**
 * @contact-vault/db
 *
 * Prisma schema, client, and repositories.
 * Soft-delete on Person; provenance JSONB; emailNorm / numberNorm exact match.
 */

export {
  createPrismaClient,
  getPrismaClient,
  type PrismaClient,
} from "./client.js";

export {
  CursorError,
  decodeListCursor,
  encodeListCursor,
} from "./cursor.js";

export {
  personInclude,
  toDomainPerson,
  type PersonWithChildren,
} from "./mappers/person-mapper.js";

export { createPersonRepository } from "./repositories/person-repository.js";
export { createReportImportRepository } from "./repositories/report-import-repository.js";
export type { ReportImportRepository } from "./repositories/report-import-repository.js";
export { createMergeSuggestionRepository } from "./repositories/merge-suggestion-repository.js";
export type {
  MergeSuggestionRepository,
  MergeSuggestionRow,
} from "./repositories/merge-suggestion-repository.js";
export { createAuditLogRepository } from "./repositories/audit-log-repository.js";
export type { AuditLogRepository } from "./repositories/audit-log-repository.js";

export type {
  CreateAuditLogInput,
  CreateFromDraftContext,
  CreateMergeSuggestionInput,
  CreateReportImportInput,
  DbClient,
  ExactMatchCandidate,
  FindByExactKeysOpts,
  ListCursorPayload,
  ListPersonsParams,
  ListPersonsResult,
  MatchedOnField,
  MatchedOnJson,
  PersonRepository,
  PersonSummary,
  PrismaTx,
  ReportFormatDb,
  ReportImportStatusDb,
} from "./types.js";

/** Re-export Prisma enums/types useful to composition root */
export {
  AddressCategory,
  ContactPointKind,
  DocumentType,
  Prisma,
  RelationshipType,
  ReportFormat,
  ReportImportStatus,
} from "@prisma/client";
