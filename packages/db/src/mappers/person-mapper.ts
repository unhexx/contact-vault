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

export type PersonWithChildren = DbPerson & {
  contactPoints: DbContactPoint[];
  documents: DbIdentityDocument[];
  addresses: Address[];
  relationships: DbRelationship[];
  nameVariants: DbNameVariant[];
  riskScores: DbRiskScore[];
  incidents: DbIncident[];
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

/**
 * Normalize PersonSourceReport.mode to domain Person.sourceReports[].mode.
 * Accepts ReportFormat aliases (sectioned_text, void-html, inline-dossier) so 360 Sources keep signal.
 */
export function normalizeSourceMode(
  mode: string | null | undefined,
): SourceMode | undefined {
  if (!mode) return undefined;
  const aliases: Record<string, SourceMode> = {
    sectioned_text: "text_export",
    "sectioned-text": "text_export",
    void_html: "void_html",
    "void-html": "void_html",
    text_export: "text_export",
    inline_dossier: "inline_dossier",
    "inline-dossier": "inline_dossier",
  };
  if (mode in aliases) return aliases[mode];
  return (SOURCE_MODES as readonly string[]).includes(mode)
    ? (mode as SourceMode)
    : "other";
}

function mapSourceMode(mode: string | null | undefined): SourceMode | undefined {
  return normalizeSourceMode(mode);
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
    nameVariants.find(
      (nv) =>
        nv.full === row.canonicalFull &&
        (nv.last ?? undefined) === (row.canonicalLast ?? undefined) &&
        (nv.first ?? undefined) === (row.canonicalFirst ?? undefined) &&
        (nv.middle ?? undefined) === (row.canonicalMiddle ?? undefined),
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
      mode: mapSourceMode(sr.mode),
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
  sourceReports: true,
} as const;
