import type {
  Address as DomainAddress,
  ContactPoint,
  IdentityDocument,
  Incident as DomainIncident,
  NameVariant,
  Person,
  Provenance,
  Relationship,
  RiskScore as DomainRiskScore,
} from "@contact-vault/domain";
import type {
  Address,
  ContactPoint as DbContactPoint,
  IdentityDocument as DbIdentityDocument,
  Incident as DbIncident,
  NameVariant as DbNameVariant,
  Person as DbPerson,
  PersonSourceReport,
  Relationship as DbRelationship,
  RiskScore as DbRiskScore,
} from "@prisma/client";
import { normalizeSourceMode } from "../format.js";

export { normalizeSourceMode };

export type PersonSourceReportWithImport = PersonSourceReport & {
  reportImport?: { warnings: unknown } | null;
};

export type PersonWithChildren = DbPerson & {
  contactPoints: DbContactPoint[];
  documents: DbIdentityDocument[];
  addresses: Address[];
  relationships: DbRelationship[];
  nameVariants: DbNameVariant[];
  riskScores: DbRiskScore[];
  incidents: DbIncident[];
  sourceReports: PersonSourceReportWithImport[];
};

export type SourceWarning = NonNullable<
  Person["sourceReports"][number]["warnings"]
>[number];

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

function sameNameParts(
  a: { full: string; last?: string | null; first?: string | null; middle?: string | null },
  b: { full: string; last?: string | null; first?: string | null; middle?: string | null },
): boolean {
  return (
    a.full === b.full &&
    (a.last ?? undefined) === (b.last ?? undefined) &&
    (a.first ?? undefined) === (b.first ?? undefined) &&
    (a.middle ?? undefined) === (b.middle ?? undefined)
  );
}

function mapRiskScore(row: DbRiskScore): DomainRiskScore {
  const categories = Array.isArray(row.categories)
    ? (row.categories as DomainRiskScore["categories"])
    : [];
  const articles = Array.isArray(row.articles)
    ? (row.articles as DomainRiskScore["articles"])
    : [];
  return {
    id: row.id,
    overall: row.overall,
    label: row.label ?? undefined,
    categories,
    articles,
    provenance: asProvenanceArray(row.provenance),
  };
}

function mapIncident(row: DbIncident): DomainIncident {
  return {
    id: row.id,
    severity: row.severity,
    title: row.title ?? undefined,
    body:
      row.body && typeof row.body === "object" && !Array.isArray(row.body)
        ? (row.body as Record<string, string>)
        : undefined,
    articleCode: row.articleCode ?? undefined,
    caseNumber: row.caseNumber ?? undefined,
    sentenceDate: row.sentenceDate ?? undefined,
    decision: row.decision ?? undefined,
    region: row.region ?? undefined,
    tags: row.tags.length > 0 ? row.tags : undefined,
    provenance: asProvenanceArray(row.provenance),
  };
}

export function asSourceWarnings(value: unknown): SourceWarning[] {
  if (!Array.isArray(value)) return [];
  const out: SourceWarning[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const w = item as Record<string, unknown>;
    if (typeof w.code !== "string" || typeof w.message !== "string") continue;
    const severity =
      w.severity === "error" || w.severity === "warn" || w.severity === "info"
        ? w.severity
        : "info";
    out.push({
      code: w.code,
      message: w.message,
      section: typeof w.section === "string" ? w.section : undefined,
      key: typeof w.key === "string" ? w.key : undefined,
      severity,
    });
  }
  return out;
}

/**
 * Map Prisma person + children to domain Person.
 * Filters soft-deleted contact points / docs / addresses / relationships /
 * risk scores / incidents if present.
 */
export function toDomainPerson(row: PersonWithChildren): Person {
  const nameVariants = row.nameVariants.map(mapNameVariant);

  // Prefer matching NameVariant row for provenance; fall back to first variant.
  const matchingVariant =
    nameVariants.find((nv) =>
      sameNameParts(nv, {
        full: row.canonicalFull ?? "",
        last: row.canonicalLast,
        first: row.canonicalFirst,
        middle: row.canonicalMiddle,
      }),
    ) ?? nameVariants[0];

  // Never invent provenance with personId as reportId (wrong entity). Prefer variant
  // provenance, then first source report; if neither exists, omit canonicalName even
  // when canonicalFull is set (incomplete row — should not occur after createFromDraft).
  const provenanceForCanonical: Provenance[] | undefined =
    matchingVariant?.provenance ??
    (row.sourceReports[0]
      ? [
          {
            reportId: row.sourceReports[0].reportImportId,
            sourceName: "import",
            extractedAt: row.createdAt.toISOString(),
          },
        ]
      : undefined);

  const canonicalName: NameVariant | undefined =
    row.canonicalFull && provenanceForCanonical
      ? {
          full: row.canonicalFull,
          last: row.canonicalLast ?? undefined,
          first: row.canonicalFirst ?? undefined,
          middle: row.canonicalMiddle ?? undefined,
          provenance: provenanceForCanonical,
        }
      : matchingVariant;

  // nameVariants are extras only — never repeat the canonical match.
  const extras = canonicalName
    ? nameVariants.filter((nv) => !sameNameParts(nv, canonicalName))
    : nameVariants;

  return {
    id: row.id,
    tempId: undefined,
    canonicalName,
    nameVariants: extras,
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
    riskScores: (row.riskScores ?? [])
      .filter((r) => r.deletedAt == null)
      .map(mapRiskScore),
    incidents: (row.incidents ?? [])
      .filter((r) => r.deletedAt == null)
      .map(mapIncident),
    extras:
      row.extras && typeof row.extras === "object"
        ? (row.extras as Record<string, unknown>)
        : undefined,
    sourceReports: row.sourceReports.map((sr) => ({
      reportId: sr.reportImportId,
      query: sr.query,
      contentHash: sr.contentHash,
      importedAt: sr.importedAt.toISOString(),
      mode: normalizeSourceMode(sr.mode),
      warnings: asSourceWarnings(sr.reportImport?.warnings),
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  };
}

/** Include non-deleted child facts for 360 / createFromDraft return mapping. */
export const personInclude = {
  contactPoints: { where: { deletedAt: null } },
  documents: { where: { deletedAt: null } },
  addresses: { where: { deletedAt: null } },
  relationships: { where: { deletedAt: null } },
  riskScores: { where: { deletedAt: null } },
  incidents: { where: { deletedAt: null } },
  nameVariants: true,
  sourceReports: {
    include: {
      reportImport: { select: { warnings: true } },
    },
  },
} as const;
