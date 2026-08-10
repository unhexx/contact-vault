/**
 * Stable DB-layer error codes for tRPC / composition-root mapping (PR5).
 */
export type DbErrorCode =
  | "BAD_REQUEST"
  | "SELF_SUGGESTION"
  | "NOT_FOUND"
  | "CONFLICT";

export class DbError extends Error {
  readonly code: DbErrorCode;

  constructor(code: DbErrorCode, message: string) {
    super(message);
    this.name = "DbError";
    this.code = code;
  }
}

export function isDbError(err: unknown): err is DbError {
  return err instanceof DbError;
}
