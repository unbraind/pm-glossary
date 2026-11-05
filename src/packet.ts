import { z } from 'zod';
import { digest } from './schema.ts';
import type { GlossaryPacketInput } from './schema.ts';
import type { Snapshot } from './host.ts';
import { insist, GlossaryRefusal } from './errors.ts';
import { resolveTermInState } from './kernel.ts';

/** Opaque revision/query/projection-bound cursor; decoded only by this package. */
const cursorSchema = z.strictObject({ revision: z.string().regex(/^[a-f0-9]{64}$/), query: z.string().regex(/^[a-f0-9]{64}$/), offset: z.number().int().positive() });
/** Derive one page through the resolver used for every other exact query. */
export function packetPage(owner: Snapshot, input: GlossaryPacketInput & { language: string; limit: number }) {
  const query = digest({ scope: input.scope_key, language: input.language, limit: input.limit, projection: 'full-witness-v1' }); let offset = 0;
  if (input.cursor !== undefined) {
    let decoded: unknown;
    try { decoded = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')) as unknown; }
    catch { throw new GlossaryRefusal('stale_cursor', 'Cursor is malformed', 'Restart the scoped packet query without a cursor'); }
    const valid = cursorSchema.safeParse(decoded);
    insist(valid.success, 'stale_cursor', 'Cursor does not match the strict continuation schema', 'Restart the scoped packet query without a cursor');
    const cursor = valid.data;
    insist(cursor.revision === owner.revision && cursor.query === query, 'stale_cursor', 'Cursor belongs to a different revision or query', 'Restart the scoped packet query without a cursor'); offset = cursor.offset;
  }
  const terms = [...new Set([...owner.state.senses, ...owner.state.aliases].filter(row => row.language === input.language).map(row => row.term))].sort();
  // Resolve a sentinel even for an empty glossary so invalid scopes never pass silently.
  resolveTermInState(owner.state, { term: '', scope_key: input.scope_key, language: input.language });
  const resolutions = terms.map(term => resolveTermInState(owner.state, { term, scope_key: input.scope_key, language: input.language })).filter(row => row.resolution !== 'unknown');
  insist(offset <= resolutions.length, 'stale_cursor', 'Cursor offset exceeds this projection', 'Restart the scoped packet query');
  const rows = resolutions.slice(offset, offset + input.limit); const next = offset + rows.length;
  return { owner_id: owner.id, revision: owner.revision, rows, returned: rows.length, omitted: resolutions.length - rows.length, total: resolutions.length, continuation: next < resolutions.length ? Buffer.from(JSON.stringify({ revision: owner.revision, query, offset: next })).toString('base64url') : null };
}
