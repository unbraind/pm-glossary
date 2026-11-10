import { z } from 'zod';

/** Retain historical positive integer strings while normalizing the package budget policy. */
const settingsSchema = z.strictObject({ output_budget: z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]).pipe(z.number().int().positive().safe()).optional() });

/** Validate the policy shape, deferring an overridden budget value to the explicit command control. */
export function validateSettings(value: unknown, ignoreBudget = false): { output_budget?: number } {
  return settingsSchema.parse(ignoreBudget && value !== null && typeof value === 'object' && !Array.isArray(value) ? { ...value, output_budget: undefined } : value);
}
