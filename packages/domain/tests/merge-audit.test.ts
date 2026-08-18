import { describe, expect, it } from "vitest";

import {
  MergeAuditPayloadSchema,
  mergeUndoBlockReason,
  parseMergeAuditPayload,
} from "../src/merge-audit.js";

const sourcePersonId = "11111111-1111-4111-8111-111111111111";
const targetPersonId = "22222222-2222-4222-8222-222222222222";
const childId = "33333333-3333-4333-8333-333333333333";

const scalars = {
  canonicalFull: "Цель Цельевна",
  canonicalLast: "Цель",
  canonicalFirst: "Цельевна",
  canonicalMiddle: null,
  dateOfBirth: "1980-02-02",
  placeOfBirth: null,
  gender: "female",
  extras: { keep: "target" },
};

const undoable = {
  sourcePersonId,
  targetPersonId,
  movedEntityIds: { addresses: [childId] },
  skippedPersonSourceReportIds: [],
  mergedIntoExisting: [],
  suggestionId: null,
  targetScalarsBefore: scalars,
  dismissedSuggestionIds: [],
};

describe("MergeAuditPayloadSchema", () => {
  it("accepts a no-collision payload and defaults missing id lists", () => {
    const parsed = MergeAuditPayloadSchema.parse(undoable);
    expect(parsed.movedEntityIds.addresses).toEqual([childId]);
    expect(parsed.movedEntityIds.contactPoints).toEqual([]);
    expect(parsed.movedEntityIds.bankRelations).toEqual([]);
    expect(parsed.movedEntityIds.financialFacts).toEqual([]);
    expect(parsed.targetScalarsBefore).toEqual(scalars);
  });

  it("rejects a payload without source/target ids", () => {
    expect(parseMergeAuditPayload({ movedEntityIds: {} })).toBeNull();
  });
});

describe("mergeUndoBlockReason", () => {
  it("allows undo when scalars exist and collision lists are empty", () => {
    const payload = MergeAuditPayloadSchema.parse(undoable);
    expect(mergeUndoBlockReason(payload)).toBeNull();
  });

  it("blocks pre-reversible payloads that lack targetScalarsBefore", () => {
    const payload = MergeAuditPayloadSchema.parse({
      sourcePersonId,
      targetPersonId,
      movedEntityIds: {},
    });
    expect(mergeUndoBlockReason(payload)).toBe("missing_target_scalars");
  });

  it("blocks colliding contact/document hard-deletes", () => {
    const payload = MergeAuditPayloadSchema.parse({
      ...undoable,
      mergedIntoExisting: [
        {
          entityType: "ContactPoint",
          entityId: childId,
          fromSourceEntityId: "44444444-4444-4444-8444-444444444444",
        },
      ],
    });
    expect(mergeUndoBlockReason(payload)).toBe("has_collisions");
  });

  it("blocks dropped PersonSourceReport rows", () => {
    const payload = MergeAuditPayloadSchema.parse({
      ...undoable,
      skippedPersonSourceReportIds: [childId],
    });
    expect(mergeUndoBlockReason(payload)).toBe("has_skipped_psr");
  });

  it("allows collision undo when targetProvenanceBefore was recorded", () => {
    const payload = MergeAuditPayloadSchema.parse({
      ...undoable,
      mergedIntoExisting: [
        {
          entityType: "ContactPoint",
          entityId: childId,
          fromSourceEntityId: "44444444-4444-4444-8444-444444444444",
        },
      ],
      skippedPersonSourceReportIds: [childId],
      targetProvenanceBefore: [
        { entityType: "ContactPoint", entityId: childId, provenance: [] },
      ],
    });
    expect(mergeUndoBlockReason(payload)).toBeNull();
  });
});
