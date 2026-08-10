import type {
  Address as DomainAddress,
  ContactPoint,
  IdentityDocument,
  NameVariant,
  Person,
  Provenance,
  Relationship,
} from "@contact-vault/domain";
import type {
  Address,
  ContactPoint as DbContactPoint,
  IdentityDocument as DbIdentityDocument,
  NameVariant as DbNameVariant,
  Person as DbPerson,
  PersonSourceReport,
  Relationship as DbRelationship,
} from "@prisma/client";

export type PersonWithChildren = DbPerson & {
  contactPoints: DbContactPoint[];
  documents: DbIdentityDocument[];
  addresses: Address[];
  relationships: DbRelationship[];
  nameVariants: DbNameVariant[];
  sourceReports: PersonSourceReport[];
};

function asProvenanceArray(value: unknown): Provenance[] {
  if (!Array.isArray(value)) return [];
  return value as Provenance[];
}

function mapContactPoint(cp: DbContactPoint): ContactPoint {
  const provenance = asProvenanceArray(cp.provenance);
  switch (cp.kind) {
    case "phone":
      return {
        kind: "phone",
        e164: cp.e164 ?? undefined,
        raw: cp.raw ?? undefined,
        isPrimary: cp.isPrimary || undefined,
        tags: cp.tags.length > 0 ? cp.tags : undefined,
        meta:
          cp.meta && typeof cp.meta === "object"
            ? (cp.meta as Record<string, unknown>)
            : undefined,
        provenance,
      };
    case "email":
      return {
        kind: "email",
        value: cp.email ?? "",
        isPrimary: cp.isPrimary || undefined,
        provenance,
      };
    case "social":
      return {
        kind: "social",
        network: cp.network ?? "",
        username: cp.username ?? undefined,
        url: cp.url ?? undefined,
        displayName: cp.displayName ?? undefined,
        meta:
          cp.meta && typeof cp.meta === "object"
            ? (cp.meta as Record<string, string>)
            : undefined,
        provenance,
      };
    case "messenger":
      return {
        kind: "messenger",
        network: cp.network ?? "",
        identifier: cp.identifier ?? "",
        provenance,
      };
    default: {
      const _exhaustive: never = cp.kind;
      throw new Error(`Unknown contact point kind: ${_exhaustive}`);
    }
  }
}

function mapDocument(doc: DbIdentityDocument): IdentityDocument {
  return {
    id: doc.id,
    type: doc.type,
    number: doc.number,
    series: doc.series ?? undefined,
    issuedAt: doc.issuedAt ?? undefined,
    issuedBy: doc.issuedBy ?? undefined,
    departmentCode: doc.departmentCode ?? undefined,
    validUntil: doc.validUntil ?? undefined,
    status:
      doc.status === "valid" ||
      doc.status === "invalid" ||
      doc.status === "unknown"
        ? doc.status
        : undefined,
    meta:
      doc.meta && typeof doc.meta === "object"
        ? (doc.meta as Record<string, string>)
        : undefined,
    provenance: asProvenanceArray(doc.provenance),
  };
}

function mapAddress(addr: Address): DomainAddress {
  return {
    id: addr.id,
    raw: addr.raw,
    normalized: addr.normalized ?? undefined,
    category: addr.category,
    period:
      addr.periodFrom || addr.periodTo
        ? {
            from: addr.periodFrom ?? undefined,
            to: addr.periodTo ?? undefined,
          }
        : undefined,
    components:
      addr.components && typeof addr.components === "object"
        ? (addr.components as DomainAddress["components"])
        : undefined,
    geo:
      addr.geo &&
      typeof addr.geo === "object" &&
      "lat" in (addr.geo as object) &&
      "lon" in (addr.geo as object)
        ? (addr.geo as { lat: number; lon: number })
        : undefined,
    provenance: asProvenanceArray(addr.provenance),
  };
}

function mapRelationship(rel: DbRelationship): Relationship {
  const hint =
    rel.relatedPersonHint && typeof rel.relatedPersonHint === "object"
      ? (rel.relatedPersonHint as Relationship["relatedPersonHint"])
      : {};
  return {
    id: rel.id,
    type: rel.type,
    relationLabel: rel.relationLabel ?? undefined,
    relatedPersonId: rel.relatedPersonId ?? undefined,
    relatedPersonHint: hint,
    sharedAddress: rel.sharedAddress ?? undefined,
    strength: rel.strength ?? undefined,
    provenance: asProvenanceArray(rel.provenance),
  };
}

function mapNameVariant(nv: DbNameVariant): NameVariant {
  return {
    full: nv.full,
    last: nv.last ?? undefined,
    first: nv.first ?? undefined,
    middle: nv.middle ?? undefined,
    dobHint: nv.dobHint ?? undefined,
    provenance: asProvenanceArray(nv.provenance),
  };
}

const SOURCE_MODES = [
  "void_html",
  "text_export",
  "inline_dossier",
  "telegram",
  "fio",
  "facesearch",
  "other",
] as const;

type SourceMode = (typeof SOURCE_MODES)[number];

function mapSourceMode(mode: string | null | undefined): SourceMode | undefined {
  if (!mode) return undefined;
  return (SOURCE_MODES as readonly string[]).includes(mode)
    ? (mode as SourceMode)
    : "other";
}

/**
 * Map Prisma person + children to domain Person.
 * Filters soft-deleted contact points / docs / addresses / relationships if present.
 */
export function toDomainPerson(row: PersonWithChildren): Person {
  const nameVariants = row.nameVariants.map(mapNameVariant);

  // Prefer matching NameVariant row for provenance; fall back to first variant.
  const matchingVariant =
    nameVariants.find(
      (nv) =>
        nv.full === row.canonicalFull &&
        (nv.last ?? undefined) === (row.canonicalLast ?? undefined) &&
        (nv.first ?? undefined) === (row.canonicalFirst ?? undefined) &&
        (nv.middle ?? undefined) === (row.canonicalMiddle ?? undefined),
    ) ?? nameVariants[0];

  const fallbackProvenance: Provenance[] =
    matchingVariant?.provenance ??
    (row.sourceReports[0]
      ? [
          {
            reportId: row.sourceReports[0].reportImportId,
            sourceName: "import",
            extractedAt: row.createdAt.toISOString(),
          },
        ]
      : [
          {
            // Last resort for legacy/incomplete rows (should not occur after createFromDraft)
            reportId: row.id,
            sourceName: "system",
            extractedAt: row.createdAt.toISOString(),
          },
        ]);

  const canonicalName: NameVariant | undefined = row.canonicalFull
    ? {
        full: row.canonicalFull,
        last: row.canonicalLast ?? undefined,
        first: row.canonicalFirst ?? undefined,
        middle: row.canonicalMiddle ?? undefined,
        provenance: fallbackProvenance,
      }
    : matchingVariant;

  const variantsForDomain =
    nameVariants.length > 0
      ? nameVariants
      : canonicalName
        ? [canonicalName]
        : [];

  return {
    id: row.id,
    tempId: undefined,
    canonicalName,
    nameVariants: variantsForDomain,
    dateOfBirth: row.dateOfBirth ?? undefined,
    placeOfBirth: row.placeOfBirth ?? undefined,
    gender:
      row.gender === "male" ||
      row.gender === "female" ||
      row.gender === "other" ||
      row.gender === "unknown"
        ? row.gender
        : undefined,
    contactPoints: row.contactPoints
      .filter((cp) => cp.deletedAt == null)
      .map(mapContactPoint),
    documents: row.documents
      .filter((d) => d.deletedAt == null)
      .map(mapDocument),
    addresses: row.addresses
      .filter((a) => a.deletedAt == null)
      .map(mapAddress),
    relationships: row.relationships
      .filter((r) => r.deletedAt == null)
      .map(mapRelationship),
    extras:
      row.extras && typeof row.extras === "object"
        ? (row.extras as Record<string, unknown>)
        : undefined,
    sourceReports: row.sourceReports.map((sr) => ({
      reportId: sr.reportImportId,
      query: sr.query,
      contentHash: sr.contentHash,
      importedAt: sr.importedAt.toISOString(),
      mode: mapSourceMode(sr.mode),
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  };
}

export const personInclude = {
  contactPoints: true,
  documents: true,
  addresses: true,
  relationships: true,
  nameVariants: true,
  sourceReports: true,
} as const;
