import test from 'node:test';
import assert from 'node:assert/strict';
import { createPmCliExpectedError } from '@unbrained/pm-cli/sdk';
import { GlossaryRefusal, createGlossary, defineSense, addAlias, readGlossary } from '../dist/index.js';
import type { Host } from '../dist/index.js';
import { fixture, request } from './helpers.ts';

/** Exercise native contracts, bounded system diagnostics and opaque host failures. */
function failures() {
  return [
    { error: Object.assign(new Error('Synthetic private diagnostic'), { code: 'EIO' }), code: 'io_error', details: { native_code: 'EIO' } },
    { error: new Error('Synthetic private diagnostic'), code: 'outcome_unknown', details: {} },
    { error: createPmCliExpectedError('Synthetic private diagnostic', { exitCode: 5, context: { code: 'permission_denied', required: 'Review host access' } }), code: 'permission_denied', details: {} },
    { error: new GlossaryRefusal('backend_unsupported', 'Host capability unavailable', 'Select a conforming host'), code: 'backend_unsupported', details: {} },
  ];
}

/** Check the direct SDK contract without permitting raw diagnostics in public errors. */
function typedFailure(failure: ReturnType<typeof failures>[number]) {
  return (error: unknown) => {
    assert.ok(error instanceof GlossaryRefusal);
    assert.equal(error.code, failure.code);
    assert.deepEqual(error.details, failure.details);
    assert.ok(error.remedy.length > 0);
    assert.doesNotMatch(error.message + error.remedy + JSON.stringify(error), /private diagnostic/);
    if (failure.error instanceof GlossaryRefusal) assert.equal(error, failure.error);
    if (failure.code === 'permission_denied') {
      assert.equal(error.nativeExit, 5);
      assert.equal(error.remedy, 'Review host access');
    }
    return true;
  };
}

test('receipt failures are typed on fresh and replayed create define and alias calls', async t => {
  for (const kind of ['create', 'define', 'alias'] as const) for (const replayed of [false, true]) {
    for (const site of ['before_receipt', 'readItemRevision'] as const) for (const failure of failures()) {
      await t.test(`${kind} replay=${replayed} ${site} ${failure.code}`, async t => {
        const { host, id, birth, native } = await fixture(t);
        await defineSense(host, await request(host, id, 'target'));
        const creation = { ...birth, id: 'corpus-receipt', op: 'receipt-birth' };
        const sense = await request(host, id, 'receipt-sense');
        const alias = { id, op: 'receipt-alias', revision: sense.revision, alias: { alias_id: 'receipt-alias', term: 'alternate', scope_key: 'root', language: 'en', sense_id: 'target' } };
        const invoke = (port: Host) => kind === 'create' ? createGlossary(port, creation) : kind === 'define' ? defineSense(port, sense) : addAlias(port, alias);
        if (replayed) await invoke(host);
        const ownerId = kind === 'create' ? creation.id : id;
        const before = replayed ? await native.readItemRevision(ownerId) : undefined;
        let hits = 0;
        const fail = async () => { hits++; throw failure.error; };
        const broken: Host = site === 'before_receipt'
          ? { ...host, boundary: async step => { if (step === site) await fail(); } }
          : { ...host, client: { ...host.client, readItemRevision: fail } };
        await assert.rejects(invoke(broken), typedFailure(failure));
        assert.equal(hits, 1);
        const committed = await native.readItemRevision(ownerId);
        if (before) assert.deepEqual(committed, before);
        const recovered = await invoke(host);
        assert.equal(recovered.replayed, true);
        assert.equal(recovered.operation_id, kind === 'create' ? creation.op : kind === 'define' ? sense.op : alias.op);
        assert.deepEqual(await native.readItemRevision(ownerId), committed);
      });
    }
  }
});

test('pre-create host failures are typed before any owner mutation', async t => {
  for (const site of ['normalizeId', 'prepareCreate', 'before_create'] as const) for (const failure of failures()) {
    await t.test(`${site} ${failure.code}`, async t => {
      const { host, id, birth, native } = await fixture(t);
      const before = await native.readItemRevision(id);
      let hits = 0;
      const fail = async () => { hits++; throw failure.error; };
      const broken: Host = site === 'before_create'
        ? { ...host, boundary: async step => { if (step === site) await fail(); } }
        : { ...host, [site]: fail };
      await assert.rejects(createGlossary(broken, { ...birth, id: 'corpus-not-created', op: 'failed-birth' }), typedFailure(failure));
      assert.equal(hits, 1);
      await assert.rejects(readGlossary(host, 'corpus-not-created'), { code: 'not_found' });
      assert.deepEqual(await native.readItemRevision(id), before);
    });
  }
});

test('after_read host failures are typed before define and alias mutations', async t => {
  for (const kind of ['define', 'alias'] as const) for (const failure of failures()) {
    await t.test(`${kind} ${failure.code}`, async t => {
      const { host, id, native } = await fixture(t);
      await defineSense(host, await request(host, id, 'target'));
      const sense = await request(host, id, 'never-added');
      const before = await native.readItemRevision(id);
      let hits = 0;
      const broken: Host = { ...host, boundary: async step => { if (step === 'after_read') { hits++; throw failure.error; } } };
      const result = kind === 'define' ? defineSense(broken, sense) : addAlias(broken, { id, op: 'never-alias', revision: before.item_hash, alias: { alias_id: 'never-added', term: 'alternate', scope_key: 'root', language: 'en', sense_id: 'target' } });
      await assert.rejects(result, typedFailure(failure));
      assert.equal(hits, 1);
      assert.deepEqual(await native.readItemRevision(id), before);
    });
  }
});
