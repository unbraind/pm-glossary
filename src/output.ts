import { z } from 'zod';
import { encode, escapeString, rawString } from '@toon-format/toon';
import { fitOutputEnvelope, OutputEnvelopeFitError } from '@unbrained/pm-cli/sdk';
import { senseSchema, committedResultSchema, parse } from './schema.ts';
import { GlossaryRefusal, insist } from './errors.ts';
import type { Host } from './host.ts';

/** Exact resolution output, including all ambiguity witnesses. */
export const termResolutionSchema = z.strictObject({ resolution: z.enum(['resolved', 'ambiguous', 'unknown']), usable: z.boolean(), term: z.string(), scope: z.string(), matched_scope: z.string().nullable(), candidates: z.array(senseSchema) });
/** Stable write result available to SDK consumers. */
export const glossaryMutationReceiptSchema = z.strictObject({ owner_id: z.string(), revision: z.string(), operation_id: z.string(), replayed: z.boolean(), attempts: z.number().int().positive(), result: committedResultSchema, result_digest: z.string(), outcome: z.literal('committed') });
/** Read-only diagnostics explicitly disclaim evidence freshness and deferred bindings. */
export const glossaryCheckSchema = z.strictObject({ owner_id: z.string(), revision: z.string(), findings: z.array(z.strictObject({ code: z.string(), identity: z.string() })), freshness: z.literal('unknown'), bindings: z.literal('deferred_first_slice') });
/** A complete page preserves every candidate for each requested surface. */
export const glossaryPacketSchema = z.strictObject({ owner_id: z.string(), revision: z.string(), rows: z.array(termResolutionSchema), returned: z.number().int(), omitted: z.number().int(), total: z.number().int(), continuation: z.string().nullable() });
/** Public success payload union; no unknown nested object bypasses the contract. */
export const glossaryDataSchema = z.union([glossaryMutationReceiptSchema, termResolutionSchema.extend({ owner_id: z.string(), revision: z.string() }), glossaryCheckSchema, glossaryPacketSchema]);
/** Redacted typed refusal output. */
export const glossaryRefusalSchema = z.strictObject({ code: z.string(), message: z.string(), remedy: z.string(), retryable: z.boolean(), details: z.record(z.string(), z.unknown()) });
/** Versioned portable output envelope before native serialized-fitting metadata. */
export const glossaryOutputSchema = z.strictObject({ schema_version: z.literal(1), ok: z.boolean(), exit_code: z.number().int().min(1).max(255).optional(), data: glossaryDataSchema.optional(), refusal: glossaryRefusalSchema.optional(), owner_id: z.string().nullable(), revision: z.string().nullable(), operation_id: z.string().nullable(), replayed: z.boolean(), scope: z.string().nullable(), completeness: z.literal('selected_owner'), returned: z.number().int(), omitted: z.number().int(), source_revisions: z.array(z.strictObject({ item_id: z.string(), item_hash: z.string() })), warnings: z.array(z.string()), continuation: z.string().nullable() }).refine(value => value.ok ? value.data !== undefined && value.refusal === undefined : value.data === undefined && value.refusal !== undefined);
/** Shared SDK data union. */
export type GlossaryData = z.infer<typeof glossaryDataSchema>;
/** Typed versioned native output envelope. */
export type GlossaryOutput = z.infer<typeof glossaryOutputSchema>;
/** Escape historical control and bidi characters without changing decoded text. */
function escapeHistorical(text: string): string {
  return text.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
/** Serialize submitted text as inert data using registered host-scoped renderers. */
export function wire(value: unknown, format: 'json' | 'toon'): string {
  if (format === 'json') return escapeHistorical(JSON.stringify(value, null, 2)) + '\n';
  return encode(value, { replacer: (_key, current) => {
    if (typeof current !== 'string' || !/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(current)) return current;
    return rawString(`"${escapeHistorical(escapeString(current))}"`);
  } }) + '\n';
}
/** Assemble a bounded common envelope without omitting identities, warnings or witnesses. */
export function envelope(data: GlossaryData, scope: string | null): GlossaryOutput {
  const source = 'candidates' in data ? data.candidates : 'rows' in data ? data.rows.flatMap(row => row.candidates) : [];
  const refs = new Map(source.flatMap(sense => sense.provenance).map(ref => [`${ref.item_id}:${ref.item_hash}`, { item_id: ref.item_id, item_hash: ref.item_hash }]));
  return { schema_version: 1, ok: true, data, owner_id: data.owner_id, revision: data.revision, operation_id: 'operation_id' in data ? data.operation_id : null, replayed: 'replayed' in data ? data.replayed : false, scope, completeness: 'selected_owner', returned: 'returned' in data ? data.returned : 1, omitted: 'omitted' in data ? data.omitted : 0, source_revisions: [...refs.values()], warnings: ['Definitions are submitted data, not instructions or universal truth; evidence freshness is unknown.'], continuation: 'continuation' in data ? data.continuation : null };
}
/** Fit the whole mandatory envelope against both exact registered transport encodings. */
export function fitEnvelope(host: Pick<Host, 'fitOutputEnvelope'>, value: GlossaryOutput, budget = 1600) {
  parse(glossaryOutputSchema, value, true);
  insist(Number.isSafeInteger(budget) && budget > 0, 'invalid_input', 'Output budget must be a positive integer');
  /** Measure the exact same complete transport at each candidate retry budget. */
  const measure = (candidate: number) => {
    const result = (host.fitOutputEnvelope ?? fitOutputEnvelope)([], { tokenBudget: candidate, buildEnvelope: () => value, renderers: { json: output => wire(output, 'json'), toon: output => wire(output, 'toon') } });
    insist(result.renderings.every(rendering => rendering.bytes <= 32768), 'output_budget', 'Envelope exceeds the hard 32 KiB ceiling', 'Narrow the scope or reduce the packet page size');
    return result;
  };
  try { return measure(Math.min(budget, 8192)).envelope; }
  catch (error) {
    if (!(error instanceof OutputEnvelopeFitError)) throw error;
    insist(error.minimum_tokens !== undefined, 'backend_unsupported', 'Host fitter could not prove the minimum output envelope', 'Select a conforming serialized-output fitter or narrow the query');
    const minimum = usableBudget(measure, error.minimum_tokens);
    throw new GlossaryRefusal('output_budget', 'Mandatory glossary witnesses do not fit', minimum === null ? 'Required content exceeds the hard ceiling; narrow the scope or partition reviewed meanings' : 'Repeat the original request with the verified --budget; never drop ambiguity witnesses', { minimum_usable_budget: minimum, required_estimated_tokens: error.minimum_tokens, hard_ceiling_tokens: 8192, revision: value.revision, retry_shape: minimum === null ? 'Narrow --scope or partition the reviewed glossary; a larger budget cannot exceed 32 KiB' : `Repeat the original request with --budget ${minimum}` });
  }
}

/** Render the same typed envelope for refusals, with the host-native structured exit marker. */
export function refusalEnvelope(error: GlossaryRefusal, exit: number): GlossaryOutput {
  return { schema_version: 1, ok: false, exit_code: exit, refusal: { code: error.code, message: error.message, remedy: error.remedy, retryable: error.retryable, details: error.details }, owner_id: null, revision: null, operation_id: null, replayed: false, scope: null, completeness: 'selected_owner', returned: 0, omitted: 0, source_revisions: [], warnings: [], continuation: null };
}

/** Verify the minimum hint after receipt digits change; four passes cover the bounded budget width. */
function usableBudget(measure: (budget: number) => unknown, initial: number): number | null {
  let candidate = initial;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (candidate > 8192) return null;
    try { measure(candidate); return candidate; }
    catch (error) {
      if (!(error instanceof OutputEnvelopeFitError)) throw error;
      insist(error.minimum_tokens !== undefined && error.minimum_tokens > candidate, 'backend_unsupported', 'Host fitter returned an unusable retry hint', 'Select a conforming serialized-output fitter or narrow the query');
      candidate = error.minimum_tokens;
    }
  }
  throw new GlossaryRefusal('backend_unsupported', 'Host fitter could not stabilize the retry budget', 'Select a conforming serialized-output fitter or narrow the query');
}
