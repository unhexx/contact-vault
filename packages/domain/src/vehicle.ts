import { z } from "zod";
import { ProvenanceSchema } from "./provenance.js";

export const VehicleOwnershipPeriodSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  ownerName: z.string().optional(),
  operationCode: z.string().optional(),
});

export type VehicleOwnershipPeriod = z.infer<typeof VehicleOwnershipPeriodSchema>;

/**
 * Vehicle / registration from report sections (v0.3).
 * Requires plate, vin, brand, or model. Photos stay out (MVP-Scope).
 * Provenance mandatory (KD1). id optional on draft; present when persisted.
 * Not a merge key.
 */
export const VehicleSchema = z
  .object({
    id: z.string().uuid().optional(),
    brand: z.string().trim().min(1).optional(),
    model: z.string().trim().min(1).optional(),
    year: z.number().int().min(1000).max(2100).optional(),
    plate: z.string().trim().min(1).optional(),
    vin: z.string().trim().min(1).optional(),
    powerHp: z.number().positive().optional(),
    engineVolumeCc: z.number().positive().optional(),
    category: z.string().trim().min(1).optional(),
    ownershipPeriods: z.array(VehicleOwnershipPeriodSchema).optional(),
    extras: z.record(z.unknown()).optional(),
    provenance: z.array(ProvenanceSchema).min(1),
  })
  .refine((v) => Boolean(v.plate || v.vin || v.brand || v.model), {
    message: "Vehicle requires plate, vin, brand, or model",
  });

export type Vehicle = z.infer<typeof VehicleSchema>;
