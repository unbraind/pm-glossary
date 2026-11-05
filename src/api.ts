import { isItemAlreadyExistsError } from '@unbrained/pm-cli/sdk';
import { capable } from './host.ts';
import type { Host, Snapshot } from './host.ts';
import { insist, refusal } from './errors.ts';
import { parse, digest, createGlossaryInputSchema, defineSenseInputSchema, addAliasInputSchema, resolveTermInputSchema, checkGlossaryInputSchema, glossaryPacketInputSchema } from './schema.ts';
import type { CreateGlossaryInput, DefineSenseInput, AddAliasInput, ResolveTermInput, CheckGlossaryInput, GlossaryPacketInput, GlossaryState } from './schema.ts';
import { readState, validateScopes, resolveTermInState } from './kernel.ts';
import { packetPage } from './packet.ts';

/** Versioned semantic write receipt; original result is distinct from the current revision. */
export interface GlossaryMutationReceipt {
  /** Native owner identity. */
  owner_id: string;
  /** Revision observed for the owner at receipt time, possibly advanced by a peer. */
  revision: string;
  /** Original caller-owned idempotency key. */
  operation_id: string;
  /** True when no new mutation was needed. */
  replayed: boolean;
  /** Number of bounded CAS admission attempts. */
  attempts: number;
  /** Immutable committed semantic outcome. */
  result: GlossaryState['operations'][number]['result'];
  /** Independent committed result fingerprint. */
  result_digest: string;
  /** Explicit durable crash-recovery outcome. */
  outcome: 'committed';
}
/** Yield an optional observation boundary without storing package journals. */
async function boundary(host: Host, step: string): Promise<void> { await host.boundary?.(step); }
/** Read only the selected owner and certify a consistent native item/hash pair. */
export async function readGlossary(host: Host, id: string): Promise<Snapshot> {
  capable(host);
  try {
    const got = await host.client.get(id, { outputInclude: 'full', outputBudget: 'unbounded', outputLimit: 'unbounded' });
    insist('item' in got && 'item_hash' in got && typeof got.item_hash === 'string', 'incomplete_read', 'Host did not return the full selected owner', 'Obtain a complete authorized owner read');
    insist(got.item.type === 'Glossary', 'invalid_record', 'Selected owner is not a Glossary');
    return { id: got.item.id, revision: got.item_hash, state: readState(got.item.glossary_state) };
  } catch (error) {
    if (refusal(error).code === 'item_not_found') throw refusal({ code: 'not_found', remedy: 'Select an existing authorized glossary owner' });
    throw refusal(error);
  }
}
/** Build or replay a receipt without reinterpreting historical success as current truth. */
async function receipt(host: Host, snapshot: Snapshot, operation: GlossaryState['operations'][number], replayed: boolean, attempts: number): Promise<GlossaryMutationReceipt> {
  await boundary(host, 'before_receipt');
  const current = await host.client.readItemRevision(snapshot.id);
  return { owner_id: snapshot.id, revision: current.item_hash, operation_id: operation.operation_id, replayed, attempts, result: operation.result, result_digest: operation.result_digest, outcome: 'committed' };
}
/** Append one bounded replay record before admitting the owner update. */
function record(state: GlossaryState, op: string, request: unknown, kind: 'create' | 'define' | 'alias', identity: string): GlossaryState['operations'][number] {
  const result = { kind, sequence: state.operations.length + 1, identity }; const operation = { operation_id: op, request_digest: digest(request), result, result_digest: digest(result) };
  state.operations.push(operation);
  capacity(state);
  readState(state); return operation;
}
/** Verify an existing operation key against the identical normalized request. */
function replay(state: GlossaryState, op: string, request: unknown): GlossaryState['operations'][number] | undefined {
  const found = state.operations.find(operation => operation.operation_id === op);
  if (found) insist(found.request_digest === digest(request), 'operation_conflict', 'Operation key already belongs to a different request', 'Use the original request with this key, or a new key for a new reviewed decision');
  return found;
}
/** Create one caller-owned native item, recovering duplicate-ID retries without adopting peers. */
export async function createGlossary(host: Host, raw: CreateGlossaryInput): Promise<GlossaryMutationReceipt> {
  const submitted = parse(createGlossaryInputSchema, raw); capable(host);
  const input = parse(createGlossaryInputSchema, { ...submitted, id: await host.normalizeId?.(submitted.id) ?? submitted.id }); validateScopes(input.scopes);
  const state: GlossaryState = { version: 1, domain_key: input.domain_key, language_policy: 'exact', scopes: input.scopes, senses: [], aliases: [], bindings: [], operations: [] };
  const operation = record(state, input.op, input, 'create', input.id);
  await host.prepareCreate?.(); await boundary(host, 'before_create');
  try {
    const created = await host.client.create({ id: input.id, title: input.title, type: 'Glossary', field: [`glossary_state=${JSON.stringify(state)}`], comment: ['glossary:create explicit reviewed terminology'], dep: input.related.map(id => `id=${id},kind=related`) });
    await boundary(host, 'after_create');
    return await receipt(host, { id: created.item.id, revision: '', state }, operation, false, 1);
  } catch (error) {
    if (!isItemAlreadyExistsError(error)) throw refusal(error);
    const current = await readGlossary(host, input.id); const original = replay(current.state, input.op, input);
    insist(original?.result.kind === 'create' && original.result.sequence === 1 && original.result.identity === input.id, 'operation_conflict', 'Existing item is not owned by this creation request', 'Choose another explicit owner ID; do not adopt an unrelated record');
    return receipt(host, current, original, true, 1);
  }
}
/** Apply a native revision-checked edit; only a still-absent commutative addition can retry. */
async function mutate(host: Host, input: ReturnType<typeof defineSenseInputSchema.parse> | ReturnType<typeof addAliasInputSchema.parse>, kind: 'define' | 'alias'): Promise<GlossaryMutationReceipt> {
  let addition = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const snapshot = await readGlossary(host, input.id); await boundary(host, 'after_read');
    const normalized = { ...input, id: snapshot.id };
    const previous = replay(snapshot.state, input.op, normalized);
    if (previous) return receipt(host, snapshot, previous, true, attempt);
    const state = structuredClone(snapshot.state);
    const sense = 'sense' in input ? input.sense : undefined; const alias = 'alias' in input ? input.alias : undefined;
    const exists = sense ? state.senses.some(value => value.sense_id === sense.sense_id) : state.aliases.some(value => value.alias_id === alias!.alias_id);
    if (attempt === 1) { insist(snapshot.revision === input.revision, 'revision_conflict', 'Caller revision is stale', 'Reread the glossary and explicitly review a new request'); addition = !exists; }
    else insist(!exists, 'revision_conflict', 'Concurrent addition now owns this identity', 'Reread and review the existing identity before editing it');
    if (sense) {
      insist(sense.contrast_sense_ids.every(id => id !== sense.sense_id && state.senses.some(value => value.sense_id === id)), 'invalid_input', 'Contrast must name another existing sense');
      state.senses = state.senses.filter(value => value.sense_id !== sense.sense_id); state.senses.push(sense);
    } else {
      insist(state.senses.some(value => value.sense_id === alias!.sense_id), 'alias_cycle', 'Alias target must be a direct existing sense', 'Select a sense ID; alias chains, cycles and missing targets are forbidden');
      state.aliases = state.aliases.filter(value => value.alias_id !== alias!.alias_id); state.aliases.push(alias!);
    }
    insist(state.scopes.some(value => value.scope_key === (sense ?? alias!).scope_key), 'invalid_scope', 'Meaning scope is not declared');
    const operation = record(state, input.op, normalized, kind, sense ? sense.sense_id : alias!.alias_id);
    try {
      await boundary(host, 'before_guard');
      await boundary(host, 'before_update');
      const checked = await host.client.withExpectedItemRevisions([{ id: snapshot.id, itemHash: snapshot.revision }], () => host.client.update(snapshot.id, { field: [`glossary_state=${JSON.stringify(state)}`], comment: [`glossary:${kind} explicit reviewed terminology`] }));
      await boundary(host, 'after_update');
      insist(checked.checked.includes(snapshot.id) && checked.unchecked.length === 0, 'backend_unsupported', 'Host did not prove the locked owner expectation', 'Select a conforming host and reconcile the original operation key before retrying');
      await boundary(host, 'after_guard'); return await receipt(host, snapshot, operation, false, attempt);
    } catch (error) {
      const failed = refusal(error);
      if (failed.code !== 'revision_conflict' || !addition) throw failed;
    }
  }
  throw refusal({ code: 'contention', remedy: 'Reread and retry the original request and operation key; no write was acknowledged' });
}
/** Define or explicitly redefine a reviewed sense at a native revision. */
export async function defineSense(host: Host, input: DefineSenseInput): Promise<GlossaryMutationReceipt> { return mutate(host, parse(defineSenseInputSchema, input), 'define'); }
/** Add a direct alias, preserving equal-level ambiguity instead of hidden precedence. */
export async function addAlias(host: Host, input: AddAliasInput): Promise<GlossaryMutationReceipt> { return mutate(host, parse(addAliasInputSchema, input), 'alias'); }
/** Resolve one exact scoped term through the same pure kernel used by packets. */
export async function resolveTerm(host: Host, raw: ResolveTermInput) {
  const input = parse(resolveTermInputSchema, raw); const owner = await readGlossary(host, input.id);
  return { owner_id: owner.id, revision: owner.revision, ...resolveTermInState(owner.state, input) };
}
/** Diagnose duplicate alias tuples and broken contrast references without rewriting prose. */
export async function checkGlossary(host: Host, raw: CheckGlossaryInput) {
  const input = parse(checkGlossaryInputSchema, raw); const owner = await readGlossary(host, input.id);
  if (input.scope_key !== undefined) insist(owner.state.scopes.some(scope => scope.scope_key === input.scope_key), 'invalid_scope', 'Diagnostic scope is not declared');
  const tuples = new Set<string>(); const findings: { code: string; identity: string }[] = [];
  for (const alias of owner.state.aliases.filter(row => input.scope_key === undefined || row.scope_key === input.scope_key)) {
    const tuple = digest([alias.term, alias.scope_key, alias.language, alias.sense_id]);
    if (tuples.has(tuple)) findings.push({ code: 'duplicate_alias', identity: alias.alias_id }); tuples.add(tuple);
  }
  for (const sense of owner.state.senses.filter(row => input.scope_key === undefined || row.scope_key === input.scope_key)) for (const contrast of sense.contrast_sense_ids) if (!owner.state.senses.some(value => value.sense_id === contrast)) findings.push({ code: 'broken_contrast', identity: sense.sense_id });
  return { owner_id: owner.id, revision: owner.revision, findings, freshness: 'unknown' as const, bindings: 'deferred_first_slice' as const };
}
/** Build a revision-bound page whose rows retain complete ambiguity witnesses. */
export async function glossaryPacket(host: Host, raw: GlossaryPacketInput) {
  const input = parse(glossaryPacketInputSchema, raw); return packetPage(await readGlossary(host, input.id), input);
}

/** Enforce independent aggregate resource ceilings before a native owner mutation. */
export function capacity(state: GlossaryState): void {
  insist(state.operations.length <= 256 && state.senses.length <= 128 && state.aliases.length <= 256 && Buffer.byteLength(JSON.stringify(state)) <= 65536, 'capacity', 'Glossary aggregate limit reached', 'Create a successor glossary or partition the domain; receipts are never evicted');
}
