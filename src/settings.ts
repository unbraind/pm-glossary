import { z } from 'zod';

/** Retain historical positive integer strings while normalizing the package budget policy. */
const settingsSchema = z.strictObject({ output_budget: z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]).pipe(z.number().int().positive().safe()).optional() });

/** Validate only glossary-owned policy; the SDK owns document reading and typed refusals. */
export function validateSettings(value: unknown): { output_budget?: number } {
  return settingsSchema.parse(value);
}
