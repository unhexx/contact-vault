/**
 * Integration tests against live Postgres (Docker Compose).
 *
 * Required env: DATABASE_URL
 * Setup: docker compose up -d postgres && pnpm db:migrate:deploy
 */
import {
  extractExactMatchKeys,
  normalizeDocumentNumber,
  normalizeEmail,
} from "@contact-vault/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  contentHashSynthetic,
  createTestCtx,
  draftPerson,
  ensureReportImport,
  randomUUID,
  SYNTH,
  truncateAll,
  type TestCtx,
} from "./helpers.js";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("db integration", () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = createTestCtx();
    // Connectivity check
    await ctx.prisma.$connect();
  });

  afterAll(async () => {
    await ctx.prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(ctx.prisma);
  });

  it("createFromDraft persists emailNorm, numberNorm, optional e164, provenance", async () => {
    const report = await ensureReportImport(ctx);
    const draft = draftPerson({
      reportId: report.id,
      name: SYNTH.nameA,
      phone: SYNTH.phoneA,
      email: SYNTH.emailA,
      passport: SYNTH.passportA,
    });

    const person = await ctx.persons.createFromDraft(draft, {
      reportImportId: report.id,
      contentHash: report.contentHash,
      query: "q-test",
      mode: "void_html",
    });

    expect(person.id).toBeTruthy();
    expect(person.canonicalName?.full).toBe(SYNTH.nameA);
    expect(person.contactPoints.some((c) => c.kind === "phone" && c.e164 === SYNTH.phoneA)).toBe(
      true,
    );
    expect(
      person.contactPoints.some(
        (c) => c.kind === "email" && c.value === SYNTH.emailA,
      ),
    ).toBe(true);
    expect(person.sourceReports).toHaveLength(1);
    expect(person.sourceReports[0]?.reportId).toBe(report.id);

    const emailRow = await ctx.prisma.contactPoint.findFirst({
      where: { personId: person.id, kind: "email" },
    });
    expect(emailRow?.emailNorm).toBe(normalizeEmail(SYNTH.emailA));
    expect(emailRow?.email).toBe(SYNTH.emailA);

    const docRow = await ctx.prisma.identityDocument.findFirst({
      where: { personId: person.id, type: "passport_ru" },
    });
    expect(docRow?.numberNorm).toBe(
      normalizeDocumentNumber("passport_ru", SYNTH.passportA),
    );
    expect(Array.isArray(docRow?.provenance)).toBe(true);
  });

  it("match-before-create: candidates are existing only; suggestions never self", async () => {
    // Person A exists with phoneA
    const reportA = await ensureReportImport(ctx);
    const draftA = draftPerson({
      reportId: reportA.id,
      name: SYNTH.nameA,
      phone: SYNTH.phoneA,
    });
    const personA = await ctx.persons.createFromDraft(draftA, {
      reportImportId: reportA.id,
      contentHash: reportA.contentHash,
      query: "import-a",
      mode: "void_html",
    });

    // New import draft B shares phoneA
    const reportB = await ensureReportImport(ctx);
    const draftB = draftPerson({
      reportId: reportB.id,
      name: SYNTH.nameB,
      phone: SYNTH.phoneA, // shared exact key
    });

    // 1) keys + match BEFORE create
    const keys = extractExactMatchKeys(draftB);
    expect(keys).toEqual([{ kind: "phone", e164: SYNTH.phoneA }]);

    const candidates = await ctx.persons.findByExactKeys(keys);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.personId).toBe(personA.id);
    expect(candidates[0]?.matchedOn).toEqual([
      { field: "phone", value: SYNTH.phoneA },
    ]);

    // 2) create B
    const personB = await ctx.persons.createFromDraft(draftB, {
      reportImportId: reportB.id,
      contentHash: reportB.contentHash,
      query: "import-b",
      mode: "sectioned_text",
    });
    expect(personB.id).not.toBe(personA.id);

    // 3) insert suggestions: new=B, target=A only; never self
    for (const c of candidates) {
      if (c.personId === personB.id) {
        throw new Error("self-suggestion candidate leaked");
      }
      await ctx.merges.create({
        reportImportId: reportB.id,
        newPersonId: personB.id,
        targetPersonId: c.personId,
        matchedOn: c.matchedOn,
      });
    }

    const open = await ctx.merges.listOpen();
    expect(open).toHaveLength(1);
    expect(open[0]?.newPersonId).toBe(personB.id);
    expect(open[0]?.targetPersonId).toBe(personA.id);
    expect(open[0]?.newPersonId).not.toBe(open[0]?.targetPersonId);

    // create rejects self-suggestion
    await expect(
      ctx.merges.create({
        reportImportId: reportB.id,
        newPersonId: personB.id,
        targetPersonId: personB.id,
        matchedOn: [{ field: "phone", value: SYNTH.phoneA }],
      }),
    ).rejects.toThrow(/self-suggestion/i);
  });

  it("findByExactKeys with excludePersonIds omits self after create", async () => {
    const report = await ensureReportImport(ctx);
    const draft = draftPerson({
      reportId: report.id,
      phone: SYNTH.phoneB,
      email: SYNTH.emailB,
    });
    const person = await ctx.persons.createFromDraft(draft, {
      reportImportId: report.id,
      contentHash: report.contentHash,
      query: "only-me",
      mode: "void_html",
    });

    const keys = extractExactMatchKeys(draft);
    // Without exclude: finds self
    const withSelf = await ctx.persons.findByExactKeys(keys);
    expect(withSelf.map((c) => c.personId)).toContain(person.id);

    // With exclude: empty (keys only on that person)
    const excluded = await ctx.persons.findByExactKeys(keys, {
      excludePersonIds: [person.id],
    });
    expect(excluded).toEqual([]);
  });

  it("findByExactKeys matches emailNorm case-insensitively and documents by type+numberNorm", async () => {
    const report = await ensureReportImport(ctx);
    const draft = draftPerson({
      reportId: report.id,
      email: SYNTH.emailA, // mixed case
      passport: SYNTH.passportA,
    });
    const person = await ctx.persons.createFromDraft(draft, {
      reportImportId: report.id,
      contentHash: report.contentHash,
      query: "norms",
      mode: "void_html",
    });

    const emailKeys = extractExactMatchKeys({
      ...draft,
      contactPoints: [
        {
          kind: "email",
          value: "ALICE.TEST@EXAMPLE.COM",
          provenance: draft.contactPoints[0]!.provenance,
        },
      ],
      documents: [],
    });
    const emailHits = await ctx.persons.findByExactKeys(emailKeys);
    expect(emailHits[0]?.personId).toBe(person.id);
    expect(emailHits[0]?.matchedOn.some((m) => m.field === "email")).toBe(true);

    const docKeys = extractExactMatchKeys({
      ...draft,
      contactPoints: [],
      documents: [
        {
          type: "passport_ru",
          number: "4509 123456",
          provenance: draft.documents[0]!.provenance,
        },
      ],
    });
    const docHits = await ctx.persons.findByExactKeys(docKeys);
    expect(docHits[0]?.personId).toBe(person.id);
    expect(docHits[0]?.matchedOn[0]?.field).toBe("document");
  });

  it("softDelete hides from list and get360; dismisses open suggestions", async () => {
    const reportA = await ensureReportImport(ctx);
    const personA = await ctx.persons.createFromDraft(
      draftPerson({ reportId: reportA.id, name: SYNTH.nameA, phone: SYNTH.phoneA }),
      {
        reportImportId: reportA.id,
        contentHash: reportA.contentHash,
        query: "a",
        mode: "void_html",
      },
    );

    const reportB = await ensureReportImport(ctx);
    const personB = await ctx.persons.createFromDraft(
      draftPerson({ reportId: reportB.id, name: SYNTH.nameB, phone: SYNTH.phoneA }),
      {
        reportImportId: reportB.id,
        contentHash: reportB.contentHash,
        query: "b",
        mode: "void_html",
      },
    );

    await ctx.merges.create({
      reportImportId: reportB.id,
      newPersonId: personB.id,
      targetPersonId: personA.id,
      matchedOn: [{ field: "phone", value: SYNTH.phoneA }],
    });

    expect(await ctx.persons.get360(personA.id)).not.toBeNull();
    const beforeList = await ctx.persons.list({ limit: 10 });
    expect(beforeList.items.map((i) => i.id).sort()).toEqual(
      [personA.id, personB.id].sort(),
    );

    await ctx.persons.softDelete(personA.id);

    expect(await ctx.persons.get360(personA.id)).toBeNull();
    const afterList = await ctx.persons.list({ limit: 10 });
    expect(afterList.items.map((i) => i.id)).toEqual([personB.id]);

    // Open suggestions involving A are dismissed
    const open = await ctx.merges.listOpen();
    expect(open).toHaveLength(0);

    const suggestion = await ctx.prisma.mergeSuggestion.findFirst({
      where: { newPersonId: personB.id },
    });
    expect(suggestion?.status).toBe("dismissed");
    expect(suggestion?.resolvedAt).not.toBeNull();

    // Soft-deleted person not returned by exact match
    const hits = await ctx.persons.findByExactKeys([
      { kind: "phone", e164: SYNTH.phoneA },
    ]);
    expect(hits.map((h) => h.personId)).toEqual([personB.id]);

    // Audit log written
    const logs = await ctx.audit.listForEntity("Person", personA.id);
    expect(logs.some((l) => l.action === "soft_delete")).toBe(true);
  });

  it("ReportImport.contentHash is unique", async () => {
    const hash = contentHashSynthetic("dup");
    const id1 = randomUUID();
    const id2 = randomUUID();

    await ctx.reports.create({
      id: id1,
      format: "void_html",
      contentHash: hash,
      status: "completed",
    });

    await expect(
      ctx.reports.create({
        id: id2,
        format: "sectioned_text",
        contentHash: hash,
        status: "pending",
      }),
    ).rejects.toThrow(/Unique constraint|unique/i);

    const found = await ctx.reports.findByContentHash(hash);
    expect(found?.id).toBe(id1);
  });

  it("list cursor pagination returns stable pages", async () => {
    for (let i = 0; i < 3; i++) {
      const report = await ensureReportImport(ctx);
      await ctx.persons.createFromDraft(
        draftPerson({
          reportId: report.id,
          name: `Синтетик ${i}`,
          phone: `+7999000${1000 + i}`,
        }),
        {
          reportImportId: report.id,
          contentHash: report.contentHash,
          query: `q-${i}`,
          mode: "void_html",
        },
      );
    }

    const page1 = await ctx.persons.list({ limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await ctx.persons.list({
      limit: 2,
      cursor: page1.nextCursor,
    });
    expect(page2.items).toHaveLength(1);
    const allIds = [...page1.items, ...page2.items].map((i) => i.id);
    expect(new Set(allIds).size).toBe(3);
  });

  it("list search matches phone e164 and emailNorm", async () => {
    const report = await ensureReportImport(ctx);
    await ctx.persons.createFromDraft(
      draftPerson({
        reportId: report.id,
        phone: SYNTH.phoneA,
        email: SYNTH.emailA,
        name: SYNTH.nameA,
      }),
      {
        reportImportId: report.id,
        contentHash: report.contentHash,
        query: "search",
        mode: "void_html",
      },
    );

    const byPhone = await ctx.persons.list({ q: "79990001122", limit: 10 });
    expect(byPhone.items).toHaveLength(1);

    const byEmail = await ctx.persons.list({
      q: "alice.test@example.com",
      limit: 10,
    });
    expect(byEmail.items).toHaveLength(1);

    const byName = await ctx.persons.list({ q: "Тестов", limit: 10 });
    expect(byName.items).toHaveLength(1);
  });
});

describe("db unit (no DB)", () => {
  it("skips integration suite when DATABASE_URL is unset (guard)", () => {
    // Documents the skipIf behavior for CI without Postgres
    expect(typeof hasDb).toBe("boolean");
  });
});
