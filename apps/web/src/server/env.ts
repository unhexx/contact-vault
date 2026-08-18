/**
 * Server env loading for apps/web (composition root).
 * DATABASE_URL required; STORE_RAW_REPORTS defaults false (KD14).
 * REPORT_BLOB_KEY is env-only; never log the hex or parsed bytes.
 */
import { parseReportBlobKey } from "@contact-vault/domain";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  STORE_RAW_REPORTS: z
    .union([z.string(), z.undefined()])
    .transform((v) => v === "true" || v === "1"),
  REPORT_BLOB_KEY: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().optional(),
});

export type Env = {
  DATABASE_URL: string;
  NODE_ENV: "development" | "test" | "production";
  STORE_RAW_REPORTS: boolean;
  /** 32-byte AES-256 key, or null when unset (plaintext blobs). */
  reportBlobKey: Buffer | null;
  NEXT_PUBLIC_APP_URL?: string;
};

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    throw new Error(`Invalid environment: ${msg}`);
  }
  cached = {
    DATABASE_URL: parsed.data.DATABASE_URL,
    NODE_ENV: parsed.data.NODE_ENV,
    STORE_RAW_REPORTS: Boolean(parsed.data.STORE_RAW_REPORTS),
    reportBlobKey: parseReportBlobKey(parsed.data.REPORT_BLOB_KEY),
    NEXT_PUBLIC_APP_URL: parsed.data.NEXT_PUBLIC_APP_URL,
  };
  return cached;
}

/** Test helper — clear memoized env. */
export function resetEnvCache(): void {
  cached = null;
}
