/**
 * Persist-time fact uniqueness: same type+numberNorm / phone / email
 * collapses to one row (merge provenance, fill missing scalars).
 */
import {
  normalizeDocumentNumber,
  normalizeEmail,
  type ContactPoint,
  type IdentityDocument,
} from "@contact-vault/domain";

function contactPointKey(cp: ContactPoint): string {
  switch (cp.kind) {
    case "phone":
      return cp.e164
        ? `phone:e164:${cp.e164}`
        : `phone:raw:${cp.raw ?? ""}`;
    case "email":
      return `email:${normalizeEmail(cp.value)}`;
    case "social":
      return `social:${cp.network}:${cp.username ?? ""}:${cp.url ?? ""}`;
    case "messenger":
      return `messenger:${cp.network}:${cp.identifier}`;
  }
}

function mergeContactPoint(existing: ContactPoint, incoming: ContactPoint): ContactPoint {
  const provenance = [...existing.provenance, ...incoming.provenance];
  if (existing.kind === "phone" && incoming.kind === "phone") {
    return {
      ...existing,
      e164: existing.e164 ?? incoming.e164,
      raw: existing.raw ?? incoming.raw,
      isPrimary: existing.isPrimary || incoming.isPrimary,
      tags: existing.tags ?? incoming.tags,
      meta: existing.meta ?? incoming.meta,
      provenance,
    };
  }
  if (existing.kind === "email" && incoming.kind === "email") {
    return {
      ...existing,
      isPrimary: existing.isPrimary || incoming.isPrimary,
      provenance,
    };
  }
  if (existing.kind === "social" && incoming.kind === "social") {
    return {
      ...existing,
      username: existing.username ?? incoming.username,
      url: existing.url ?? incoming.url,
      displayName: existing.displayName ?? incoming.displayName,
      meta: existing.meta ?? incoming.meta,
      provenance,
    };
  }
  return { ...existing, provenance };
}

export function dedupeContactPoints(points: ContactPoint[]): ContactPoint[] {
  const byKey = new Map<string, ContactPoint>();
  for (const cp of points) {
    const key = contactPointKey(cp);
    const existing = byKey.get(key);
    if (existing) {
      byKey.set(key, mergeContactPoint(existing, cp));
    } else {
      byKey.set(key, { ...cp, provenance: [...cp.provenance] });
    }
  }
  return Array.from(byKey.values());
}

function documentKey(doc: IdentityDocument): string {
  return `${doc.type}:${normalizeDocumentNumber(doc.type, doc.number)}`;
}

function mergeDocument(
  existing: IdentityDocument,
  incoming: IdentityDocument,
): IdentityDocument {
  return {
    ...existing,
    series: existing.series ?? incoming.series,
    issuedAt: existing.issuedAt ?? incoming.issuedAt,
    issuedBy: existing.issuedBy ?? incoming.issuedBy,
    departmentCode: existing.departmentCode ?? incoming.departmentCode,
    validUntil: existing.validUntil ?? incoming.validUntil,
    status: existing.status ?? incoming.status,
    meta: existing.meta ?? incoming.meta,
    provenance: [...existing.provenance, ...incoming.provenance],
  };
}

export function dedupeDocuments(docs: IdentityDocument[]): IdentityDocument[] {
  const byKey = new Map<string, IdentityDocument>();
  for (const doc of docs) {
    const key = documentKey(doc);
    const existing = byKey.get(key);
    if (existing) {
      byKey.set(key, mergeDocument(existing, doc));
    } else {
      byKey.set(key, { ...doc, provenance: [...doc.provenance] });
    }
  }
  return Array.from(byKey.values());
}
