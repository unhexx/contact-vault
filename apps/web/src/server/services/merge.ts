/**
 * Explicit merge service (KD18, KD22).
 * Move children + PersonSourceReport; provenance merge on norm-key collisions;
 * soft-delete source; reversible AuditLog payload.
 */
import {
  Prisma,
  type MatchedOnField,
  type PrismaClient,
} from "@contact-vault/db";

import { AppError } from "../errors.js";

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

async function countChildren(
  prisma: PrismaClient,
  personId: string,
): Promise<EntityCounts> {
  const [
    contactPoints,
    documents,
    addresses,
    relationships,
    nameVariants,
    personSourceReports,
  ] = await Promise.all([
    prisma.contactPoint.count({
      where: { personId, deletedAt: null },
    }),
    prisma.identityDocument.count({
      where: { personId, deletedAt: null },
    }),
    prisma.address.count({
      where: { personId, deletedAt: null },
    }),
    prisma.relationship.count({
      where: { personId, deletedAt: null },
    }),
    prisma.nameVariant.count({ where: { personId } }),
    prisma.personSourceReport.count({ where: { personId } }),
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

/**
 * Norm-key collisions between source and target (phone e164 / emailNorm / type+numberNorm).
 */
export async function findNormKeyCollisions(
  prisma: PrismaClient,
  sourcePersonId: string,
  targetPersonId: string,
): Promise<MatchedOnField[]> {
  const collisions: MatchedOnField[] = [];
  const seen = new Set<string>();

  const push = (hit: MatchedOnField) => {
    const id = `${hit.field}:${hit.value}`;
    if (seen.has(id)) return;
    seen.add(id);
    collisions.push(hit);
  };

  const [sourcePhones, targetPhones] = await Promise.all([
    prisma.contactPoint.findMany({
      where: {
        personId: sourcePersonId,
        kind: "phone",
        deletedAt: null,
        e164: { not: null },
      },
      select: { e164: true },
    }),
    prisma.contactPoint.findMany({
      where: {
        personId: targetPersonId,
        kind: "phone",
        deletedAt: null,
        e164: { not: null },
      },
      select: { e164: true },
    }),
  ]);
  const targetPhoneSet = new Set(
    targetPhones.map((p) => p.e164).filter((v): v is string => Boolean(v)),
  );
  for (const p of sourcePhones) {
    if (p.e164 && targetPhoneSet.has(p.e164)) {
      push({ field: "phone", value: p.e164 });
    }
  }

  const [sourceEmails, targetEmails] = await Promise.all([
    prisma.contactPoint.findMany({
      where: {
        personId: sourcePersonId,
        kind: "email",
        deletedAt: null,
        emailNorm: { not: null },
      },
      select: { emailNorm: true },
    }),
    prisma.contactPoint.findMany({
      where: {
        personId: targetPersonId,
        kind: "email",
        deletedAt: null,
        emailNorm: { not: null },
      },
      select: { emailNorm: true },
    }),
  ]);
  const targetEmailSet = new Set(
    targetEmails.map((e) => e.emailNorm).filter((v): v is string => Boolean(v)),
  );
  for (const e of sourceEmails) {
    if (e.emailNorm && targetEmailSet.has(e.emailNorm)) {
      push({ field: "email", value: e.emailNorm });
    }
  }

  const [sourceDocs, targetDocs] = await Promise.all([
    prisma.identityDocument.findMany({
      where: { personId: sourcePersonId, deletedAt: null },
      select: { type: true, numberNorm: true },
    }),
    prisma.identityDocument.findMany({
      where: { personId: targetPersonId, deletedAt: null },
      select: { type: true, numberNorm: true },
    }),
  ]);
  const targetDocSet = new Set(
    targetDocs.map((d) => `${d.type}:${d.numberNorm}`),
  );
  for (const d of sourceDocs) {
    const fp = `${d.type}:${d.numberNorm}`;
    if (targetDocSet.has(fp)) {
      push({ field: "document", value: fp });
    }
  }

  return collisions;
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

  const [source, target, collisions] = await Promise.all([
    countChildren(prisma, sourcePersonId),
    countChildren(prisma, targetPersonId),
    findNormKeyCollisions(prisma, sourcePersonId, targetPersonId),
  ]);

  return {
    suggestionId,
    sourcePersonId,
    targetPersonId,
    matchedOn: asMatchedOn(suggestion.matchedOn),
    source,
    target,
    collisions,
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

      // --- ContactPoints: dedupe phone e164 / emailNorm ---
      const sourceCps = await tx.contactPoint.findMany({
        where: { personId: sourcePersonId, deletedAt: null },
      });
      for (const cp of sourceCps) {
        let existingId: string | null = null;
        if (cp.kind === "phone" && cp.e164) {
          const hit = await tx.contactPoint.findFirst({
            where: {
              personId: targetPersonId,
              kind: "phone",
              e164: cp.e164,
              deletedAt: null,
            },
            select: { id: true, provenance: true },
          });
          if (hit) {
            await tx.contactPoint.update({
              where: { id: hit.id },
              data: {
                provenance: mergeProvenance(hit.provenance, cp.provenance),
              },
            });
            await tx.contactPoint.delete({ where: { id: cp.id } });
            mergedIntoExisting.push({
              entityType: "ContactPoint",
              entityId: hit.id,
              fromSourceEntityId: cp.id,
            });
            existingId = hit.id;
          }
        } else if (cp.kind === "email" && cp.emailNorm) {
          const hit = await tx.contactPoint.findFirst({
            where: {
              personId: targetPersonId,
              kind: "email",
              emailNorm: cp.emailNorm,
              deletedAt: null,
            },
            select: { id: true, provenance: true },
          });
          if (hit) {
            await tx.contactPoint.update({
              where: { id: hit.id },
              data: {
                provenance: mergeProvenance(hit.provenance, cp.provenance),
              },
            });
            await tx.contactPoint.delete({ where: { id: cp.id } });
            mergedIntoExisting.push({
              entityType: "ContactPoint",
              entityId: hit.id,
              fromSourceEntityId: cp.id,
            });
            existingId = hit.id;
          }
        }
        if (!existingId) {
          await tx.contactPoint.update({
            where: { id: cp.id },
            data: { personId: targetPersonId },
          });
          movedEntityIds.contactPoints.push(cp.id);
        }
      }

      // --- Documents: dedupe type + numberNorm ---
      const sourceDocs = await tx.identityDocument.findMany({
        where: { personId: sourcePersonId, deletedAt: null },
      });
      for (const doc of sourceDocs) {
        const hit = await tx.identityDocument.findFirst({
          where: {
            personId: targetPersonId,
            type: doc.type,
            numberNorm: doc.numberNorm,
            deletedAt: null,
          },
          select: { id: true, provenance: true },
        });
        if (hit) {
          await tx.identityDocument.update({
            where: { id: hit.id },
            data: {
              provenance: mergeProvenance(hit.provenance, doc.provenance),
            },
          });
          await tx.identityDocument.delete({ where: { id: doc.id } });
          mergedIntoExisting.push({
            entityType: "IdentityDocument",
            entityId: hit.id,
            fromSourceEntityId: doc.id,
          });
        } else {
          await tx.identityDocument.update({
            where: { id: doc.id },
            data: { personId: targetPersonId },
          });
          movedEntityIds.documents.push(doc.id);
        }
      }

      // --- Addresses: always move ---
      const sourceAddrs = await tx.address.findMany({
        where: { personId: sourcePersonId, deletedAt: null },
        select: { id: true },
      });
      for (const a of sourceAddrs) {
        await tx.address.update({
          where: { id: a.id },
          data: { personId: targetPersonId },
        });
        movedEntityIds.addresses.push(a.id);
      }

      // --- Relationships: always move ---
      const sourceRels = await tx.relationship.findMany({
        where: { personId: sourcePersonId, deletedAt: null },
        select: { id: true },
      });
      for (const r of sourceRels) {
        await tx.relationship.update({
          where: { id: r.id },
          data: { personId: targetPersonId },
        });
        movedEntityIds.relationships.push(r.id);
      }

      // --- NameVariants: always move ---
      const sourceNames = await tx.nameVariant.findMany({
        where: { personId: sourcePersonId },
        select: { id: true },
      });
      for (const n of sourceNames) {
        await tx.nameVariant.update({
          where: { id: n.id },
          data: { personId: targetPersonId },
        });
        movedEntityIds.nameVariants.push(n.id);
      }

      // --- PersonSourceReport: move; unique conflict → drop source (KD22) ---
      const sourcePsrs = await tx.personSourceReport.findMany({
        where: { personId: sourcePersonId },
      });
      for (const psr of sourcePsrs) {
        const targetHas = await tx.personSourceReport.findFirst({
          where: {
            personId: targetPersonId,
            reportImportId: psr.reportImportId,
          },
          select: { id: true },
        });
        if (targetHas) {
          await tx.personSourceReport.delete({ where: { id: psr.id } });
          skippedPersonSourceReportIds.push(psr.id);
        } else {
          await tx.personSourceReport.update({
            where: { id: psr.id },
            data: { personId: targetPersonId },
          });
          movedEntityIds.personSourceReports.push(psr.id);
        }
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
  const existing = await prisma.mergeSuggestion.findUnique({
    where: { id: suggestionId },
  });
  if (!existing) {
    throw new AppError("NOT_FOUND", "Merge suggestion not found");
  }
  if (existing.status !== "open") {
    throw new AppError("BAD_REQUEST", "Merge suggestion is not open");
  }
  await prisma.mergeSuggestion.update({
    where: { id: suggestionId },
    data: { status: "dismissed", resolvedAt: new Date() },
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
  const status = params.status ?? "open";
  const rows = await prisma.mergeSuggestion.findMany({
    where: {
      status,
      ...(params.personId
        ? {
            OR: [
              { newPersonId: params.personId },
              { targetPersonId: params.personId },
            ],
          }
        : {}),
      // Only suggestions where both parties are non-deleted when listing open;
      // for historical statuses still hide soft-deleted parties for UI safety.
      newPerson: { deletedAt: null },
      targetPerson: { deletedAt: null },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
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
