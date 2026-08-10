import type { ListCursorPayload } from "./types.js";

/**
 * Opaque base64url(JSON) cursor for list pagination.
 * Order: updatedAt DESC, id DESC.
 */
export function encodeListCursor(payload: ListCursorPayload): string {
  const json = JSON.stringify(payload);
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodeListCursor(cursor: string): ListCursorPayload {
  let json: string;
  try {
    json = Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    throw new CursorError("Invalid list cursor encoding");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new CursorError("Invalid list cursor JSON");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as ListCursorPayload).updatedAt !== "string" ||
    typeof (parsed as ListCursorPayload).id !== "string"
  ) {
    throw new CursorError("Invalid list cursor shape");
  }
  return parsed as ListCursorPayload;
}

export class CursorError extends Error {
  readonly code = "BAD_REQUEST" as const;
  constructor(message: string) {
    super(message);
    this.name = "CursorError";
  }
}
