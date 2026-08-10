/**
 * Application errors mapped to tRPC codes by the procedure layer.
 */
export type AppErrorCode =
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL";

export class AppError extends Error {
  readonly code: AppErrorCode;
  /** Machine-readable subcode (e.g. IMPORT_TOO_LARGE). */
  readonly appCode?: string;

  constructor(code: AppErrorCode, message: string, appCode?: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.appCode = appCode;
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
