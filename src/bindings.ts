import { isUtf8 } from 'node:buffer';
import { createHash } from 'node:crypto';
import { insist, refusal } from './errors.ts';
import { bindingSourceSchema, canonical } from './schema.ts';
import type { UseSiteBinding } from './schema.ts';
import type { Host } from './host.ts';

const sourceFields = new Map([['/title', 'title'], ['/description', 'description'], ['/body', 'body']] as const);
const unavailable = {
  changed: ['stale_binding', 'Source revision changed; review the current source and supply a newly verified span'],
  missing: ['source_missing', 'Select an existing authorized source item'],
  inaccessible: ['source_inaccessible', 'Obtain an authorized source field and revision read'],
  span_mismatch: ['span_mismatch', 'Verify the UTF-8 byte boundaries and raw span SHA-256 in the selected field'],
} as const;

/** Capture the identity of one occurrence independently of its checksum or chosen sense. */
export function useSiteKey(source: UseSiteBinding['source']): string {
  return canonical([source.item_id, source.item_hash, source.field_pointer, source.start_byte, source.end_byte]);
}

/** Compare raw bytes, rejecting invalid Unicode, truncated ranges and split code points. */
function matchesSpan(text: unknown, source: UseSiteBinding['source']): boolean {
  if (typeof text !== 'string' || !text.isWellFormed()) return false;
  const bytes = Buffer.from(text, 'utf8');
  const span = bytes.subarray(source.start_byte, source.end_byte);
  return source.end_byte <= bytes.length && isUtf8(span) && createHash('sha256').update(span).digest('hex') === source.span_sha256;
}

/** Observe one authorized native field and its revision without returning any source text. */
export async function inspectBindingSource(host: Host, source: UseSiteBinding['source']): Promise<{
  status: 'current' | keyof typeof unavailable;
  observed_item_hash: string | null;
}> {
  const field = sourceFields.get(source.field_pointer)!;
  try {
    const got = await host.client.get(source.item_id, { fields: `${field},item_hash`, outputBudget: 'unbounded', outputLimit: 'unbounded' });
    insist('item' in got, 'incomplete_read', 'Source field was omitted by the host');
    const revision = bindingSourceSchema.shape.item_hash.safeParse(got.item_hash);
    insist(revision.success && got.item.id === source.item_id, 'incomplete_read', 'Source item and revision were not certified by the host');
    const observed_item_hash = revision.data;
    if (observed_item_hash !== source.item_hash) return { status: 'changed', observed_item_hash };
    const text = Object.hasOwn(got.item, field) ? got.item[field] : undefined;
    return { status: matchesSpan(text, source) ? 'current' : 'span_mismatch', observed_item_hash };
  } catch (error) {
    const missing = ['item_not_found', 'item_deleted'].includes(refusal(error).code);
    return { status: missing ? 'missing' : 'inaccessible', observed_item_hash: null };
  }
}

/** Admit only a current exact span and keep native source diagnostics out of the refusal. */
export async function requireBindingSource(host: Host, source: UseSiteBinding['source']): Promise<void> {
  const evidence = await inspectBindingSource(host, source);
  if (evidence.status === 'current') return;
  const [code, remedy] = unavailable[evidence.status];
  insist(false, code, 'Could not verify the exact source use site', remedy, { status: evidence.status });
}
