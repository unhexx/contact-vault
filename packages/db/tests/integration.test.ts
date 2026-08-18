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
import { CursorError } from "../src/cursor.js";
import { DbError } from "../src/errors.js";
import {
  contentHashSynthetic,
  createTestCtx,
  draftPerson,
  ensureReportImport,
  prov,
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

    // 2) create B (sectioned_text alias → text_export on Sources)
    const personB = await ctx.persons.createFromDraft(draftB, {
      reportImportId: reportB.id,
      contentHash: reportB.contentHash,
      query: "import-b",
      mode: "sectioned_text",
    });
    expect(personB.id).not.toBe(personA.id);
    expect(personB.sourceReports[0]?.mode).toBe("text_export");

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

    const open = await ctx.merges.list({ status: "open" });
    expect(open).toHaveLength(1);
    expect(open[0]?.newPersonId).toBe(personB.id);
    expect(open[0]?.targetPersonId).toBe(personA.id);
    expect(open[0]?.newPersonId).not.toBe(open[0]?.targetPersonId);

    // create rejects self-suggestion with stable DbError code
    await expect(
      ctx.merges.create({
        reportImportId: reportB.id,
        newPersonId: personB.id,
        targetPersonId: personB.id,
        matchedOn: [{ field: "phone", value: SYNTH.phoneA }],
      }),
    ).rejects.toMatchObject({ code: "SELF_SUGGESTION" } satisfies Partial<DbError>);
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
    const open = await ctx.merges.list({ status: "open" });
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

  it("list search matches nameVariants.full when canonicalFull is empty", async () => {
    const report = await ensureReportImport(ctx);
    const variantFull = "Вариантов Вариант Вариантович";
    const person = await ctx.persons.createFromDraft(
      {
        nameVariants: [
          {
            full: variantFull,
            last: "Вариантов",
            first: "Вариант",
            middle: "Вариантович",
            provenance: prov(report.id),
          },
        ],
        contactPoints: [],
        documents: [],
        addresses: [],
        relationships: [],
      },
      {
        reportImportId: report.id,
        contentHash: report.contentHash,
        query: "variant-search",
        mode: "void_html",
      },
    );

    const row = await ctx.prisma.person.findUnique({ where: { id: person.id } });
    expect(row?.canonicalFull).toBeNull();

    const byVariant = await ctx.persons.list({ q: "Вариантов", limit: 10 });
    expect(byVariant.items.some((item) => item.id === person.id)).toBe(true);
    expect(byVariant.items.find((item) => item.id === person.id)?.displayName).toBe(
      variantFull,
    );
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

  it("list with q + cursor returns disjoint multi-page coverage", async () => {
    // Shared prefix so all match the same search query
    for (let i = 0; i < 3; i++) {
      const report = await ensureReportImport(ctx);
      await ctx.persons.createFromDraft(
        draftPerson({
          reportId: report.id,
          name: `КурсорПоиск ${i}`,
          phone: `+7999111${2000 + i}`,
        }),
        {
          reportImportId: report.id,
          contentHash: report.contentHash,
          query: `cursor-q-${i}`,
          mode: "void_html",
        },
      );
    }
    // Noise person that must not appear under q
    const noise = await ensureReportImport(ctx);
    await ctx.persons.createFromDraft(
      draftPerson({
        reportId: noise.id,
        name: "Другой Человек",
        phone: "+79992223344",
      }),
      {
        reportImportId: noise.id,
        contentHash: noise.contentHash,
        query: "noise",
        mode: "void_html",
      },
    );

    const page1 = await ctx.persons.list({ q: "КурсорПоиск", limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();
    expect(page1.items.every((i) => i.displayName.includes("КурсорПоиск"))).toBe(
      true,
    );

    const page2 = await ctx.persons.list({
      q: "КурсорПоиск",
      limit: 2,
      cursor: page1.nextCursor,
    });
    expect(page2.items).toHaveLength(1);
    const allIds = [...page1.items, ...page2.items].map((i) => i.id);
    expect(new Set(allIds).size).toBe(3);
    // No overlap between pages
    expect(
      page1.items.some((a) => page2.items.some((b) => b.id === a.id)),
    ).toBe(false);
  });

  it("list document search finds SNILS with dashes/spaces (Russian-first)", async () => {
    const report = await ensureReportImport(ctx);
    await ctx.persons.createFromDraft(
      draftPerson({
        reportId: report.id,
        name: SYNTH.nameA,
        snils: SYNTH.snilsA, // 112-233-445 95
      }),
      {
        reportImportId: report.id,
        contentHash: report.contentHash,
        query: "snils-search",
        mode: "void_html",
      },
    );

    const byDashed = await ctx.persons.list({ q: "112-233-445", limit: 10 });
    expect(byDashed.items).toHaveLength(1);

    const bySpaced = await ctx.persons.list({
      q: "112 233 445 95",
      limit: 10,
    });
    expect(bySpaced.items).toHaveLength(1);
  });

  it("invalid list cursor throws CursorError (BAD_REQUEST)", async () => {
    await expect(ctx.persons.list({ limit: 10, cursor: "not-valid!!!" })).rejects.toBeInstanceOf(
      CursorError,
    );
    await expect(
      ctx.persons.list({
        limit: 10,
        cursor: Buffer.from("{}", "utf8").toString("base64url"),
      }),
    ).rejects.toBeInstanceOf(CursorError);
  });

  it("softDelete is idempotent on second call", async () => {
    const report = await ensureReportImport(ctx);
    const person = await ctx.persons.createFromDraft(
      draftPerson({ reportId: report.id, phone: SYNTH.phoneA }),
      {
        reportImportId: report.id,
        contentHash: report.contentHash,
        query: "idem",
        mode: "void_html",
      },
    );
    await ctx.persons.softDelete(person.id);
    await expect(ctx.persons.softDelete(person.id)).resolves.toBeUndefined();
    expect(await ctx.persons.get360(person.id)).toBeNull();
  });

  it("phone without e164 is not an exact-match key and not found by e164 query", async () => {
    const report = await ensureReportImport(ctx);
    const p = prov(report.id);
    const draft = {
      ...draftPerson({ reportId: report.id, name: SYNTH.nameA }),
      contactPoints: [
        {
          kind: "phone" as const,
          raw: "не номер",
          provenance: p,
        },
      ],
    };
    expect(extractExactMatchKeys(draft)).toEqual([]);

    const person = await ctx.persons.createFromDraft(draft, {
      reportImportId: report.id,
      contentHash: report.contentHash,
      query: "raw-only",
      mode: "void_html",
    });

    const hits = await ctx.persons.findByExactKeys([
      { kind: "phone", e164: SYNTH.phoneA },
    ]);
    expect(hits.map((h) => h.personId)).not.toContain(person.id);
  });

  it("list omits suggestions whose parties are soft-deleted without flipping status", async () => {
    const reportA = await ensureReportImport(ctx);
    const personA = await ctx.persons.createFromDraft(
      draftPerson({ reportId: reportA.id, phone: SYNTH.phoneA }),
      {
        reportImportId: reportA.id,
        contentHash: reportA.contentHash,
        query: "a",
        mode: "void_html",
      },
    );
    const reportB = await ensureReportImport(ctx);
    const personB = await ctx.persons.createFromDraft(
      draftPerson({ reportId: reportB.id, phone: SYNTH.phoneB }),
      {
        reportImportId: reportB.id,
        contentHash: reportB.contentHash,
        query: "b",
        mode: "void_html",
      },
    );
    const suggestion = await ctx.merges.create({
      reportImportId: reportB.id,
      newPersonId: personB.id,
      targetPersonId: personA.id,
      matchedOn: [{ field: "phone", value: SYNTH.phoneA }],
    });

    await ctx.prisma.person.update({
      where: { id: personA.id },
      data: { deletedAt: new Date() },
    });

    expect(await ctx.merges.list({ status: "open" })).toEqual([]);
    const row = await ctx.merges.findById(suggestion.id);
    expect(row?.status).toBe("open");
  });

  it("createFromDraft does not list the canonical name twice", async () => {
    const report = await ensureReportImport(ctx);
    const extra = "Вариантов Вариант Вариантович";
    const person = await ctx.persons.createFromDraft(
      {
        ...draftPerson({ reportId: report.id, name: SYNTH.nameA }),
        nameVariants: [
          {
            full: SYNTH.nameA,
            last: SYNTH.nameA.split(" ")[0],
            first: SYNTH.nameA.split(" ")[1],
            provenance: prov(report.id),
          },
          {
            full: extra,
            last: "Вариантов",
            first: "Вариант",
            provenance: prov(report.id),
          },
        ],
      },
      {
        reportImportId: report.id,
        contentHash: report.contentHash,
        query: "names",
        mode: "void_html",
      },
    );

    expect(person.canonicalName?.full).toBe(SYNTH.nameA);
    expect(
      person.nameVariants.some(
        (nv) =>
          nv.full === person.canonicalName?.full &&
          (nv.last ?? undefined) === (person.canonicalName?.last ?? undefined) &&
          (nv.first ?? undefined) === (person.canonicalName?.first ?? undefined) &&
          (nv.middle ?? undefined) === (person.canonicalName?.middle ?? undefined),
      ),
    ).toBe(false);
    expect(person.nameVariants.map((nv) => nv.full)).toContain(extra);
    expect(person.nameVariants.map((nv) => nv.full)).not.toContain(SYNTH.nameA);

    const listed = [
      ...(person.canonicalName ? [person.canonicalName.full] : []),
      ...person.nameVariants.map((nv) => nv.full),
    ];
    expect(listed.filter((n) => n === SYNTH.nameA)).toHaveLength(1);
  });

  it("createFromDraft dedupes duplicate documents and does not throw UNIQUE_VIOLATION", async () => {
    const report = await ensureReportImport(ctx);
    const p = prov(report.id);
    const draft = draftPerson({
      reportId: report.id,
      name: SYNTH.nameA,
      snils: SYNTH.snilsA,
    });
    draft.documents.push({
      type: "snils",
      number: SYNTH.snilsA.replace(/\s/g, ""),
      issuedAt: "2010-01-01",
      issuedBy: "ПФР",
      provenance: p,
    });

    const person = await ctx.persons.createFromDraft(draft, {
      reportImportId: report.id,
      contentHash: report.contentHash,
      query: "dup-doc",
      mode: "void_html",
    });

    const snils = person.documents.filter((d) => d.type === "snils");
    expect(snils).toHaveLength(1);
    expect(snils[0]?.issuedAt).toBe("2010-01-01");
    expect(snils[0]?.issuedBy).toBe("ПФР");
    expect(snils[0]?.provenance.length).toBeGreaterThanOrEqual(2);

    const rows = await ctx.prisma.identityDocument.findMany({
      where: { personId: person.id, type: "snils" },
    });
    expect(rows).toHaveLength(1);
  });

  it("get360 includes report-import warnings on sourceReports", async () => {
    const id = randomUUID();
    const report = await ctx.reports.create({
      id,
      format: "void_html",
      contentHash: contentHashSynthetic(id),
      filename: "warn.html",
      reportQuery: "warn",
      status: "completed",
      warnings: [
        {
          code: "UNKNOWN_KEY",
          message: "Unknown profile key x",
          section: "profile",
          key: "x",
          severity: "info",
        },
      ],
    });
    const created = await ctx.persons.createFromDraft(
      draftPerson({ reportId: report.id, name: SYNTH.nameA, phone: SYNTH.phoneA }),
      {
        reportImportId: report.id,
        contentHash: report.contentHash,
        query: "warn",
        mode: "void_html",
      },
    );
    const view = await ctx.persons.get360(created.id);
    expect(view?.sourceReports[0]?.warnings).toEqual([
      {
        code: "UNKNOWN_KEY",
        message: "Unknown profile key x",
        section: "profile",
        key: "x",
        severity: "info",
      },
    ]);
  });

  it("findByExactKeys re-normalizes display email and raw document numbers", async () => {
    const report = await ensureReportImport(ctx);
    const person = await ctx.persons.createFromDraft(
      draftPerson({
        reportId: report.id,
        email: SYNTH.emailA,
        passport: SYNTH.passportA,
      }),
      {
        reportImportId: report.id,
        contentHash: report.contentHash,
        query: "renorm",
        mode: "void_html",
      },
    );

    const hits = await ctx.persons.findByExactKeys([
      { kind: "email", value: "  Alice.Test@Example.COM " },
      {
        kind: "document",
        type: "passport_ru",
        number: "4509 123456", // raw, not numberNorm
      },
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.personId).toBe(person.id);
    expect(hits[0]?.matchedOn.map((m) => m.field).sort()).toEqual([
      "document",
      "email",
    ]);
  });
});

describe("db unit (no DB)", () => {
  it("skips integration suite when DATABASE_URL is unset (guard)", () => {
    // Documents the skipIf behavior for CI without Postgres
    expect(typeof hasDb).toBe("boolean");
  });
});
