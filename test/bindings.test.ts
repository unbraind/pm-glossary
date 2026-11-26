import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createPmCliExpectedError } from '@unbrained/pm-cli/sdk';
import { decodeToon } from '@unbrained/pm-cli/sdk/testing';
import {
  bindingEvidenceSchema, bindUseSite, checkGlossary, createDirectoryHost, defineSense,
  glossaryMutationReceiptSchema, glossaryOutputSchema, readGlossary, readState,
} from '../dist/index.js';
import type { BindUseSiteInput, GlossaryOutput, Host, UseSiteBinding } from '../dist/index.js';
import { capacity } from '../dist/src/api.js';
import { harnessFixture, hasCode, request } from './helpers.ts';
import type { TestContext } from 'node:test';

const prefix = 'é😀 ';
const excerpt = 'e\u0301';
const sourceText = `${prefix}${excerpt} gate and gate`;

/** Hash the exact bytes independently of the glossary request digest. */
function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Create authorized synthetic source and glossary items in a plain tracker. */
async function setupBinding(t: TestContext) {
  const base = await harnessFixture(t);
  const { host, id, native } = base;
  const source = await native.create({ id: 'source', title: 'Reviewed source', body: sourceText });
  const sourceRevision = (await native.readItemRevision(source.item.id)).item_hash;
  const { revision } = await defineSense(host, await request(host, id, 'target'));
  const start_byte = Buffer.byteLength(prefix);
  const binding: UseSiteBinding = {
    binding_id: 'first-use',
    sense_id: 'target',
    source: { item_id: source.item.id, item_hash: sourceRevision, field_pointer: '/body', start_byte, end_byte: start_byte + Buffer.byteLength(excerpt), span_sha256: sha256(excerpt) },
  };
  const input: BindUseSiteInput = { id, revision, op: 'bind-first', binding };
  return { ...base, input, binding, history: join(base.pmRoot, 'history', `${id}.jsonl`) };
}

test('binding persistence pins exact native source bytes and replays without duplicate history', async t => {
  const { host, id, native, input, binding, history } = await setupBinding(t);
  assert.deepEqual((await readGlossary(host, id)).state.bindings, []);
  const before = await readFile(history, 'utf8');
  const result = await bindUseSite(host, {
    ...input, id: 'lexicon', binding: { ...binding, source: { ...binding.source, item_id: ' source ', item_hash: binding.source.item_hash.toUpperCase() } },
  });
  assert.deepEqual(result.result, { kind: 'bind', sequence: 3, identity: binding.binding_id });
  assert.equal(result.replayed, false);
  const after = await readFile(history, 'utf8');
  assert.ok(after.startsWith(before));
  assert.equal(after.slice(before.length).trim().split('\n').length, 1);
  assert.doesNotMatch(after, /gate and gate/);
  assert.deepEqual((await readGlossary(host, id)).state.bindings, [binding]);
  assert.equal((await native.readItemRevision(binding.source.item_id)).item_hash, binding.source.item_hash);

  const checked = await checkGlossary(host, { id, binding_id: binding.binding_id });
  assert.equal(checked.bindings, 1);
  assert.deepEqual(bindingEvidenceSchema.parse(checked.binding_evidence), {
    binding, status: 'current', observed_item_hash: binding.source.item_hash,
  });
  await native.delete(binding.source.item_id);
  const missing = await checkGlossary(host, { id, binding_id: binding.binding_id });
  assert.deepEqual(missing.binding_evidence, { binding, status: 'missing', observed_item_hash: null });
  await assert.doesNotReject(async () => {
    const replay = await bindUseSite(host, input);
    assert.equal(replay.replayed, true);
    assert.equal(replay.result_digest, result.result_digest);
    assert.deepEqual(replay.result, result.result);
  });
  await assert.rejects(bindUseSite(host, { ...input, binding: { ...binding, binding_id: 'changed' } }), hasCode('operation_conflict'));
  assert.equal(await readFile(history, 'utf8'), after);
});

test('binding admission refuses stale owner, changed source, missing source and inaccessible source', async t => {
  const { host, id, native, input, binding, history } = await setupBinding(t);
  const before = await readFile(history, 'utf8');
  await assert.rejects(bindUseSite(host, { ...input, revision: 'a'.repeat(64) }), hasCode('revision_conflict'));
  await assert.rejects(bindUseSite(host, { ...input, binding: { ...binding, source: { ...binding.source, item_id: 'absent' } } }), hasCode('source_missing'));
  const restricted: Host = {
    ...host,
    client: { ...host.client, get: async (itemId, options) => {
      if (itemId === binding.source.item_id) throw createPmCliExpectedError('Private source access', { exitCode: 5, context: { code: 'permission_denied', required: 'Private source details' } });
      return host.client.get(itemId, options);
    } },
  };
  await assert.rejects(bindUseSite(restricted, input), error => {
    assert.ok(error instanceof Error);
    assert.equal(hasCode('source_inaccessible')(error), true);
    assert.doesNotMatch(error.message + JSON.stringify(error), /Private source/);
    return true;
  });
  assert.equal(await readFile(history, 'utf8'), before);
  await bindUseSite(host, input);
  const bound = await readFile(history, 'utf8');
  const checked = await checkGlossary(restricted, { id, binding_id: binding.binding_id });
  assert.deepEqual(checked.binding_evidence, { binding, status: 'inaccessible', observed_item_hash: null });
  await native.update(binding.source.item_id, { title: 'New source revision with the same body' });
  const changed = await checkGlossary(host, { id, binding_id: binding.binding_id });
  const currentHash = (await native.readItemRevision(binding.source.item_id)).item_hash;
  assert.notEqual(currentHash, binding.source.item_hash);
  assert.deepEqual(changed.binding_evidence, { binding, status: 'changed', observed_item_hash: currentHash });
  const second = { ...input, revision: changed.revision, op: 'new-bind', binding: { ...binding, binding_id: 'second-use', source: { ...binding.source, start_byte: 0, end_byte: Buffer.byteLength(prefix), span_sha256: sha256(prefix) } } };
  await assert.rejects(bindUseSite(host, second), hasCode('stale_binding'));
  assert.equal(await readFile(history, 'utf8'), bound);
});

test('binding validation refuses split UTF-8, wrong checksums, out-of-range bytes and invalid inputs', async t => {
  const { host, id, input, binding, history, native } = await setupBinding(t);
  const before = await readFile(history, 'utf8');
  for (const change of [
    { start_byte: 1, end_byte: 2, span_sha256: sha256(Buffer.from(sourceText).subarray(1, 2)) },
    { start_byte: 0, end_byte: 1, span_sha256: sha256(Buffer.from(sourceText).subarray(0, 1)) },
    { start_byte: 0, end_byte: 999, span_sha256: sha256(sourceText) },
    { span_sha256: sha256(excerpt.normalize('NFC')) },
    { field_pointer: '/description' as const },
  ]) {
    await assert.rejects(bindUseSite(host, { ...input, binding: { ...binding, source: { ...binding.source, ...change } } }), hasCode('span_mismatch'));
  }
  for (const invalid of [
    { ...binding, sense_id: 'unknown' },
    { ...binding, source: { ...binding.source, item_id: 'lexicon' } },
    { ...binding, source: { ...binding.source, end_byte: binding.source.start_byte } },
    { ...binding, source: { ...binding.source, field_pointer: '/other' } },
    { ...binding, source: { ...binding.source, excerpt: 'Private content is not accepted' } },
  ]) {
    await assert.rejects(bindUseSite(host, { ...input, binding: invalid } as BindUseSiteInput), { code: 'invalid_input' });
  }
  assert.equal(await readFile(history, 'utf8'), before);
  await assert.rejects(checkGlossary(host, { id, binding_id: 'absent' }), hasCode('not_found'));
  await assert.rejects(bindUseSite({ ...host, capabilities: { ...host.capabilities, native_item_cas: false } }, input), hasCode('backend_unsupported'));

  const { normalizeId: ignored, ...canonicalHost } = host;
  await bindUseSite(canonicalHost, input);
  const state = (await readGlossary(host, id)).state;
  state.bindings[0].source.span_sha256 = 'a'.repeat(64);
  const update = { glossaryState: state, message: 'Synthetic inconsistent span evidence' };
  await native.update(id, update);
  const inconsistent = await checkGlossary(host, { id, binding_id: binding.binding_id });
  assert.equal(inconsistent.binding_evidence?.status, 'span_mismatch');
});

test('binding checks reject unverified host projections and wrong source identity', async t => {
  const { host, native, input, binding, history } = await setupBinding(t);
  const other = await native.create({ title: 'Other source', body: sourceText });
  const before = await readFile(history, 'utf8');
  for (const [getSource, expected] of [
    [() => host.client.get(binding.source.item_id, { fields: 'body' }), 'source_inaccessible'],
    [() => host.client.get(other.item.id, { fields: 'body,item_hash' }), 'source_inaccessible'],
    [() => host.client.get(binding.source.item_id, { outputBudget: '1' }), 'source_inaccessible'],
    [() => host.client.get(binding.source.item_id, { fields: 'item_hash' }), 'span_mismatch'],
  ] as const) {
    const restricted: Host = {
      ...host,
      client: { ...host.client, get: async (itemId, options) => {
        const result = await host.client.get(itemId, options);
        return itemId === binding.source.item_id ? await getSource() as typeof result : result;
      } },
    };
    await assert.rejects(bindUseSite(restricted, input), hasCode(expected));
  }
  assert.equal(await readFile(history, 'utf8'), before);
});

test('concurrent bindings retain disjoint sites and refuse competing identities or decisions', async t => {
  const { host, id, pmRoot, history, input, binding } = await setupBinding(t);
  const peer = createDirectoryHost(pmRoot, 'peer');
  const sameSource = binding.source;
  const firstGate = Buffer.byteLength(`${prefix}${excerpt} `);
  const second: BindUseSiteInput = {
    ...input, op: 'bind-second',
    binding: { ...binding, binding_id: 'second-use', source: { ...sameSource, start_byte: firstGate, end_byte: firstGate + 4, span_sha256: sha256('gate') } },
  };
  let peerCommitted = false;
  host.boundary = async step => {
    if (step !== 'before_update' || peerCommitted) return;
    peerCommitted = true;
    await bindUseSite(peer, second);
  };
  const result = await bindUseSite(host, input);
  assert.equal(result.attempts, 2);
  assert.deepEqual((await readGlossary(host, id)).state.bindings, [second.binding, binding]);
  const before = await readFile(history, 'utf8');
  for (const conflict of [
    { ...binding, binding_id: 'competing-use' },
    { ...binding, source: { ...second.binding.source, start_byte: firstGate + 9, end_byte: firstGate + 13 } },
  ]) {
    await assert.rejects(bindUseSite(host, { id, revision: result.revision, op: 'competing', binding: conflict }), hasCode('binding_conflict'));
  }
  assert.equal(await readFile(history, 'utf8'), before);
  const third = { ...second.binding, binding_id: 'third-use', source: { ...second.binding.source, start_byte: firstGate + 9, end_byte: firstGate + 13 } };
  const concurrent = { ...input, revision: result.revision, op: 'bind-third', binding: third };
  host.boundary = async step => {
    if (step === 'before_update') await bindUseSite(peer, concurrent);
  };
  await assert.rejects(bindUseSite(host, { ...concurrent, op: 'bind-competing', binding: { ...third, binding_id: 'competing-use' } }), hasCode('binding_conflict'));
  assert.deepEqual((await readGlossary(host, id)).state.bindings, [second.binding, binding, third]);
  assert.equal((await readFile(history, 'utf8')).slice(before.length).trim().split('\n').length, 1);
});

test('concurrent matching binding decisions converge on one operation', async t => {
  const { host, id, pmRoot, history, input } = await setupBinding(t);
  const peer = createDirectoryHost(pmRoot, 'peer');
  let peerEntered = false;
  let competingDigest = '';
  host.boundary = async step => {
    if (step !== 'before_update' || peerEntered) return;
    peerEntered = true;
    competingDigest = (await bindUseSite(peer, input)).result_digest;
  };
  const before = await readFile(history, 'utf8');
  const result = await bindUseSite(host, input);
  assert.equal(result.replayed, true);
  assert.equal(result.attempts, 2);
  assert.equal(result.result_digest, competingDigest);
  assert.equal((await readGlossary(host, id)).state.bindings.length, 1);
  assert.equal((await readFile(history, 'utf8')).slice(before.length).trim().split('\n').length, 1);
});

test('binding retries refuse a changed sense or source instead of rebasing the decision', async t => {
  const { host, id, pmRoot, native, input, binding } = await setupBinding(t);
  const peer = createDirectoryHost(pmRoot, 'peer');
  let altered = false;
  host.boundary = async step => {
    if (step !== 'before_update' || altered) return;
    altered = true;
    const edited = await request(peer, id, 'target');
    await defineSense(peer, { ...edited, op: 'redefine', sense: { ...edited.sense, definition: 'Changed meaning.' } });
  };
  await assert.rejects(bindUseSite(host, input), hasCode('revision_conflict'));
  const current = await readGlossary(host, id);
  assert.deepEqual(current.state.bindings, []);
  let reads = 0;
  host.boundary = async step => {
    if (step === 'before_update' && reads === 0) {
      reads++;
      await defineSense(peer, await request(peer, id, 'other'));
    } else if (step === 'after_read' && reads === 1) {
      reads++;
      await native.update(binding.source.item_id, { body: 'Changed before the second guarded attempt.' });
    }
  };
  await assert.rejects(bindUseSite(host, { ...input, revision: current.revision }), hasCode('stale_binding'));
  assert.equal(reads, 2);
  assert.deepEqual((await readGlossary(host, id)).state.bindings, []);
});

test('binding native reads reject duplicate or dangling records and bound collection size', async t => {
  const { host, id, input, binding } = await setupBinding(t);
  await bindUseSite(host, input);
  const state = (await readGlossary(host, id)).state;
  for (const bindings of [
    [binding, { ...binding, binding_id: 'second-use' }],
    [binding, { ...binding, source: { ...binding.source, start_byte: 0 } }],
    [{ ...binding, sense_id: 'absent' }],
  ]) assert.throws(() => readState({ ...state, bindings }), hasCode('invalid_record'));
  const overfull = { ...state, bindings: Array.from({ length: 129 }, () => binding) };
  assert.throws(() => capacity(overfull), hasCode('capacity'));
});

test('binding CLI and SDK share guarded input, receipts and JSON and TOON freshness evidence', async t => {
  const { ext, host, id, pmRoot, input, binding, history } = await setupBinding(t);
  ext.assertCommandContract({ command: 'glossary bind' });
  const options = { input: JSON.stringify({ binding }), revision: input.revision, op: input.op };
  const invoke = (command: string, options: Record<string, string>) =>
    ext.runCommand({ command: `glossary ${command}`, args: [id], options, pmRoot });
  const before = await readFile(history, 'utf8');
  const tiny = await invoke('bind', { ...options, budget: '1' });
  assert.equal((tiny.result as GlossaryOutput).refusal?.code, 'output_budget');
  assert.equal(await readFile(history, 'utf8'), before);

  const written = await invoke('bind', options);
  assert.equal(written.exitCode ?? 0, 0);
  const envelope = written.result as GlossaryOutput;
  const cliReceipt = glossaryMutationReceiptSchema.parse(envelope.data);
  const sdkReceipt = await bindUseSite(host, input);
  assert.equal(sdkReceipt.replayed, true);
  assert.deepEqual(cliReceipt.result, sdkReceipt.result);
  assert.equal(cliReceipt.result_digest, sdkReceipt.result_digest);
  const checked = await invoke('check', { binding: binding.binding_id });
  assert.deepEqual((checked.result as GlossaryOutput).data, await checkGlossary(host, { id, binding_id: binding.binding_id }));
  assert.equal((await invoke('check', {})).exitCode ?? 0, 0);
  for (const [command, result] of [['bind', written.result], ['check', checked.result]] as const) {
    const json = await ext.runRendererOverride({ format: 'json', command: `glossary ${command}`, result });
    const toon = await ext.runRendererOverride({ format: 'toon', command: `glossary ${command}`, result });
    const rendered = JSON.parse(String(json.rendered)) as Record<string, unknown>;
    const { output_fit, ...portable } = rendered;
    assert.ok(output_fit);
    assert.equal(glossaryOutputSchema.safeParse(portable).success, true);
    assert.deepEqual(rendered, decodeToon(String(toon.rendered)));
  }
});
