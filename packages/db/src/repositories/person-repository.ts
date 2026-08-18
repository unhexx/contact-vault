import {
  normalizeDocumentNumber,
  normalizeEmail,
  PersonDraftSchema,
  type ExactMatchKey,
  type Person,
  type PersonDraft,
} from "@contact-vault/domain";
import type {
  AddressCategory,
  ContactPointKind,
  DocumentType,
  Prisma,
  PrismaClient,
  RelationshipType,
} from "@prisma/client";
import { CursorError, decodeListCursor, encodeListCursor } from "../cursor.js";
import { dedupeContactPoints, dedupeDocuments } from "../dedupe-facts.js";
import { normalizeSourceMode } from "../format.js";
import {
  personInclude,
  toDomainPerson,
  type PersonWithChildren,
} from "../mappers/person-mapper.js";
import type {
  CreateFromDraftContext,
  DbClient,
  ExactMatchCandidate,
  FindByExactKeysOpts,
  ListPersonsParams,
  ListPersonsResult,
  MatchedOnField,
  PersonRepository,
  PersonSummary,
} from "../types.js";

/**
 * Search fragments for IdentityDocument.numberNorm (Russian-first).
 * Digits-only matches passport_ru/snils/inn/oms; alnum strip matches foreign/license.
 */
function documentSearchFragments(q: string): string[] {
  const out = new Set<string>();
  const digits = q.replace(/\D/g, "");
  if (digits.length > 0) out.add(digits);
  const alnum = q.toUpperCase().replace(/[\s\-_.]/g, "");
  if (alnum.length > 0) out.add(alnum);
  return Array.from(out);
}

function db(client: DbClient): DbClient {
  return client;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/**
 * Build ContactPoint create rows with emailNorm / optional e164 (KD12, KD15).
 */
function contactPointCreates(
  draft: PersonDraft,
): Prisma.ContactPointCreateWithoutPersonInput[] {
  return dedupeContactPoints(draft.contactPoints).map((cp) => {
    const base = {
      provenance: toJson(cp.provenance),
      isPrimary: "isPrimary" in cp ? Boolean(cp.isPrimary) : false,
    };
    switch (cp.kind) {
      case "phone":
        return {
          ...base,
          kind: "phone" as ContactPointKind,
          e164: cp.e164 ?? null,
          raw: cp.raw ?? null,
          tags: cp.tags ?? [],
          meta: cp.meta != null ? toJson(cp.meta) : undefined,
        };
      case "email": {
        const email = cp.value;
        return {
          ...base,
          kind: "email" as ContactPointKind,
          email,
          emailNorm: normalizeEmail(email),
        };
      }
      case "social":
        return {
          ...base,
          kind: "social" as ContactPointKind,
          network: cp.network,
          username: cp.username ?? null,
          url: cp.url ?? null,
          displayName: cp.displayName ?? null,
          meta: cp.meta != null ? toJson(cp.meta) : undefined,
        };
      case "messenger":
        return {
          ...base,
          kind: "messenger" as ContactPointKind,
          network: cp.network,
          identifier: cp.identifier,
        };
    }
  });
}

function documentCreates(
  draft: PersonDraft,
): Prisma.IdentityDocumentCreateWithoutPersonInput[] {
  return dedupeDocuments(draft.documents).map((doc) => ({
    type: doc.type as DocumentType,
    number: doc.number,
    numberNorm: normalizeDocumentNumber(doc.type, doc.number),
    series: doc.series ?? null,
    issuedAt: doc.issuedAt ?? null,
    issuedBy: doc.issuedBy ?? null,
    departmentCode: doc.departmentCode ?? null,
    validUntil: doc.validUntil ?? null,
    status: doc.status ?? null,
    meta: doc.meta != null ? toJson(doc.meta) : undefined,
    provenance: toJson(doc.provenance),
  }));
}

function addressCreates(
  draft: PersonDraft,
): Prisma.AddressCreateWithoutPersonInput[] {
  return draft.addresses.map((a) => ({
    raw: a.raw,
    normalized: a.normalized ?? null,
    category: a.category as AddressCategory,
    periodFrom: a.period?.from ?? null,
    periodTo: a.period?.to ?? null,
    components: a.components != null ? toJson(a.components) : undefined,
    geo: a.geo != null ? toJson(a.geo) : undefined,
    provenance: toJson(a.provenance),
  }));
}

function relationshipCreates(
  draft: PersonDraft,
): Prisma.RelationshipCreateWithoutPersonInput[] {
  return draft.relationships.map((r) => ({
    type: r.type as RelationshipType,
    relationLabel: r.relationLabel ?? null,
    relatedPersonId: r.relatedPersonId ?? null,
    relatedPersonHint: toJson(r.relatedPersonHint ?? {}),
    sharedAddress: r.sharedAddress ?? null,
    strength: r.strength ?? null,
    provenance: toJson(r.provenance),
  }));
}

function nameVariantCreates(
  draft: PersonDraft,
): Prisma.NameVariantCreateWithoutPersonInput[] {
  const rows: Prisma.NameVariantCreateWithoutPersonInput[] = [];
  if (draft.canonicalName) {
    rows.push({
      full: draft.canonicalName.full,
      last: draft.canonicalName.last ?? null,
      first: draft.canonicalName.first ?? null,
      middle: draft.canonicalName.middle ?? null,
      dobHint: draft.canonicalName.dobHint ?? null,
      provenance: toJson(draft.canonicalName.provenance),
    });
  }
  for (const nv of draft.nameVariants) {
    // Skip exact duplicate of canonical full already pushed
    if (
      draft.canonicalName &&
      nv.full === draft.canonicalName.full &&
      (nv.last ?? null) === (draft.canonicalName.last ?? null) &&
      (nv.first ?? null) === (draft.canonicalName.first ?? null) &&
      (nv.middle ?? null) === (draft.canonicalName.middle ?? null)
    ) {
      continue;
    }
    rows.push({
      full: nv.full,
      last: nv.last ?? null,
      first: nv.first ?? null,
      middle: nv.middle ?? null,
      dobHint: nv.dobHint ?? null,
      provenance: toJson(nv.provenance),
    });
  }
  return rows;
}

function displayNameFromPerson(p: {
  canonicalFull: string | null;
  nameVariants: { full: string }[];
}): string {
  if (p.canonicalFull?.trim()) return p.canonicalFull.trim();
  const first = p.nameVariants[0]?.full?.trim();
  return first && first.length > 0 ? first : "Unknown";
}

export function createPersonRepository(
  client: PrismaClient | DbClient,
): PersonRepository {
  const root = client as PrismaClient;

  async function createFromDraft(
    draft: PersonDraft,
    ctx: CreateFromDraftContext,
    tx?: DbClient,
  ): Promise<Person> {
    // Runtime contract: provenance + phone e164/raw (KD1, KD15)
    const parsed = PersonDraftSchema.parse(draft);
    const c = db(tx ?? root);
    // Persist domain mode (sectioned_text → text_export, etc.)
    const mode =
      normalizeSourceMode(ctx.mode) ?? ctx.mode;

    const created = await c.person.create({
      data: {
        canonicalFull: parsed.canonicalName?.full ?? null,
        canonicalLast: parsed.canonicalName?.last ?? null,
        canonicalFirst: parsed.canonicalName?.first ?? null,
        canonicalMiddle: parsed.canonicalName?.middle ?? null,
        dateOfBirth: parsed.dateOfBirth ?? null,
        placeOfBirth: parsed.placeOfBirth ?? null,
        gender: parsed.gender ?? null,
        extras: parsed.extras != null ? toJson(parsed.extras) : undefined,
        contactPoints: { create: contactPointCreates(parsed) },
        documents: { create: documentCreates(parsed) },
        addresses: { create: addressCreates(parsed) },
        relationships: { create: relationshipCreates(parsed) },
        nameVariants: { create: nameVariantCreates(parsed) },
        sourceReports: {
          create: {
            reportImportId: ctx.reportImportId,
            query: ctx.query,
            contentHash: ctx.contentHash,
            mode,
          },
        },
      },
      include: personInclude,
    });

    return toDomainPerson(created as PersonWithChildren);
  }

  async function get360(id: string): Promise<Person | null> {
    const row = await root.person.findFirst({
      where: { id, deletedAt: null },
      include: personInclude,
    });
    if (!row) return null;
    return toDomainPerson(row as PersonWithChildren);
  }

  async function softDelete(id: string): Promise<void> {
    const now = new Date();
    await root.$transaction(async (tx) => {
      const person = await tx.person.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!person) {
        // Idempotent: already deleted or missing — no-op
        return;
      }

      await tx.person.update({
        where: { id },
        data: { deletedAt: now },
      });

      await tx.mergeSuggestion.updateMany({
        where: {
          status: "open",
          OR: [{ newPersonId: id }, { targetPersonId: id }],
        },
        data: {
          status: "dismissed",
          resolvedAt: now,
        },
      });

      await tx.auditLog.create({
        data: {
          action: "soft_delete",
          entityType: "Person",
          entityId: id,
          payload: toJson({ personId: id }),
        },
      });
    });
  }

  async function list(params: ListPersonsParams): Promise<ListPersonsResult> {
    const limit = Math.min(Math.max(params.limit, 1), 100);
    const q = params.q?.trim();

    let cursorFilter: Prisma.PersonWhereInput | undefined;
    if (params.cursor) {
      let decoded;
      try {
        decoded = decodeListCursor(params.cursor);
      } catch (e) {
        if (e instanceof CursorError) throw e;
        throw new CursorError("Invalid list cursor");
      }
      const cursorDate = new Date(decoded.updatedAt);
      if (Number.isNaN(cursorDate.getTime())) {
        throw new CursorError("Invalid list cursor updatedAt");
      }
      // ORDER BY updatedAt DESC, id DESC → next page is strictly "before" cursor
      cursorFilter = {
        OR: [
          { updatedAt: { lt: cursorDate } },
          {
            AND: [{ updatedAt: cursorDate }, { id: { lt: decoded.id } }],
          },
        ],
      };
    }

    const docFrags = q ? documentSearchFragments(q) : [];
    const searchFilter: Prisma.PersonWhereInput | undefined = q
      ? {
          OR: [
            { canonicalFull: { contains: q, mode: "insensitive" } },
            {
              nameVariants: {
                some: { full: { contains: q, mode: "insensitive" } },
              },
            },
            {
              contactPoints: {
                some: {
                  deletedAt: null,
                  OR: [
                    { e164: { contains: q } },
                    { emailNorm: { contains: q.toLowerCase() } },
                  ],
                },
              },
            },
            ...(docFrags.length > 0
              ? [
                  {
                    documents: {
                      some: {
                        deletedAt: null,
                        OR: docFrags.map((frag) => ({
                          numberNorm: { contains: frag },
                        })),
                      },
                    },
                  } satisfies Prisma.PersonWhereInput,
                ]
              : []),
          ],
        }
      : undefined;

    // Compose cursor + search with AND so neither OR clobber the other (Issue 1)
    const where: Prisma.PersonWhereInput = {
      deletedAt: null,
      AND: [
        ...(cursorFilter ? [cursorFilter] : []),
        ...(searchFilter ? [searchFilter] : []),
      ],
    };

    const rows = await root.person.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: {
        contactPoints: {
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
        },
        nameVariants: { orderBy: { createdAt: "asc" }, take: 1 },
        _count: {
          select: {
            sourceReports: true,
            mergeSuggestionsAsNew: {
              where: { status: "open" },
            },
            mergeSuggestionsAsTarget: {
              where: { status: "open" },
            },
          },
        },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const items: PersonSummary[] = page.map((p) => {
      const phones = p.contactPoints.filter((c) => c.kind === "phone");
      const emails = p.contactPoints.filter((c) => c.kind === "email");
      const primaryPhone =
        phones.find((c) => c.isPrimary && c.e164)?.e164 ??
        phones.find((c) => c.e164)?.e164 ??
        phones[0]?.raw ??
        undefined;
      const primaryEmail =
        emails.find((c) => c.isPrimary)?.email ??
        emails[0]?.email ??
        undefined;

      return {
        id: p.id,
        displayName: displayNameFromPerson(p),
        primaryPhone: primaryPhone ?? undefined,
        primaryEmail: primaryEmail ?? undefined,
        updatedAt: p.updatedAt.toISOString(),
        sourceCount: p._count.sourceReports,
        openSuggestionCount:
          p._count.mergeSuggestionsAsNew + p._count.mergeSuggestionsAsTarget,
      };
    });

    let nextCursor: string | undefined;
    if (hasMore) {
      const last = page[page.length - 1];
      if (last) {
        nextCursor = encodeListCursor({
          updatedAt: last.updatedAt.toISOString(),
          id: last.id,
        });
      }
    }

    return { items, nextCursor };
  }

  /**
   * Exact match against non-deleted persons and non-deleted facts.
   * Groups hits by personId; never returns self if excludePersonIds set.
   */
  async function findByExactKeys(
    keys: ExactMatchKey[],
    opts?: FindByExactKeysOpts,
    tx?: DbClient,
  ): Promise<ExactMatchCandidate[]> {
    if (keys.length === 0) return [];

    const c = db(tx ?? root);
    const exclude = new Set(opts?.excludePersonIds ?? []);

    // Defense in depth: re-normalize like domain scoreExactMatches (Issue 5)
    const phones = keys
      .filter((k): k is Extract<ExactMatchKey, { kind: "phone" }> => k.kind === "phone")
      .map((k) => k.e164.trim())
      .filter(Boolean);
    const emails = keys
      .filter((k): k is Extract<ExactMatchKey, { kind: "email" }> => k.kind === "email")
      .map((k) => normalizeEmail(k.value))
      .filter(Boolean);
    const docs = keys
      .filter(
        (k): k is Extract<ExactMatchKey, { kind: "document" }> => k.kind === "document",
      )
      .map((d) => ({
        type: d.type,
        number: normalizeDocumentNumber(d.type, d.number),
      }))
      .filter((d) => d.number.length > 0);

    // personId -> matched fields (deduped)
    const byPerson = new Map<string, Map<string, MatchedOnField>>();

    const addHit = (personId: string, hit: MatchedOnField) => {
      if (exclude.has(personId)) return;
      let m = byPerson.get(personId);
      if (!m) {
        m = new Map();
        byPerson.set(personId, m);
      }
      const id = `${hit.field}:${hit.value}`;
      if (!m.has(id)) m.set(id, hit);
    };

    if (phones.length > 0) {
      const rows = await c.contactPoint.findMany({
        where: {
          kind: "phone",
          deletedAt: null,
          e164: { in: phones },
          person: { deletedAt: null },
        },
        select: { e164: true, personId: true },
      });
      for (const row of rows) {
        if (!row.e164) continue;
        addHit(row.personId, { field: "phone", value: row.e164 });
      }
    }

    if (emails.length > 0) {
      const rows = await c.contactPoint.findMany({
        where: {
          kind: "email",
          deletedAt: null,
          emailNorm: { in: emails },
          person: { deletedAt: null },
        },
        select: { emailNorm: true, personId: true },
      });
      for (const row of rows) {
        if (!row.emailNorm) continue;
        addHit(row.personId, { field: "email", value: row.emailNorm });
      }
    }

    if (docs.length > 0) {
      // Query per unique type groups
      const byType = new Map<string, string[]>();
      for (const d of docs) {
        const list = byType.get(d.type) ?? [];
        list.push(d.number);
        byType.set(d.type, list);
      }
      for (const [type, numbers] of byType) {
        const rows = await c.identityDocument.findMany({
          where: {
            type: type as DocumentType,
            numberNorm: { in: numbers },
            deletedAt: null,
            person: { deletedAt: null },
          },
          select: { type: true, numberNorm: true, personId: true },
        });
        for (const row of rows) {
          addHit(row.personId, {
            field: "document",
            value: `${row.type}:${row.numberNorm}`,
          });
        }
      }
    }

    const result: ExactMatchCandidate[] = [];
    for (const [personId, hits] of byPerson) {
      result.push({
        personId,
        matchedOn: Array.from(hits.values()),
      });
    }
    return result;
  }

  return {
    list,
    get360,
    softDelete,
    createFromDraft,
    findByExactKeys,
  };
}
