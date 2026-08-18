/**
 * Explicit merge service (KD18, KD22).
 * Move children + PersonSourceReport; provenance merge on norm-key collisions;
 * soft-delete source; reversible AuditLog payload.
 * Undo (first slice): restore no-collision merges from that audit event.
 */
import {
  Prisma,
  createAuditLogRepository,
  createMergeSuggestionRepository,
  type MatchedOnField,
  type PrismaClient,
} from "@contact-vault/db";
import {
  mergeUndoBlockReason,
  parseMergeAuditPayload,
  type MovedEntityIds,
  type PersonScalarSnapshot,
} from "@contact-vault/domain";

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
  riskScores: { id: string }[];
  incidents: { id: string }[];
  bankRelations: { id: string }[];
  vehicles: { id: string }[];
  employments: { id: string }[];
  financialFacts: { id: string }[];
};

export type MergePersonsParams = {
  sourcePersonId: string;
  targetPersonId: string;
  suggestionId?: string;
};

export type MergePersonsResult = {
  targetPersonId: string;
  auditLogId: string;
};

export type UndoMergeResult = {
  sourcePersonId: string;
  targetPersonId: string;
  mergeAuditId: string;
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
  riskScores: number;
  incidents: number;
  bankRelations: number;
  vehicles: number;
  employments: number;
  financialFacts: number;
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
    riskScores,
    incidents,
    bankRelations,
    vehicles,
    employments,
    financialFacts,
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
    db.riskScore.findMany({
      where: { personId, deletedAt: null },
      select: { id: true },
    }),
    db.incident.findMany({
      where: { personId, deletedAt: null },
      select: { id: true },
    }),
    db.bankRelation.findMany({
      where: { personId, deletedAt: null },
      select: { id: true },
    }),
    db.vehicle.findMany({
      where: { personId, deletedAt: null },
      select: { id: true },
    }),
    db.employment.findMany({
      where: { personId, deletedAt: null },
      select: { id: true },
    }),
    db.financialFact.findMany({
      where: { personId, deletedAt: null },
      select: { id: true },
    }),
  ]);
  return {
    contactPoints,
    documents,
    addresses,
    relationships,
    nameVariants,
    personSourceReports,
    riskScores,
    incidents,
    bankRelations,
    vehicles,
    employments,
    financialFacts,
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
    riskScores: kids.riskScores.length,
    incidents: kids.incidents.length,
    bankRelations: kids.bankRelations.length,
    vehicles: kids.vehicles.length,
    employments: kids.employments.length,
    financialFacts: kids.financialFacts.length,
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
        riskScores: [] as string[],
        incidents: [] as string[],
        bankRelations: [] as string[],
        vehicles: [] as string[],
        employments: [] as string[],
        financialFacts: [] as string[],
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

      const riskIds = sourceKids.riskScores.map((r) => r.id);
      if (riskIds.length > 0) {
        await tx.riskScore.updateMany({
          where: { id: { in: riskIds } },
          data: { personId: targetPersonId },
        });
        movedEntityIds.riskScores.push(...riskIds);
      }

      const incidentIds = sourceKids.incidents.map((r) => r.id);
      if (incidentIds.length > 0) {
        await tx.incident.updateMany({
          where: { id: { in: incidentIds } },
          data: { personId: targetPersonId },
        });
        movedEntityIds.incidents.push(...incidentIds);
      }

      const bankIds = sourceKids.bankRelations.map((r) => r.id);
      if (bankIds.length > 0) {
        await tx.bankRelation.updateMany({
          where: { id: { in: bankIds } },
          data: { personId: targetPersonId },
        });
        movedEntityIds.bankRelations.push(...bankIds);
      }

      const vehicleIds = sourceKids.vehicles.map((r) => r.id);
      if (vehicleIds.length > 0) {
        await tx.vehicle.updateMany({
          where: { id: { in: vehicleIds } },
          data: { personId: targetPersonId },
        });
        movedEntityIds.vehicles.push(...vehicleIds);
      }

      const employmentIds = sourceKids.employments.map((r) => r.id);
      if (employmentIds.length > 0) {
        await tx.employment.updateMany({
          where: { id: { in: employmentIds } },
          data: { personId: targetPersonId },
        });
        movedEntityIds.employments.push(...employmentIds);
      }

      const financialFactIds = sourceKids.financialFacts.map((r) => r.id);
      if (financialFactIds.length > 0) {
        await tx.financialFact.updateMany({
          where: { id: { in: financialFactIds } },
          data: { personId: targetPersonId },
        });
        movedEntityIds.financialFacts.push(...financialFactIds);
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

      // Dismiss other open suggestions involving source (accepted one is already closed)
      const autoDismiss = await tx.mergeSuggestion.findMany({
        where: {
          status: "open",
          OR: [
            { newPersonId: sourcePersonId },
            { targetPersonId: sourcePersonId },
          ],
        },
        select: { id: true },
      });
      const dismissedSuggestionIds = autoDismiss.map((row) => row.id);
      if (dismissedSuggestionIds.length > 0) {
        await tx.mergeSuggestion.updateMany({
          where: { id: { in: dismissedSuggestionIds } },
          data: { status: "dismissed", resolvedAt: now },
        });
      }

      const targetScalarsBefore: PersonScalarSnapshot = {
        canonicalFull: target.canonicalFull,
        canonicalLast: target.canonicalLast,
        canonicalFirst: target.canonicalFirst,
        canonicalMiddle: target.canonicalMiddle,
        dateOfBirth: target.dateOfBirth,
        placeOfBirth: target.placeOfBirth,
        gender: target.gender,
        extras: target.extras ?? null,
      };

      const mergeAudit = await tx.auditLog.create({
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
            suggestionId: suggestionId ?? null,
            targetScalarsBefore,
            dismissedSuggestionIds,
          }),
        },
      });

      return { targetPersonId, auditLogId: mergeAudit.id };
    },
    {
      maxWait: 10_000,
      timeout: 60_000,
    },
  );
}

type MoveGroup = {
  key: keyof MovedEntityIds;
  countOnTarget: (
    db: MergeDb,
    ids: string[],
    personId: string,
  ) => Promise<number>;
  moveTo: (db: MergeDb, ids: string[], personId: string) => Promise<void>;
};

const UNDO_MOVE_GROUPS: MoveGroup[] = [
  {
    key: "contactPoints",
    countOnTarget: (db, ids, personId) =>
      db.contactPoint.count({ where: { id: { in: ids }, personId } }),
    moveTo: (db, ids, personId) =>
      db.contactPoint
        .updateMany({ where: { id: { in: ids } }, data: { personId } })
        .then(() => undefined),
  },
  {
    key: "documents",
    countOnTarget: (db, ids, personId) =>
      db.identityDocument.count({ where: { id: { in: ids }, personId } }),
    moveTo: (db, ids, personId) =>
      db.identityDocument
        .updateMany({ where: { id: { in: ids } }, data: { personId } })
        .then(() => undefined),
  },
  {
    key: "addresses",
    countOnTarget: (db, ids, personId) =>
      db.address.count({ where: { id: { in: ids }, personId } }),
    moveTo: (db, ids, personId) =>
      db.address
        .updateMany({ where: { id: { in: ids } }, data: { personId } })
        .then(() => undefined),
  },
  {
    key: "relationships",
    countOnTarget: (db, ids, personId) =>
      db.relationship.count({ where: { id: { in: ids }, personId } }),
    moveTo: (db, ids, personId) =>
      db.relationship
        .updateMany({ where: { id: { in: ids } }, data: { personId } })
        .then(() => undefined),
  },
  {
    key: "nameVariants",
    countOnTarget: (db, ids, personId) =>
      db.nameVariant.count({ where: { id: { in: ids }, personId } }),
    moveTo: (db, ids, personId) =>
      db.nameVariant
        .updateMany({ where: { id: { in: ids } }, data: { personId } })
        .then(() => undefined),
  },
  {
    key: "personSourceReports",
    countOnTarget: (db, ids, personId) =>
      db.personSourceReport.count({ where: { id: { in: ids }, personId } }),
    moveTo: (db, ids, personId) =>
      db.personSourceReport
        .updateMany({ where: { id: { in: ids } }, data: { personId } })
        .then(() => undefined),
  },
  {
    key: "riskScores",
    countOnTarget: (db, ids, personId) =>
      db.riskScore.count({ where: { id: { in: ids }, personId } }),
    moveTo: (db, ids, personId) =>
      db.riskScore
        .updateMany({ where: { id: { in: ids } }, data: { personId } })
        .then(() => undefined),
  },
  {
    key: "incidents",
    countOnTarget: (db, ids, personId) =>
      db.incident.count({ where: { id: { in: ids }, personId } }),
    moveTo: (db, ids, personId) =>
      db.incident
        .updateMany({ where: { id: { in: ids } }, data: { personId } })
        .then(() => undefined),
  },
  {
    key: "bankRelations",
    countOnTarget: (db, ids, personId) =>
      db.bankRelation.count({ where: { id: { in: ids }, personId } }),
    moveTo: (db, ids, personId) =>
      db.bankRelation
        .updateMany({ where: { id: { in: ids } }, data: { personId } })
        .then(() => undefined),
  },
  {
    key: "vehicles",
    countOnTarget: (db, ids, personId) =>
      db.vehicle.count({ where: { id: { in: ids }, personId } }),
    moveTo: (db, ids, personId) =>
      db.vehicle
        .updateMany({ where: { id: { in: ids } }, data: { personId } })
        .then(() => undefined),
  },
  {
    key: "employments",
    countOnTarget: (db, ids, personId) =>
      db.employment.count({ where: { id: { in: ids }, personId } }),
    moveTo: (db, ids, personId) =>
      db.employment
        .updateMany({ where: { id: { in: ids } }, data: { personId } })
        .then(() => undefined),
  },
  {
    key: "financialFacts",
    countOnTarget: (db, ids, personId) =>
      db.financialFact.count({ where: { id: { in: ids }, personId } }),
    moveTo: (db, ids, personId) =>
      db.financialFact
        .updateMany({ where: { id: { in: ids } }, data: { personId } })
        .then(() => undefined),
  },
];

function scalarWriteData(snapshot: PersonScalarSnapshot) {
  return {
    canonicalFull: snapshot.canonicalFull,
    canonicalLast: snapshot.canonicalLast,
    canonicalFirst: snapshot.canonicalFirst,
    canonicalMiddle: snapshot.canonicalMiddle,
    dateOfBirth: snapshot.dateOfBirth,
    placeOfBirth: snapshot.placeOfBirth,
    gender: snapshot.gender,
    extras: snapshot.extras == null ? Prisma.DbNull : toJson(snapshot.extras),
  };
}

/**
 * Undo a merge from its audit event. First slice: no-collision only.
 * Appends `unmerge` (does not rewrite the merge row).
 */
export async function undoMerge(
  prisma: PrismaClient,
  auditEventId: string,
): Promise<UndoMergeResult> {
  const event = await prisma.auditLog.findUnique({
    where: { id: auditEventId },
  });
  if (!event) {
    throw new AppError("NOT_FOUND", "Merge audit event not found");
  }
  if (event.action !== "merge") {
    throw new AppError(
      "BAD_REQUEST",
      "Audit event is not a merge",
      "MERGE_UNDO_NOT_MERGE",
    );
  }

  const payload = parseMergeAuditPayload(event.payload);
  if (!payload) {
    throw new AppError(
      "BAD_REQUEST",
      "Cannot undo merge: audit payload is not a merge record",
      "MERGE_UNDO_BAD_PAYLOAD",
    );
  }

  const blocked = mergeUndoBlockReason(payload);
  if (blocked === "missing_target_scalars") {
    throw new AppError(
      "BAD_REQUEST",
      "Cannot undo merge: audit payload lacks targetScalarsBefore",
      "MERGE_UNDO_UNSUPPORTED",
    );
  }
  if (blocked === "has_collisions" || blocked === "has_skipped_psr") {
    throw new AppError(
      "BAD_REQUEST",
      "Cannot undo merge: colliding facts were deleted and are not restorable in this slice",
      "MERGE_UNDO_COLLISION",
    );
  }

  const { sourcePersonId, targetPersonId } = payload;
  const targetScalarsBefore = payload.targetScalarsBefore!;

  return prisma.$transaction(
    async (tx) => {
      const already = await tx.auditLog.findFirst({
        where: {
          action: "unmerge",
          entityType: "Person",
          entityId: targetPersonId,
          payload: {
            path: ["mergeAuditId"],
            equals: auditEventId,
          },
        },
        select: { id: true },
      });
      if (already) {
        throw new AppError(
          "CONFLICT",
          "Cannot undo merge: already undone",
          "MERGE_UNDO_ALREADY",
        );
      }

      const laterMerge = await tx.auditLog.findFirst({
        where: {
          action: "merge",
          entityType: "Person",
          entityId: targetPersonId,
          createdAt: { gt: event.createdAt },
        },
        select: { id: true },
      });
      if (laterMerge) {
        throw new AppError(
          "CONFLICT",
          "Cannot undo merge: a later merge superseded this event",
          "MERGE_UNDO_SUPERSEDED",
        );
      }

      const [source, target] = await Promise.all([
        tx.person.findUnique({
          where: { id: sourcePersonId },
          select: { id: true, deletedAt: true },
        }),
        tx.person.findUnique({
          where: { id: targetPersonId },
          select: { id: true, deletedAt: true },
        }),
      ]);
      if (!source) {
        throw new AppError(
          "BAD_REQUEST",
          "Cannot undo merge: source person is missing",
          "MERGE_UNDO_SOURCE_STATE",
        );
      }
      if (source.deletedAt == null) {
        throw new AppError(
          "CONFLICT",
          "Cannot undo merge: source person is not soft-deleted",
          "MERGE_UNDO_SOURCE_STATE",
        );
      }
      if (!target || target.deletedAt != null) {
        throw new AppError(
          "BAD_REQUEST",
          "Cannot undo merge: target person is missing or soft-deleted",
          "MERGE_UNDO_TARGET_STATE",
        );
      }

      for (const group of UNDO_MOVE_GROUPS) {
        const ids = payload.movedEntityIds[group.key];
        if (ids.length === 0) continue;
        const onTarget = await group.countOnTarget(tx, ids, targetPersonId);
        if (onTarget !== ids.length) {
          throw new AppError(
            "CONFLICT",
            "Cannot undo merge: a moved entity is no longer on the survivor",
            "MERGE_UNDO_MUTATED",
          );
        }
      }

      await tx.person.update({
        where: { id: sourcePersonId },
        data: { deletedAt: null },
      });

      for (const group of UNDO_MOVE_GROUPS) {
        const ids = payload.movedEntityIds[group.key];
        if (ids.length === 0) continue;
        await group.moveTo(tx, ids, sourcePersonId);
      }

      await tx.person.update({
        where: { id: targetPersonId },
        data: scalarWriteData(targetScalarsBefore),
      });

      if (payload.suggestionId) {
        await tx.mergeSuggestion.updateMany({
          where: { id: payload.suggestionId, status: "accepted" },
          data: { status: "open", resolvedAt: null },
        });
      }
      if (payload.dismissedSuggestionIds.length > 0) {
        await tx.mergeSuggestion.updateMany({
          where: {
            id: { in: payload.dismissedSuggestionIds },
            status: "dismissed",
          },
          data: { status: "open", resolvedAt: null },
        });
      }

      const unmergePayload = {
        mergeAuditId: auditEventId,
        sourcePersonId,
        targetPersonId,
      };
      await tx.auditLog.create({
        data: {
          action: "unmerge",
          actor: "local",
          entityType: "Person",
          entityId: targetPersonId,
          payload: toJson(unmergePayload),
        },
      });
      await tx.auditLog.create({
        data: {
          action: "unmerge",
          actor: "local",
          entityType: "Person",
          entityId: sourcePersonId,
          payload: toJson(unmergePayload),
        },
      });

      return { sourcePersonId, targetPersonId, mergeAuditId: auditEventId };
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
  const auditRepo = createAuditLogRepository(prisma);
  const payload = {
    suggestionId,
    newPersonId: existing.newPersonId,
    targetPersonId: existing.targetPersonId,
  };
  await prisma.$transaction(async (tx) => {
    await repo.setStatus(suggestionId, "dismissed", tx);
    await auditRepo.append(
      {
        action: "dismiss",
        entityType: "Person",
        entityId: existing.newPersonId,
        payload,
      },
      tx,
    );
    await auditRepo.append(
      {
        action: "dismiss",
        entityType: "Person",
        entityId: existing.targetPersonId,
        payload,
      },
      tx,
    );
  });
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
