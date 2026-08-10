/**
 * Unit tests for merge service guards (no DB).
 */
import { describe, expect, it } from "vitest";

import { AppError } from "../errors.js";
import { mergePersons } from "./merge.js";

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
