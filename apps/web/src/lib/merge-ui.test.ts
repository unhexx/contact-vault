import { describe, expect, it } from "vitest";

import {
  asMatchedOn,
  entityCountEntries,
  formatMatchedOn,
  matchedFieldLabel,
  mergeDirectionLabel,
  mergeUndoDisabledReason,
  mergeUndoReasonLabel,
  totalEntityCount,
  type EntityCounts,
} from "./merge-ui.js";

describe("merge-ui helpers", () => {
  it("labels match fields", () => {
    expect(matchedFieldLabel("phone")).toBe("Phone");
    expect(matchedFieldLabel("email")).toBe("Email");
    expect(matchedFieldLabel("document")).toBe("Document");
    expect(matchedFieldLabel("name")).toBe("Name");
    expect(matchedFieldLabel("dob")).toBe("Date of birth");
    expect(matchedFieldLabel("other")).toBe("other");
  });

  it("formats matchedOn list", () => {
    expect(formatMatchedOn([])).toBe("—");
    expect(
      formatMatchedOn([
        { field: "phone", value: "+79990001122" },
        { field: "email", value: "a@example.com" },
      ]),
    ).toBe("Phone: +79990001122, Email: a@example.com");
  });

  it("guards non-array matchedOn", () => {
    expect(asMatchedOn(null)).toEqual([]);
    expect(asMatchedOn("x")).toEqual([]);
    expect(asMatchedOn([{ field: "phone", value: "+7" }])).toEqual([
      { field: "phone", value: "+7" },
    ]);
  });

  it("sums entity counts and exposes labeled entries", () => {
    const counts: EntityCounts = {
      contactPoints: 2,
      documents: 1,
      addresses: 0,
      relationships: 3,
      nameVariants: 1,
      personSourceReports: 2,
      riskScores: 2,
      incidents: 3,
      bankRelations: 1,
      vehicles: 2,
      employments: 1,
      financialFacts: 1,
    };
    expect(totalEntityCount(counts)).toBe(19);
    const entries = entityCountEntries(counts);
    expect(entries).toHaveLength(12);
    expect(entries.find((e) => e.key === "personSourceReports")?.label).toBe(
      "Source reports",
    );
    expect(entries.find((e) => e.key === "riskScores")?.label).toBe(
      "Risk scores",
    );
    expect(entries.find((e) => e.key === "incidents")?.label).toBe("Incidents");
    expect(entries.find((e) => e.key === "bankRelations")?.label).toBe("Banks");
    expect(entries.find((e) => e.key === "vehicles")?.label).toBe("Vehicles");
    expect(entries.find((e) => e.key === "employments")?.label).toBe(
      "Employments",
    );
    expect(entries.find((e) => e.key === "financialFacts")?.label).toBe(
      "Financial facts",
    );
  });

  it("documents fixed merge direction", () => {
    expect(mergeDirectionLabel()).toContain("→");
    expect(mergeDirectionLabel().toLowerCase()).toContain("survivor");
  });
});

const sourcePersonId = "11111111-1111-4111-8111-111111111111";
const targetPersonId = "22222222-2222-4222-8222-222222222222";
const childId = "33333333-3333-4333-8333-333333333333";
const mergeEventId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const laterMergeId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const unmergeId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const scalars = {
  canonicalFull: "Цель Цельевна",
  canonicalLast: "Цель",
  canonicalFirst: "Цельевна",
  canonicalMiddle: null,
  dateOfBirth: "1980-02-02",
  placeOfBirth: null,
  gender: "female",
  extras: null,
};

const undoablePayload = {
  sourcePersonId,
  targetPersonId,
  movedEntityIds: { addresses: [childId] },
  skippedPersonSourceReportIds: [],
  mergedIntoExisting: [],
  suggestionId: null,
  targetScalarsBefore: scalars,
  dismissedSuggestionIds: [],
};

describe("merge undo UI policy", () => {
  it("offers undo for a restorable no-collision merge", () => {
    expect(
      mergeUndoDisabledReason({
        id: mergeEventId,
        action: "merge",
        at: "2026-08-18T10:00:00.000Z",
        payload: undoablePayload,
      }),
    ).toBeNull();
  });

  it("offers undo for collision-path merges that recorded targetProvenanceBefore", () => {
    expect(
      mergeUndoDisabledReason({
        id: mergeEventId,
        action: "merge",
        at: "2026-08-18T10:00:00.000Z",
        payload: {
          ...undoablePayload,
          mergedIntoExisting: [
            {
              entityType: "ContactPoint",
              entityId: childId,
              fromSourceEntityId: "44444444-4444-4444-8444-444444444444",
            },
          ],
          targetProvenanceBefore: [
            { entityType: "ContactPoint", entityId: childId, provenance: [] },
          ],
        },
      }),
    ).toBeNull();
  });

  it("disables undo when mergeUndoBlockReason is set", () => {
    expect(
      mergeUndoDisabledReason({
        id: mergeEventId,
        action: "merge",
        at: "2026-08-18T10:00:00.000Z",
        payload: {
          sourcePersonId,
          targetPersonId,
          movedEntityIds: {},
        },
      }),
    ).toBe("missing_target_scalars");

    expect(
      mergeUndoDisabledReason({
        id: mergeEventId,
        action: "merge",
        at: "2026-08-18T10:00:00.000Z",
        payload: {
          ...undoablePayload,
          mergedIntoExisting: [
            {
              entityType: "ContactPoint",
              entityId: childId,
              fromSourceEntityId: "44444444-4444-4444-8444-444444444444",
            },
          ],
        },
      }),
    ).toBe("has_collisions");

    expect(
      mergeUndoDisabledReason({
        id: mergeEventId,
        action: "merge",
        at: "2026-08-18T10:00:00.000Z",
        payload: {
          ...undoablePayload,
          skippedPersonSourceReportIds: [childId],
        },
      }),
    ).toBe("has_skipped_psr");
  });

  it("disables undo when a sibling unmerge already references the event", () => {
    const event = {
      id: mergeEventId,
      action: "merge",
      at: "2026-08-18T10:00:00.000Z",
      payload: undoablePayload,
    };
    expect(
      mergeUndoDisabledReason(event, [
        event,
        {
          id: unmergeId,
          action: "unmerge",
          at: "2026-08-18T11:00:00.000Z",
          payload: {
            mergeAuditId: mergeEventId,
            sourcePersonId,
            targetPersonId,
          },
        },
      ]),
    ).toBe("already_undone");
  });

  it("disables undo when a later merge superseded this event", () => {
    const event = {
      id: mergeEventId,
      action: "merge",
      at: "2026-08-18T10:00:00.000Z",
      payload: undoablePayload,
    };
    expect(
      mergeUndoDisabledReason(event, [
        {
          id: laterMergeId,
          action: "merge",
          at: "2026-08-18T12:00:00.000Z",
          payload: undoablePayload,
        },
        event,
      ]),
    ).toBe("superseded");
  });

  it("labels operator-facing disable reasons", () => {
    expect(mergeUndoReasonLabel("missing_target_scalars")).toMatch(/legacy/i);
    expect(mergeUndoReasonLabel("has_collisions")).toMatch(/collision/i);
    expect(mergeUndoReasonLabel("already_undone")).toMatch(/already undone/i);
  });
});
