import { randomUUID } from "node:crypto";
import {
  extractExactMatchKeys,
  type PersonDraft,
  type Provenance,
} from "@contact-vault/domain";
import type { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "../src/client.js";
import {
  createAuditLogRepository,
  createMergeSuggestionRepository,
  createPersonRepository,
  createReportImportRepository,
} from "../src/index.js";

/** Synthetic fixture data only — never real PII. */
export const SYNTH = {
  phoneA: "+79990001122",
  phoneB: "+79990003344",
  emailA: "Alice.Test@example.com",
  emailANorm: "alice.test@example.com",
  emailB: "bob.test@example.com",
  passportA: "4509 123456",
  passportANorm: "4509123456",
  snilsA: "112-233-445 95",
  nameA: "Тестов Тест Тестович",
  nameB: "Другов Друг Другович",
} as const;

export function prov(reportId: string, sourceName = "fixture"): Provenance[] {
  return [
    {
      reportId,
      sourceName,
      section: "test",
      originalKey: "k",
      originalValue: "v",
      extractedAt: new Date().toISOString(),
    },
  ];
}

export function draftPerson(opts: {
  reportId: string;
  name?: string;
  dateOfBirth?: string;
  nameVariants?: string[];
  phone?: string;
  email?: string;
  passport?: string;
  snils?: string;
}): PersonDraft {
  const p = prov(opts.reportId);
  const contactPoints: PersonDraft["contactPoints"] = [];
  if (opts.phone) {
    contactPoints.push({
      kind: "phone",
      e164: opts.phone,
      raw: opts.phone,
      provenance: p,
    });
  }
  if (opts.email) {
    contactPoints.push({
      kind: "email",
      value: opts.email,
      provenance: p,
    });
  }
  const documents: PersonDraft["documents"] = [];
  if (opts.passport) {
    documents.push({
      type: "passport_ru",
      number: opts.passport,
      provenance: p,
    });
  }
  if (opts.snils) {
    documents.push({
      type: "snils",
      number: opts.snils,
      provenance: p,
    });
  }
  const name = opts.name ?? SYNTH.nameA;
  return {
    canonicalName: {
      full: name,
      last: name.split(" ")[0],
      first: name.split(" ")[1],
      provenance: p,
    },
    dateOfBirth: opts.dateOfBirth,
    nameVariants: (opts.nameVariants ?? []).map((full) => ({
      full,
      provenance: p,
    })),
    contactPoints,
    documents,
    addresses: [],
    relationships: [],
    riskScores: [],
    incidents: [],
    bankRelations: [],
    vehicles: [],
    employments: [],
    financialFacts: [],
  };
}

export function contentHashSynthetic(label: string): string {
  // 64-char hex-looking unique string (not cryptographic requirement for tests)
  const base = Buffer.from(`synthetic:${label}:${randomUUID()}`, "utf8")
    .toString("hex")
    .padEnd(64, "0")
    .slice(0, 64);
  return base;
}

export async function truncateAll(prisma: PrismaClient): Promise<void> {
  // Order respects FKs
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AuditLog",
      "MergeSuggestion",
      "PersonSourceReport",
      "ContactPoint",
      "IdentityDocument",
      "Address",
      "Relationship",
      "RiskScore",
      "Incident",
      "BankRelation",
      "Vehicle",
      "Employment",
      "FinancialFact",
      "NameVariant",
      "Person",
      "ReportImport"
    RESTART IDENTITY CASCADE
  `);
}

export type TestCtx = {
  prisma: PrismaClient;
  persons: ReturnType<typeof createPersonRepository>;
  reports: ReturnType<typeof createReportImportRepository>;
  merges: ReturnType<typeof createMergeSuggestionRepository>;
  audit: ReturnType<typeof createAuditLogRepository>;
};

export function createTestCtx(url?: string): TestCtx {
  const prisma = createPrismaClient(
    url ?? process.env.DATABASE_URL,
  );
  return {
    prisma,
    persons: createPersonRepository(prisma),
    reports: createReportImportRepository(prisma),
    merges: createMergeSuggestionRepository(prisma),
    audit: createAuditLogRepository(prisma),
  };
}

export async function ensureReportImport(
  ctx: TestCtx,
  opts?: {
    id?: string;
    contentHash?: string;
    format?: "void_html" | "sectioned_text" | "inline_dossier";
  },
) {
  const id = opts?.id ?? randomUUID();
  const contentHash = opts?.contentHash ?? contentHashSynthetic(id);
  const report = await ctx.reports.create({
    id,
    format: opts?.format ?? "void_html",
    contentHash,
    filename: "synthetic-fixture.html",
    reportQuery: "test-query",
    status: "parsed",
    warnings: [],
  });
  return report;
}

export { extractExactMatchKeys, randomUUID };
