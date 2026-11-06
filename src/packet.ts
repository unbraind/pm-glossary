import { encodeReadOutputContinuationCursor, decodeReadOutputContinuationCursor } from '@unbrained/pm-cli/sdk/contracts';
import { digest } from './schema.ts';
import type { GlossaryPacketInput } from './schema.ts';
import type { Snapshot } from './host.ts';
import { insist, GlossaryRefusal } from './errors.ts';
import { resolveInValidState } from './kernel.ts';

/** Derive a page with native opaque cursors bound to the owner, query and complete projection. */
export function packetPage(owner: Snapshot, input: GlossaryPacketInput & { language: string; limit: number }) {
  const query = digest({ scope: input.scope_key, language: input.language, limit: input.limit, projection: 'full-witness-v1' });
  const fingerprint = digest({ revision: owner.revision, query }); let offset = 0; let total: number | undefined;
  if (input.cursor !== undefined) {
    let cursor: ReturnType<typeof decodeReadOutputContinuationCursor>;
    try { cursor = decodeReadOutputContinuationCursor(input.cursor); }
    catch { throw new GlossaryRefusal('stale_cursor', 'Cursor is malformed', 'Restart the scoped packet query without a cursor'); }
    insist(cursor.command === 'extension:glossary packet' && cursor.path === 'data.rows' && cursor.fingerprint === fingerprint, 'stale_cursor', 'Cursor belongs to a different revision or query', 'Restart the scoped packet query without a cursor');
    offset = cursor.offset; total = cursor.total_rows;
  }
  const terms = [...new Set([...owner.state.senses, ...owner.state.aliases].filter(row => row.language === input.language).map(row => row.term))].sort();
  // Validate scope even for an empty glossary; no sentinel becomes a persisted term.
  resolveInValidState(owner.state, { term: '', scope_key: input.scope_key, language: input.language });
  const resolutions = terms.map(term => resolveInValidState(owner.state, { term, scope_key: input.scope_key, language: input.language })).filter(row => row.resolution !== 'unknown');
  insist(offset <= resolutions.length && (total === undefined || total === resolutions.length), 'stale_cursor', 'Cursor offset or denominator differs from this projection', 'Restart the scoped packet query');
  const rows = resolutions.slice(offset, offset + input.limit); const next = offset + rows.length;
  return { owner_id: owner.id, revision: owner.revision, rows, returned: rows.length, omitted: resolutions.length - rows.length, total: resolutions.length, continuation: next < resolutions.length ? encodeReadOutputContinuationCursor({ command: 'extension:glossary packet', path: 'data.rows', offset: next, total_rows: resolutions.length, fingerprint }) : null };
}
