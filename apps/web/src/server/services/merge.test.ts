/**
 * Unit tests for merge service guards + survivor scalar policy (no DB).
 */
import { describe, expect, it } from "vitest";

import { AppError } from "../errors.js";
import {
  collisionsFromChildren,
  mergePersons,
  pickSurvivorScalars,
  undoMerge,
} from "./merge.js";

const blankScalars = {
  canonicalFull: null,
  canonicalLast: null,
  canonicalFirst: null,
  canonicalMiddle: null,
  dateOfBirth: null,
  placeOfBirth: null,
  gender: null,
  extras: null,
} as const;

describe("mergePersons guards", () => {
  it("rejects source === target without touching DB", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    // prisma is never used when ids are equal
    await expect(
      mergePersons({} as never, {
        sourcePersonId: id,
        targetPersonId: id,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("sourcePersonId"),
    });
  });

  it("AppError carries BAD_REQUEST for self-merge style messages", () => {
    const err = new AppError(
      "BAD_REQUEST",
      "sourcePersonId must not equal targetPersonId",
    );
    expect(err.code).toBe("BAD_REQUEST");
    expect(err.message).toContain("sourcePersonId");
  });
});

describe("pickSurvivorScalars", () => {
  it("fills blank target identity scalars from source", () => {
    const merged = pickSurvivorScalars(blankScalars, {
      canonicalFull: "Синтетик Источник",
      canonicalLast: "Синтетик",
      canonicalFirst: "Источник",
      canonicalMiddle: "Тестович",
      dateOfBirth: "1990-01-15",
      placeOfBirth: "г. Тестовск",
      gender: "male",
      extras: { note: "from-source" },
    });
    expect(merged).toEqual({
      canonicalFull: "Синтетик Источник",
      canonicalLast: "Синтетик",
      canonicalFirst: "Источник",
      canonicalMiddle: "Тестович",
      dateOfBirth: "1990-01-15",
      placeOfBirth: "г. Тестовск",
      gender: "male",
      extras: { note: "from-source" },
    });
  });

  it("keeps target scalars when both sides are set (survivor-wins)", () => {
    const merged = pickSurvivorScalars(
      {
        canonicalFull: "Цель Цельевна",
        canonicalLast: "Цель",
        canonicalFirst: "Цельевна",
        canonicalMiddle: null,
        dateOfBirth: "1980-02-02",
        placeOfBirth: "г. Цельск",
        gender: "female",
        extras: { keep: "target", shared: "target" },
      },
      {
        canonicalFull: "Источник Источникович",
        canonicalLast: "Источник",
        canonicalFirst: "Источникович",
        canonicalMiddle: "Отчество",
        dateOfBirth: "1999-12-31",
        placeOfBirth: "г. Источникск",
        gender: "male",
        extras: { extra: "source", shared: "source" },
      },
    );
    expect(merged.canonicalFull).toBe("Цель Цельевна");
    expect(merged.canonicalLast).toBe("Цель");
    expect(merged.canonicalFirst).toBe("Цельевна");
    expect(merged.canonicalMiddle).toBe("Отчество");
    expect(merged.dateOfBirth).toBe("1980-02-02");
    expect(merged.placeOfBirth).toBe("г. Цельск");
    expect(merged.gender).toBe("female");
    expect(merged.extras).toEqual({ extra: "source", shared: "target", keep: "target" });
  });

  it("treats whitespace-only target scalars as blank", () => {
    const merged = pickSurvivorScalars(
      { ...blankScalars, canonicalFull: "   ", dateOfBirth: " " },
      { ...blankScalars, canonicalFull: "Заполненное Имя", dateOfBirth: "2001-03-03" },
    );
    expect(merged.canonicalFull).toBe("Заполненное Имя");
    expect(merged.dateOfBirth).toBe("2001-03-03");
  });

  it("treats empty extras object as blank", () => {
    const merged = pickSurvivorScalars(
      { ...blankScalars, extras: {} },
      { ...blankScalars, extras: { profile: { inn: "1" } } },
    );
    expect(merged.extras).toEqual({ profile: { inn: "1" } });
  });
});

describe("undoMerge guards", () => {
  const auditId = "00000000-0000-4000-8000-000000000099";

  it("rejects a missing audit event without starting a transaction", async () => {
    const prisma = {
      auditLog: {
        findUnique: async () => null,
      },
      $transaction: async () => {
        throw new Error("should not start tx");
      },
    };
    await expect(undoMerge(prisma as never, auditId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("rejects a non-merge audit event", async () => {
    const prisma = {
      auditLog: {
        findUnique: async () => ({
          id: auditId,
          action: "dismiss",
          payload: {},
        }),
      },
      $transaction: async () => {
        throw new Error("should not start tx");
      },
    };
    await expect(undoMerge(prisma as never, auditId)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      appCode: "MERGE_UNDO_NOT_MERGE",
    });
  });

  it("rejects a merge payload that has hard-deleted collisions", async () => {
    const prisma = {
      auditLog: {
        findUnique: async () => ({
          id: auditId,
          action: "merge",
          payload: {
            sourcePersonId: "11111111-1111-4111-8111-111111111111",
            targetPersonId: "22222222-2222-4222-8222-222222222222",
            movedEntityIds: {},
            skippedPersonSourceReportIds: [],
            mergedIntoExisting: [
              {
                entityType: "ContactPoint",
                entityId: "33333333-3333-4333-8333-333333333333",
                fromSourceEntityId: "44444444-4444-4444-8444-444444444444",
              },
            ],
            targetScalarsBefore: {
              canonicalFull: null,
              canonicalLast: null,
              canonicalFirst: null,
              canonicalMiddle: null,
              dateOfBirth: null,
              placeOfBirth: null,
              gender: null,
              extras: null,
            },
          },
        }),
      },
      $transaction: async () => {
        throw new Error("should not start tx");
      },
    };
    await expect(undoMerge(prisma as never, auditId)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      appCode: "MERGE_UNDO_COLLISION",
    });
  });
});

describe("collisionsFromChildren", () => {
  it("detects phone / email / document norm-key overlaps", () => {
    const collisions = collisionsFromChildren(
      {
        contactPoints: [
          { id: "1", kind: "phone", e164: "+79990001122", emailNorm: null, provenance: [] },
          { id: "2", kind: "email", e164: null, emailNorm: "a@example.com", provenance: [] },
        ],
        documents: [
          { id: "3", type: "snils", numberNorm: "11223344595", provenance: [] },
        ],
      },
      {
        contactPoints: [
          { id: "4", kind: "phone", e164: "+79990001122", emailNorm: null, provenance: [] },
          { id: "5", kind: "email", e164: null, emailNorm: "a@example.com", provenance: [] },
        ],
        documents: [
          { id: "6", type: "snils", numberNorm: "11223344595", provenance: [] },
        ],
      },
    );
    expect(collisions.map((c) => c.field).sort()).toEqual([
      "document",
      "email",
      "phone",
    ]);
  });

  it("ignores non-overlapping keys", () => {
    const collisions = collisionsFromChildren(
      {
        contactPoints: [
          { id: "1", kind: "phone", e164: "+79990001122", emailNorm: null, provenance: [] },
        ],
        documents: [],
      },
      {
        contactPoints: [
          { id: "2", kind: "phone", e164: "+79990003344", emailNorm: null, provenance: [] },
        ],
        documents: [],
      },
    );
    expect(collisions).toEqual([]);
  });
});
