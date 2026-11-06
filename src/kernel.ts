import { glossaryStateSchema, parse, digest } from './schema.ts';
import type { GlossaryState, Sense } from './schema.ts';
import { insist } from './errors.ts';

/** A scoped outcome retains every distinguishing candidate and never guesses. */
export interface TermResolution {
  /** Whether one reviewed meaning is available. */
  resolution: 'resolved' | 'ambiguous' | 'unknown';
  /** Only unique outcomes are usable without an explicit decision. */
  usable: boolean;
  /** Exact requested surface text. */
  term: string;
  /** Requested scope. */
  scope: string;
  /** First matching scope, or null. */
  matched_scope: string | null;
  /** Every candidate at the first matching scope. */
  candidates: Sense[];
}
/** Validate an explicit single-root acyclic scope tree, bounded to eight levels. */
export function validateScopes(scopes: GlossaryState['scopes']): void {
  const nodes = new Map(scopes.map(scope => [scope.scope_key, scope.parent]));
  insist(nodes.size === scopes.length && scopes.filter(scope => scope.parent === null).length === 1, 'invalid_scope', 'Scopes require unique keys and exactly one root');
  for (const scope of scopes) {
    const seen = new Set<string>(); let current: string | null = scope.scope_key;
    while (current !== null) {
      insist(nodes.has(current) && !seen.has(current) && seen.size < 8, 'invalid_scope', 'Scope parent is missing, cyclic or deeper than eight levels');
      seen.add(current); current = nodes.get(current)!;
    }
  }
}
/** Validate the entire stored record before interpreting a term or replay receipt. */
export function readState(raw: unknown): GlossaryState {
  insist(typeof raw === 'object' && raw !== null && 'version' in raw, 'invalid_record', 'Glossary state is missing');
  insist(raw.version === 1, 'unsupported_version', 'Glossary state version is unsupported', 'Upgrade pm-glossary; reads never migrate stored state');
  const state = parse(glossaryStateSchema, raw, true); validateScopes(state.scopes);
  for (const values of [state.senses.map(sense => sense.sense_id), state.aliases.map(alias => alias.alias_id), state.operations.map(operation => operation.operation_id)]) insist(new Set(values).size === values.length, 'invalid_record', 'Duplicate durable identities require review');
  const scopes = new Set(state.scopes.map(scope => scope.scope_key)); const senses = new Set(state.senses.map(sense => sense.sense_id));
  insist(state.senses.every(sense => scopes.has(sense.scope_key)) && state.aliases.every(alias => scopes.has(alias.scope_key) && senses.has(alias.sense_id)), 'invalid_record', 'Sense scope or alias target is invalid');
  insist(state.operations.every(operation => operation.result_digest === digest(operation.result)), 'invalid_record', 'Replay result digest does not match');
  insist(Buffer.byteLength(JSON.stringify(state)) <= 65536, 'invalid_record', 'Stored glossary exceeds 64 KiB');
  return state;
}
/** Resolve exactly at the requested level, then ancestors; aliases never outrank nearer terms. */
export function resolveTermInState(state: GlossaryState, query: { term: string; scope_key: string; language?: string }): TermResolution {
  return resolveInValidState(readState(state), query);
}
/** Resolve a snapshot already validated by readState, without reparsing the aggregate. */
export function resolveInValidState(valid: GlossaryState, query: { term: string; scope_key: string; language?: string }): TermResolution {
  const scopes = new Map(valid.scopes.map(scope => [scope.scope_key, scope.parent]));
  insist(scopes.has(query.scope_key), 'invalid_scope', 'Requested scope is not declared', 'Choose a scope from the explicit glossary tree');
  const language = query.language ?? 'en'; let scope: string | null = query.scope_key;
  while (scope !== null) {
    const direct = valid.senses.filter(sense => sense.term === query.term && sense.scope_key === scope && sense.language === language);
    const aliases = valid.aliases.filter(alias => alias.term === query.term && alias.scope_key === scope && alias.language === language);
    const ids = new Set([...direct.map(sense => sense.sense_id), ...aliases.map(alias => alias.sense_id)]);
    const candidates = valid.senses.filter(sense => ids.has(sense.sense_id)).sort((a, b) => a.sense_id < b.sense_id ? -1 : 1);
    if (candidates.length > 0) return { resolution: candidates.length === 1 ? 'resolved' : 'ambiguous', usable: candidates.length === 1, term: query.term, scope: query.scope_key, matched_scope: scope, candidates };
    scope = scopes.get(scope)!;
  }
  return { resolution: 'unknown', usable: false, term: query.term, scope: query.scope_key, matched_scope: null, candidates: [] };
}
