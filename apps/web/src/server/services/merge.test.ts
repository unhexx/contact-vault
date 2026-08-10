/**
 * Unit tests for merge collision helper shapes (no DB required for pure cases).
 */
import { describe, expect, it } from "vitest";

import { AppError } from "../errors.js";

describe("AppError for merge paths", () => {
  it("carries BAD_REQUEST for self-merge style messages", () => {
    const err = new AppError(
      "BAD_REQUEST",
      "sourcePersonId must not equal targetPersonId",
    );
    expect(err.code).toBe("BAD_REQUEST");
    expect(err.message).toContain("sourcePersonId");
  });
});
