import type { Prisma, PrismaClient } from "@prisma/client";
import type { ExactMatchKey, Person, PersonDraft } from "@contact-vault/domain";

/** Accepts full client or interactive transaction client. */
export type DbClient = PrismaClient | Prisma.TransactionClient;

export type PrismaTx = Prisma.TransactionClient;

/** List row for contact list UI (design ContactListItem / PersonSummary). */
export type PersonSummary = {
  id: string;
  displayName: string;
  primaryPhone?: string;
  primaryEmail?: string;
  updatedAt: string;
  sourceCount: number;
  openSuggestionCount: number;
};

export type ListPersonsParams = {
  q?: string;
  limit: number;
  cursor?: string;
};

export type ListPersonsResult = {
  items: PersonSummary[];
  nextCursor?: string;
};

export type CreateFromDraftContext = {
  reportImportId: string;
  contentHash: string;
  query: string;
  mode: string;
};

export type MatchedOnField = {
  field: "phone" | "email" | "document";
  value: string;
};

export type ExactMatchCandidate = {
  personId: string;
  matchedOn: MatchedOnField[];
};

export type FindByExactKeysOpts = {
  /** Never return these person ids (defense in depth against self-match). */
  excludePersonIds?: string[];
};

export interface PersonRepository {
  list(params: ListPersonsParams): Promise<ListPersonsResult>;
  /** null if missing or soft-deleted */
  get360(id: string): Promise<Person | null>;
  /** Sets deletedAt; dismisses open suggestions involving id */
  softDelete(id: string): Promise<void>;
  createFromDraft(
    draft: PersonDraft,
    ctx: CreateFromDraftContext,
    tx?: DbClient,
  ): Promise<Person>;
  findByExactKeys(
    keys: ExactMatchKey[],
    opts?: FindByExactKeysOpts,
    tx?: DbClient,
  ): Promise<ExactMatchCandidate[]>;
}

export type ListCursorPayload = {
  updatedAt: string;
  id: string;
};

export type ReportFormatDb = "void_html" | "sectioned_text" | "unknown";
export type ReportImportStatusDb =
  | "pending"
  | "parsed"
  | "completed"
  | "failed";

export type CreateReportImportInput = {
  id: string;
  format: ReportFormatDb;
  contentHash: string;
  filename?: string | null;
  reportQuery?: string | null;
  byteSize?: number | null;
  warnings?: unknown;
  status?: ReportImportStatusDb;
  rawStorage?: string | null;
};

export type MatchedOnJson = Array<{ field: string; value: string }>;

export type CreateMergeSuggestionInput = {
  reportImportId: string;
  newPersonId: string;
  targetPersonId: string;
  matchedOn: MatchedOnJson;
};

export type CreateAuditLogInput = {
  action: "import" | "merge" | "soft_delete" | string;
  entityType: string;
  entityId: string;
  payload?: unknown;
  actor?: string;
};
