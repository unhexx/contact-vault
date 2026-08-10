import { z } from "zod";
import { ProvenanceSchema } from "./provenance.js";

/**
 * Phone ContactPoint: e164 optional when normalization fails (KD15).
 * Prefer keep raw; exact-match only uses defined e164.
 * Whitespace-only e164/raw is rejected (trim + min(1)).
 */
const PhoneContactPointSchema = z
  .object({
    kind: z.literal("phone"),
    /** E.164 when normalization succeeds; omit/undefined when only raw kept */
    e164: z.string().trim().min(1).optional(),
    raw: z.string().trim().min(1).optional(),
    isPrimary: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    meta: z.record(z.unknown()).optional(),
    provenance: z.array(ProvenanceSchema).min(1),
  })
  .refine((p) => Boolean(p.e164 || p.raw), {
    message: "phone ContactPoint requires e164 and/or raw",
  });

const EmailContactPointSchema = z.object({
  kind: z.literal("email"),
  /** Display form (may preserve original casing from report) */
  value: z.string().min(1),
  isPrimary: z.boolean().optional(),
  provenance: z.array(ProvenanceSchema).min(1),
});

const SocialContactPointSchema = z.object({
  kind: z.literal("social"),
  network: z.string(),
  username: z.string().optional(),
  url: z.string().optional(),
  displayName: z.string().optional(),
  meta: z.record(z.string()).optional(),
  provenance: z.array(ProvenanceSchema).min(1),
});

const MessengerContactPointSchema = z.object({
  kind: z.literal("messenger"),
  network: z.string(),
  identifier: z.string(),
  provenance: z.array(ProvenanceSchema).min(1),
});

/**
 * Discriminated by `kind`. Phone uses a refined object so ZodEffects is
 * composed via union (not z.discriminatedUnion, which rejects ZodEffects).
 */
export const ContactPointSchema = z.union([
  PhoneContactPointSchema,
  EmailContactPointSchema,
  SocialContactPointSchema,
  MessengerContactPointSchema,
]);

export type ContactPoint = z.infer<typeof ContactPointSchema>;
