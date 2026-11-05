import { createHash } from 'node:crypto';
import { z } from 'zod';
import { scanMutationSecrets } from '@unbrained/pm-cli/sdk';
import { insist, GlossaryRefusal } from './errors.ts';

/** Exact, nonempty Unicode data; matching never folds case, whitespace or normalization. */
const text = z.string().min(1).max(8000).refine(value => value.trim().length > 0 && value.isWellFormed());
/** Stable identifiers cannot collide with prototype properties. */
const key = z.string().trim().min(1).max(96).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/).refine(value => !['constructor', '__proto__', 'prototype'].includes(value));
/** Canonical native item revision. */
const hash = z.string().trim().toLowerCase().regex(/^[a-f0-9]{64}$/);
/** Explicit scope node; roots have a null parent. */
export const scopeSchema = z.strictObject({ scope_key: key, parent: key.nullable() });
/** Immutable evidence reference; freshness is never inferred from its existence. */
export const provenanceSchema = z.strictObject({ item_id: key, item_hash: hash, field_pointer: text, citation_id: key.optional() });
/** One reviewed explicit meaning at one exact language and scope. */
export const senseSchema = z.strictObject({ sense_id: key, term: text, scope_key: key, language: key, definition: text.refine(value => [...value].length <= 2000), entity_ref: text.optional(), contrast_sense_ids: z.array(key).max(128).default([]), provenance: z.array(provenanceSchema).max(8).default([]) });
/** Aliases address senses directly; no chain traversal exists. */
export const aliasSchema = z.strictObject({ alias_id: key, term: text, scope_key: key, language: key, sense_id: key });
/** Stable committed semantic result, retained independently from later truth. */
export const committedResultSchema = z.strictObject({ kind: z.enum(['create', 'define', 'alias']), sequence: z.number().int().positive(), identity: key });
/** Replay records never evict successful operation keys. */
export const replaySchema = z.strictObject({ operation_id: key, request_digest: hash, result: committedResultSchema, result_digest: hash });
/** Complete first-slice persisted state; bindings are reserved for a later version. */
export const glossaryStateSchema = z.strictObject({ version: z.literal(1), domain_key: key, language_policy: z.literal('exact'), scopes: z.array(scopeSchema).min(1).max(64), senses: z.array(senseSchema).max(128), aliases: z.array(aliasSchema).max(256), bindings: z.array(z.never()).max(0), operations: z.array(replaySchema).min(1).max(256) });
/** Explicit owner and stable operation identity for native create-if-absent. */
export const createGlossaryInputSchema = z.strictObject({ id: key, op: key, title: text, domain_key: key, scopes: z.array(scopeSchema).min(1).max(64), related: z.array(key).max(20).default([]) });
/** An explicit edit uses the native revision that the caller reviewed. */
export const defineSenseInputSchema = z.strictObject({ id: key, op: key, revision: hash, sense: senseSchema });
/** Direct alias addition or revision-checked replacement. */
export const addAliasInputSchema = z.strictObject({ id: key, op: key, revision: hash, alias: aliasSchema });
/** Exact resolution query without implicit language fallback. */
export const resolveTermInputSchema = z.strictObject({ id: key, term: text, scope_key: key, language: key.default('en') });
/** Diagnostic query is owner-scoped and never enumerates the workspace. */
export const checkGlossaryInputSchema = z.strictObject({ id: key, scope_key: key.optional() });
/** Revision-bound page request retaining all witnesses for each emitted term. */
export const glossaryPacketInputSchema = z.strictObject({ id: key, scope_key: key, language: key.default('en'), limit: z.number().int().min(1).max(100).default(20), cursor: z.string().max(2048).optional() });
/** Supported persisted glossary representation. */
export type GlossaryState = z.infer<typeof glossaryStateSchema>;
/** Explicit sense input and read-back contract. */
export type Sense = z.infer<typeof senseSchema>;
/** Explicit native glossary creation request. */
export type CreateGlossaryInput = z.input<typeof createGlossaryInputSchema>;
/** Native sense mutation request. */
export type DefineSenseInput = z.input<typeof defineSenseInputSchema>;
/** Native alias mutation request. */
export type AddAliasInput = z.input<typeof addAliasInputSchema>;
/** Explicit scoped exact resolution query. */
export type ResolveTermInput = z.input<typeof resolveTermInputSchema>;
/** Explicit scoped glossary diagnostic request. */
export type CheckGlossaryInput = z.input<typeof checkGlossaryInputSchema>;
/** Scoped packet page request. */
export type GlossaryPacketInput = z.input<typeof glossaryPacketInputSchema>;

/** Canonical JSON sorts object keys and preserves exact array/text values. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(name => `${JSON.stringify(name)}:${canonical((value as Record<string, unknown>)[name])}`).join(',')}}`;
  return JSON.stringify(value);
}
/** Content fingerprint used for operation identity and immutable result verification. */
export function digest(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
/** Reject private and active content before it can enter immutable native history. */
export function guardSubmitted(value: unknown, seen = new Set<object>(), depth = 0): void {
  insist(depth <= 16, 'invalid_input', 'Input nesting exceeds sixteen levels');
  if (typeof value === 'string') {
    insist(value.length <= 8000 && value.isWellFormed(), 'invalid_input', 'Text is oversized or malformed Unicode');
    insist(!/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value), 'invalid_input', 'Control sequences are not shareable text');
    insist(!/(?:[\\/](?:home|Users)[\\/]|[\\/]root(?:[\\/]|\b)|[A-Z]:\\Users\\|[\w.+-]+@[\w.-]+\.[a-z]{2,})/iu.test(value), 'invalid_input', 'Private paths or email addresses are not shareable text');
    insist(!/^\s*[=+@]|\$\(|\$\{|<\/?(?:script|system|assistant)\b/iu.test(value), 'invalid_input', 'Executable expressions are not shareable text');
    insist(scanMutationSecrets(value).length === 0, 'invalid_input', 'SDK privacy guard detected credential-shaped content');
  } else if (value !== null && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    insist(Array.isArray(value) || prototype === Object.prototype || prototype === null, 'invalid_input', 'Only plain JSON objects are supported');
    for (const name of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, name)!;
      insist(typeof name === 'string' && 'value' in descriptor && (descriptor.enumerable || (Array.isArray(value) && name === 'length')), 'invalid_input', 'Only enumerable JSON data properties are supported');
    }
    insist(!seen.has(value), 'invalid_input', 'Cyclic input is unsupported'); seen.add(value);
    for (const [name, child] of Object.entries(value)) {
      insist(!['__proto__', 'prototype', 'constructor'].includes(name), 'invalid_input', 'Prototype keys are forbidden');
      guardSubmitted(child, seen, depth + 1);
    }
    seen.delete(value);
  }
}
/** Parse strict contracts without reflecting unsafe values into errors. */
export function parse<T>(schema: z.ZodType<T>, value: unknown, stored = false): T {
  if (!stored) guardSubmitted(value);
  const result = schema.safeParse(value);
  if (!result.success) throw new GlossaryRefusal(stored ? 'invalid_record' : 'invalid_input', 'Strict glossary contract failed', 'Inspect the named fields and use the documented schema', { fields: result.error.issues.slice(0, 6).map(issue => issue.path.join('.')) });
  return result.data;
}
