import { describe, expect, it } from "vitest";

import {
  TimelineEventSchema,
  mergePersonTimeline,
} from "../src/timeline.js";

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);

describe("TimelineEventSchema", () => {
  it("accepts import + audit fields", () => {
    const ok = TimelineEventSchema.safeParse({
      id: "psr:1",
      at: "2026-08-18T10:00:00.000Z",
      action: "import",
      actor: "local",
      contentHash: hashA,
      format: "inline-dossier",
      source: "source_report",
    });
    expect(ok.success).toBe(true);
  });

  it("keeps unknown format as unknown", () => {
    const ok = TimelineEventSchema.safeParse({
      id: "evt-1",
      at: "2026-08-18T10:00:00.000Z",
      action: "import",
      actor: "local",
      format: "unknown",
      source: "source_report",
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.format).toBe("unknown");
  });
});

describe("mergePersonTimeline", () => {
  it("orders newest first and does not collapse duplicate hashes", () => {
    const events = mergePersonTimeline(
      [
        {
          id: "psr-old",
          importedAt: "2026-08-01T10:00:00.000Z",
          contentHash: hashA,
          format: "void-html",
          reportId: "11111111-1111-4111-8111-111111111111",
        },
        {
          id: "psr-dup",
          importedAt: "2026-08-02T10:00:00.000Z",
          contentHash: hashA,
          format: "void-html",
          reportId: "22222222-2222-4222-8222-222222222222",
        },
      ],
      [
        {
          id: "audit-merge",
          action: "merge",
          actor: "local",
          createdAt: "2026-08-03T10:00:00.000Z",
          payload: { sourcePersonId: "s", targetPersonId: "t" },
        },
        {
          id: "audit-dismiss",
          action: "dismiss",
          actor: "local",
          createdAt: "2026-08-02T12:00:00.000Z",
          payload: { suggestionId: "sug" },
        },
        {
          id: "audit-unmerge",
          action: "unmerge",
          actor: "local",
          createdAt: "2026-08-03T11:00:00.000Z",
          payload: { mergeAuditId: "audit-merge" },
        },
      ],
    );

    expect(events.map((e) => e.action)).toEqual([
      "unmerge",
      "merge",
      "dismiss",
      "import",
      "import",
    ]);
    expect(events.filter((e) => e.contentHash === hashA)).toHaveLength(2);
    expect(events[0]?.source).toBe("audit");
    expect(events[0]?.action).toBe("unmerge");
    expect(events[3]?.id).toBe("psr:psr-dup");
    expect(events[4]?.format).toBe("void-html");
  });

  it("surfaces contentHash and unknown format from audit payload", () => {
    const events = mergePersonTimeline(
      [
        {
          id: "psr-b",
          importedAt: "2026-08-01T09:00:00.000Z",
          contentHash: hashB,
          format: "unknown",
        },
      ],
      [
        {
          id: "audit-import",
          action: "import",
          actor: "local",
          createdAt: "2026-08-01T09:00:01.000Z",
          payload: { contentHash: hashB, format: "not-a-real-format" },
        },
      ],
    );

    expect(events).toHaveLength(2);
    expect(events[0]?.action).toBe("import");
    expect(events[0]?.source).toBe("audit");
    expect(events[0]?.contentHash).toBe(hashB);
    expect(events[0]?.format).toBe("unknown");
    expect(events[1]?.format).toBe("unknown");
    expect(events[1]?.contentHash).toBe(hashB);
  });

  it("does not invent format or hash when audit payload lacks them", () => {
    const events = mergePersonTimeline([], [
      {
        id: "audit-soft",
        action: "soft_delete",
        actor: "local",
        createdAt: "2026-08-04T00:00:00.000Z",
        payload: { personId: "p" },
      },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]?.contentHash).toBeUndefined();
    expect(events[0]?.format).toBeUndefined();
    expect(events[0]?.action).toBe("soft_delete");
  });
});
