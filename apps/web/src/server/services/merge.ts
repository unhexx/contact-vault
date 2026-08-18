/**
 * Explicit merge service (KD18, KD22).
 * Move children + PersonSourceReport; provenance merge on norm-key collisions;
 * soft-delete source; reversible AuditLog payload.
 */
import {
  Prisma,
  createMergeSuggestionRepository,
  type MatchedOnField,
  type PrismaClient,
} from "@contact-vault/db";

import { AppError } from "../errors.js";

type MergeDb = PrismaClient | Prisma.TransactionClient;

type ContactPointRow = {
  id: string;
  kind: string;
  e164: string | null;
  emailNorm: string | null;
  provenance: unknown;
};

type DocumentRow = {
  id: string;
  type: string;
  numberNorm: string;
  provenance: unknown;
};

type SourceReportRow = {
  id: string;
  reportImportId: string;
};

type MergeChildren = {
  contactPoints: ContactPointRow[];
  documents: DocumentRow[];
  addresses: { id: string }[];
  relationships: { id: string }[];
  nameVariants: { id: string }[];
  personSourceReports: SourceReportRow[];
};

export type MergePersonsParams = {
  sourcePersonId: string;
  targetPersonId: string;
  suggestionId?: string;
};

export type MergePersonsResult = {
  targetPersonId: string;
};

export type MergePreview = {
  suggestionId: string;
  sourcePersonId: string;
  targetPersonId: string;
  matchedOn: MatchedOnField[];
  source: EntityCounts;
  target: EntityCounts;
  collisions: MatchedOnField[];
};

type EntityCounts = {
  contactPoints: number;
  documents: number;
  addresses: number;
  relationships: number;
  nameVariants: number;
  personSourceReports: number;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function asProvenanceArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function mergeProvenance(a: unknown, b: unknown): Prisma.InputJsonValue {
  return [...asProvenanceArray(a), ...asProvenanceArray(b)] as Prisma.InputJsonValue;
}

/** Person-row scalars that merge must not drop (review Issue 1). */
export type PersonScalarFields = {
  canonicalFull: string | null;
  canonicalLast: string | null;
  canonicalFirst: string | null;
  canonicalMiddle: string | null;
  dateOfBirth: string | null;
  placeOfBirth: string | null;
  gender: string | null;
  extras: unknown;
};

export type MergedPersonScalars = {
  canonicalFull: string | null;
  canonicalLast: string | null;
  canonicalFirst: string | null;
  canonicalMiddle: string | null;
  dateOfBirth: string | null;
  placeOfBirth: string | null;
  gender: string | null;
  extras: Record<string, unknown> | null;
};

function isBlankScalar(value: string | null | undefined): boolean {
  return value == null || value.trim() === "";
}

function extrasAsRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function pickScalar(target: string | null, source: string | null): string | null {
  return isBlankScalar(target) ? source : target;
}

/**
 * Survivor-wins on each scalar when both are set; fill blank target from source.
 * extras: merge object keys, target wins on conflict; empty/null extras are blank.
 */
export function pickSurvivorScalars(
  target: PersonScalarFields,
  source: PersonScalarFields,
): MergedPersonScalars {
  const targetExtras = extrasAsRecord(target.extras);
  const sourceExtras = extrasAsRecord(source.extras);
  const targetExtrasBlank = !targetExtras || Object.keys(targetExtras).length === 0;
  const sourceExtrasBlank = !sourceExtras || Object.keys(sourceExtras).length === 0;

  let extras: Record<string, unknown> | null;
  if (targetExtrasBlank && sourceExtrasBlank) {
    extras = targetExtras ?? sourceExtras ?? null;
  } else if (targetExtrasBlank) {
    extras = sourceExtras;
  } else if (sourceExtrasBlank) {
    extras = targetExtras;
  } else {
    extras = { ...sourceExtras, ...targetExtras };
  }

  return {
    canonicalFull: pickScalar(target.canonicalFull, source.canonicalFull),
    canonicalLast: pickScalar(target.canonicalLast, source.canonicalLast),
    canonicalFirst: pickScalar(target.canonicalFirst, source.canonicalFirst),
    canonicalMiddle: pickScalar(target.canonicalMiddle, source.canonicalMiddle),
    dateOfBirth: pickScalar(target.dateOfBirth, source.dateOfBirth),
    placeOfBirth: pickScalar(target.placeOfBirth, source.placeOfBirth),
    gender: pickScalar(target.gender, source.gender),
    extras,
  };
}

async function loadMergeChildren(
  db: MergeDb,
  personId: string,
): Promise<MergeChildren> {
  const [
    contactPoints,
    documents,
    addresses,
    relationships,
    nameVariants,
    personSourceReports,
  ] = await Promise.all([
    db.contactPoint.findMany({
      where: { personId, deletedAt: null },
    }),
    db.identityDocument.findMany({
      where: { personId, deletedAt: null },
    }),
    db.address.findMany({
      where: { personId, deletedAt: null },
      select: { id: true },
    }),
    db.relationship.findMany({
      where: { personId, deletedAt: null },
      select: { id: true },
    }),
    db.nameVariant.findMany({
      where: { personId },
      select: { id: true },
    }),
    db.personSourceReport.findMany({ where: { personId } }),
  ]);
  return {
    contactPoints,
    documents,
    addresses,
    relationships,
    nameVariants,
    personSourceReports,
  };
}

function countsFromChildren(kids: MergeChildren): EntityCounts {
  return {
    contactPoints: kids.contactPoints.length,
    documents: kids.documents.length,
    addresses: kids.addresses.length,
    relationships: kids.relationships.length,
    nameVariants: kids.nameVariants.length,
    personSourceReports: kids.personSourceReports.length,
  };
}

/** Shared preview/execute policy: phone e164 / emailNorm / type+numberNorm. */
export function collisionsFromChildren(
  source: Pick<MergeChildren, "contactPoints" | "documents">,
  target: Pick<MergeChildren, "contactPoints" | "documents">,
): MatchedOnField[] {
  const collisions: MatchedOnField[] = [];
  const seen = new Set<string>();

  const push = (hit: MatchedOnField) => {
    const id = `${hit.field}:${hit.value}`;
    if (seen.has(id)) return;
    seen.add(id);
    collisions.push(hit);
  };

  const targetPhones = new Set(
    target.contactPoints
      .filter((p) => p.kind === "phone" && p.e164)
      .map((p) => p.e164 as string),
  );
  for (const p of source.contactPoints) {
    if (p.kind === "phone" && p.e164 && targetPhones.has(p.e164)) {
      push({ field: "phone", value: p.e164 });
    }
  }

  const targetEmails = new Set(
    target.contactPoints
      .filter((e) => e.kind === "email" && e.emailNorm)
      .map((e) => e.emailNorm as string),
  );
  for (const e of source.contactPoints) {
    if (e.kind === "email" && e.emailNorm && targetEmails.has(e.emailNorm)) {
      push({ field: "email", value: e.emailNorm });
    }
  }

  const targetDocs = new Set(
    target.documents.map((d) => `${d.type}:${d.numberNorm}`),
  );
  for (const d of source.documents) {
    const fp = `${d.type}:${d.numberNorm}`;
    if (targetDocs.has(fp)) {
      push({ field: "document", value: fp });
    }
  }

  return collisions;
}

/**
 * Norm-key collisions between source and target (phone e164 / emailNorm / type+numberNorm).
 */
export async function findNormKeyCollisions(
  prisma: MergeDb,
  sourcePersonId: string,
  targetPersonId: string,
): Promise<MatchedOnField[]> {
  const [source, target] = await Promise.all([
    loadMergeChildren(prisma, sourcePersonId),
    loadMergeChildren(prisma, targetPersonId),
  ]);
  return collisionsFromChildren(source, target);
}

function asMatchedOn(value: unknown): MatchedOnField[] {
  if (!Array.isArray(value)) return [];
  return value as MatchedOnField[];
}

/**
 * Preview merge for a suggestion: entity counts + norm-key collisions.
 */
export async function previewMerge(
  prisma: PrismaClient,
  suggestionId: string,
): Promise<MergePreview> {
  const suggestion = await prisma.mergeSuggestion.findUnique({
    where: { id: suggestionId },
  });
  if (!suggestion) {
    throw new AppError("NOT_FOUND", "Merge suggestion not found");
  }

  const sourcePersonId = suggestion.newPersonId;
  const targetPersonId = suggestion.targetPersonId;

  const [sourcePerson, targetPerson] = await Promise.all([
    prisma.person.findFirst({
      where: { id: sourcePersonId, deletedAt: null },
      select: { id: true },
    }),
    prisma.person.findFirst({
      where: { id: targetPersonId, deletedAt: null },
      select: { id: true },
    }),
  ]);
  if (!sourcePerson || !targetPerson) {
    throw new AppError(
      "BAD_REQUEST",
      "Cannot preview merge: source or target person is missing or soft-deleted",
    );
  }

  const [sourceKids, targetKids] = await Promise.all([
    loadMergeChildren(prisma, sourcePersonId),
    loadMergeChildren(prisma, targetPersonId),
  ]);

  return {
    suggestionId,
    sourcePersonId,
    targetPersonId,
    matchedOn: asMatchedOn(suggestion.matchedOn),
    source: countsFromChildren(sourceKids),
    target: countsFromChildren(targetKids),
    collisions: collisionsFromChildren(sourceKids, targetKids),
  };
}

/**
 * Merge source → target: move children, append provenance on collisions,
 * move PersonSourceReport (drop on unique conflict), soft-delete source.
 */
export async function mergePersons(
  prisma: PrismaClient,
  params: MergePersonsParams,
): Promise<MergePersonsResult> {
  const { sourcePersonId, targetPersonId, suggestionId } = params;

  if (sourcePersonId === targetPersonId) {
    throw new AppError(
      "BAD_REQUEST",
      "sourcePersonId must not equal targetPersonId",
    );
  }

  return prisma.$transaction(
    async (tx) => {
      const personScalarSelect = {
        id: true,
        canonicalFull: true,
        canonicalLast: true,
        canonicalFirst: true,
        canonicalMiddle: true,
        dateOfBirth: true,
        placeOfBirth: true,
        gender: true,
        extras: true,
      } as const;

      const [source, target] = await Promise.all([
        tx.person.findFirst({
          where: { id: sourcePersonId, deletedAt: null },
          select: personScalarSelect,
        }),
        tx.person.findFirst({
          where: { id: targetPersonId, deletedAt: null },
          select: personScalarSelect,
        }),
      ]);

      if (!source || !target) {
        throw new AppError(
          "BAD_REQUEST",
          "Cannot merge: source or target person is missing or soft-deleted",
        );
      }

      const survivorScalars = pickSurvivorScalars(target, source);

      if (suggestionId) {
        const sug = await tx.mergeSuggestion.findUnique({
          where: { id: suggestionId },
        });
        if (!sug || sug.status !== "open") {
          throw new AppError(
            "BAD_REQUEST",
            "Merge suggestion is missing or not open",
          );
        }
        if (
          sug.newPersonId !== sourcePersonId ||
          sug.targetPersonId !== targetPersonId
        ) {
          throw new AppError(
            "BAD_REQUEST",
            "suggestionId does not match source/target pair",
          );
        }
      }

      const movedEntityIds = {
        contactPoints: [] as string[],
        documents: [] as string[],
        addresses: [] as string[],
        relationships: [] as string[],
        nameVariants: [] as string[],
        personSourceReports: [] as string[],
      };
      const skippedPersonSourceReportIds: string[] = [];
      const mergedIntoExisting: Array<{
        entityType: string;
        entityId: string;
        fromSourceEntityId: string;
      }> = [];

      const [sourceKids, targetKids] = await Promise.all([
        loadMergeChildren(tx, sourcePersonId),
        loadMergeChildren(tx, targetPersonId),
      ]);

      const targetPhoneByE164 = new Map<string, ContactPointRow>();
      const targetEmailByNorm = new Map<string, ContactPointRow>();
      for (const cp of targetKids.contactPoints) {
        if (cp.kind === "phone" && cp.e164) targetPhoneByE164.set(cp.e164, cp);
        if (cp.kind === "email" && cp.emailNorm) {
          targetEmailByNorm.set(cp.emailNorm, cp);
        }
      }

      const cpMoveIds: string[] = [];
      const cpDeleteIds: string[] = [];
      for (const cp of sourceKids.contactPoints) {
        let hit: ContactPointRow | undefined;
        if (cp.kind === "phone" && cp.e164) {
          hit = targetPhoneByE164.get(cp.e164);
        } else if (cp.kind === "email" && cp.emailNorm) {
          hit = targetEmailByNorm.get(cp.emailNorm);
        }
        if (hit) {
          const provenance = mergeProvenance(hit.provenance, cp.provenance);
          hit.provenance = provenance;
          await tx.contactPoint.update({
            where: { id: hit.id },
            data: { provenance },
          });
          cpDeleteIds.push(cp.id);
          mergedIntoExisting.push({
            entityType: "ContactPoint",
            entityId: hit.id,
            fromSourceEntityId: cp.id,
          });
        } else {
          cpMoveIds.push(cp.id);
          if (cp.kind === "phone" && cp.e164) {
            targetPhoneByE164.set(cp.e164, cp);
          } else if (cp.kind === "email" && cp.emailNorm) {
            targetEmailByNorm.set(cp.emailNorm, cp);
          }
        }
      }
      if (cpMoveIds.length > 0) {
        await tx.contactPoint.updateMany({
          where: { id: { in: cpMoveIds } },
          data: { personId: targetPersonId },
        });
        movedEntityIds.contactPoints.push(...cpMoveIds);
      }
      if (cpDeleteIds.length > 0) {
        await tx.contactPoint.deleteMany({ where: { id: { in: cpDeleteIds } } });
      }

      const targetDocByKey = new Map(
        targetKids.documents.map((d) => [`${d.type}:${d.numberNorm}`, d]),
      );
      const docMoveIds: string[] = [];
      const docDeleteIds: string[] = [];
      for (const doc of sourceKids.documents) {
        const key = `${doc.type}:${doc.numberNorm}`;
        const hit = targetDocByKey.get(key);
        if (hit) {
          const provenance = mergeProvenance(hit.provenance, doc.provenance);
          hit.provenance = provenance;
          await tx.identityDocument.update({
            where: { id: hit.id },
            data: { provenance },
          });
          docDeleteIds.push(doc.id);
          mergedIntoExisting.push({
            entityType: "IdentityDocument",
            entityId: hit.id,
            fromSourceEntityId: doc.id,
          });
        } else {
          docMoveIds.push(doc.id);
          targetDocByKey.set(key, doc);
        }
      }
      if (docMoveIds.length > 0) {
        await tx.identityDocument.updateMany({
          where: { id: { in: docMoveIds } },
          data: { personId: targetPersonId },
        });
        movedEntityIds.documents.push(...docMoveIds);
      }
      if (docDeleteIds.length > 0) {
        await tx.identityDocument.deleteMany({
          where: { id: { in: docDeleteIds } },
        });
      }

      const addrIds = sourceKids.addresses.map((a) => a.id);
      if (addrIds.length > 0) {
        await tx.address.updateMany({
          where: { id: { in: addrIds } },
          data: { personId: targetPersonId },
        });
        movedEntityIds.addresses.push(...addrIds);
      }

      const relIds = sourceKids.relationships.map((r) => r.id);
      if (relIds.length > 0) {
        await tx.relationship.updateMany({
          where: { id: { in: relIds } },
          data: { personId: targetPersonId },
        });
        movedEntityIds.relationships.push(...relIds);
      }

      const nameIds = sourceKids.nameVariants.map((n) => n.id);
      if (nameIds.length > 0) {
        await tx.nameVariant.updateMany({
          where: { id: { in: nameIds } },
          data: { personId: targetPersonId },
        });
        movedEntityIds.nameVariants.push(...nameIds);
      }

      const targetPsrByReport = new Set(
        targetKids.personSourceReports.map((p) => p.reportImportId),
      );
      const psrMoveIds: string[] = [];
      const psrDeleteIds: string[] = [];
      for (const psr of sourceKids.personSourceReports) {
        if (targetPsrByReport.has(psr.reportImportId)) {
          psrDeleteIds.push(psr.id);
          skippedPersonSourceReportIds.push(psr.id);
        } else {
          psrMoveIds.push(psr.id);
          targetPsrByReport.add(psr.reportImportId);
        }
      }
      if (psrMoveIds.length > 0) {
        await tx.personSourceReport.updateMany({
          where: { id: { in: psrMoveIds } },
          data: { personId: targetPersonId },
        });
        movedEntityIds.personSourceReports.push(...psrMoveIds);
      }
      if (psrDeleteIds.length > 0) {
        await tx.personSourceReport.deleteMany({
          where: { id: { in: psrDeleteIds } },
        });
      }

      const now = new Date();

      // Accept suggestion while both persons still active
      if (suggestionId) {
        await tx.mergeSuggestion.update({
          where: { id: suggestionId },
          data: { status: "accepted", resolvedAt: now },
        });
      }

      // Fill blank target scalars from source; always write so @updatedAt moves
      await tx.person.update({
        where: { id: targetPersonId },
        data: {
          canonicalFull: survivorScalars.canonicalFull,
          canonicalLast: survivorScalars.canonicalLast,
          canonicalFirst: survivorScalars.canonicalFirst,
          canonicalMiddle: survivorScalars.canonicalMiddle,
          dateOfBirth: survivorScalars.dateOfBirth,
          placeOfBirth: survivorScalars.placeOfBirth,
          gender: survivorScalars.gender,
          extras:
            survivorScalars.extras == null
              ? Prisma.DbNull
              : toJson(survivorScalars.extras),
        },
      });

      // Soft-delete source
      await tx.person.update({
        where: { id: sourcePersonId },
        data: { deletedAt: now },
      });

      // Dismiss other open suggestions involving source
      await tx.mergeSuggestion.updateMany({
        where: {
          status: "open",
          OR: [
            { newPersonId: sourcePersonId },
            { targetPersonId: sourcePersonId },
          ],
        },
        data: { status: "dismissed", resolvedAt: now },
      });

      await tx.auditLog.create({
        data: {
          action: "merge",
          actor: "local",
          entityType: "Person",
          entityId: targetPersonId,
          payload: toJson({
            sourcePersonId,
            targetPersonId,
            movedEntityIds,
            skippedPersonSourceReportIds,
            mergedIntoExisting,
            suggestionId,
          }),
        },
      });

      return { targetPersonId };
    },
    {
      maxWait: 10_000,
      timeout: 60_000,
    },
  );
}

/**
 * Dismiss an open merge suggestion (keep both persons).
 */
export async function dismissSuggestion(
  prisma: PrismaClient,
  suggestionId: string,
): Promise<{ ok: true }> {
  const repo = createMergeSuggestionRepository(prisma);
  const existing = await repo.findById(suggestionId);
  if (!existing) {
    throw new AppError("NOT_FOUND", "Merge suggestion not found");
  }
  if (existing.status !== "open") {
    throw new AppError("BAD_REQUEST", "Merge suggestion is not open");
  }
  await repo.setStatus(suggestionId, "dismissed");
  return { ok: true };
}

/**
 * List merge suggestions (non-deleted persons only).
 */
export async function listSuggestions(
  prisma: PrismaClient,
  params: { personId?: string; status?: "open" | "accepted" | "dismissed" },
): Promise<
  Array<{
    id: string;
    reportImportId: string;
    newPersonId: string;
    targetPersonId: string;
    matchedOn: MatchedOnField[];
    status: string;
    createdAt: string;
    resolvedAt: string | null;
  }>
> {
  const repo = createMergeSuggestionRepository(prisma);
  const rows = await repo.list({
    personId: params.personId,
    status: params.status ?? "open",
    limit: 100,
  });

  return rows.map((s) => ({
    id: s.id,
    reportImportId: s.reportImportId,
    newPersonId: s.newPersonId,
    targetPersonId: s.targetPersonId,
    matchedOn: asMatchedOn(s.matchedOn),
    status: s.status,
    createdAt: s.createdAt.toISOString(),
    resolvedAt: s.resolvedAt?.toISOString() ?? null,
  }));
}
