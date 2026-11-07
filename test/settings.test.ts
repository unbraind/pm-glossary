import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createExtensionTestHarness } from '@unbrained/pm-cli/sdk/testing';
import { getWorkspaceHistoryPath, readSettingsSection, writeSettingsSection } from '@unbrained/pm-cli/sdk';
import extension from '../dist/index.js';
import type { GlossaryOutput } from '../dist/index.js';
import { fixture, hasCode } from './helpers.ts';

test('SDK settings sections give directory and command adapters identical policy without writes', async t => {
  const { pmRoot, native, host, id } = await fixture(t);
  await native.schemaAddField('peer_field', { type: 'string', description: 'Independent native field' });
  await native.schemaAddType('Peer', { folder: 'peer', description: 'Independent native type' });
  await writeSettingsSection(pmRoot, 'peer', { output_budget: 1, nested: { retained: true } }, { author: 'fixture' });
  const ext = await createExtensionTestHarness(extension, { capabilities: ['commands', 'schema', 'renderers'] });
  t.after(() => ext.deactivate());
  const settingsPath = join(pmRoot, 'settings.json');
  const historyPath = getWorkspaceHistoryPath(pmRoot);
  for (const [stored, expected] of [[undefined, undefined], [{}, {}], [{ output_budget: 2400 }, { output_budget: 2400 }], [{ output_budget: '02400' }, { output_budget: 2400 }]] as const) {
    await writeSettingsSection(pmRoot, 'glossary', stored, { author: 'fixture' });
    const before = await readFile(settingsPath, 'utf8');
    const history = await readFile(historyPath, 'utf8');
    assert.deepEqual(await host.settings!(), expected);
    const result = await ext.runCommand({ command: 'glossary packet', args: [id], options: { scope: 'root' }, pmRoot });
    assert.equal(result.exitCode ?? 0, 0);
    const output = result.result as GlossaryOutput & { output_fit: { token_budget: number } };
    assert.equal(output.ok, true);
    assert.equal(output.output_fit.token_budget, expected?.output_budget ?? 1600);
    assert.equal(await readFile(settingsPath, 'utf8'), before);
    assert.equal(await readFile(historyPath, 'utf8'), history);
  }
  assert.deepEqual((await readSettingsSection(pmRoot, 'peer')).value, { output_budget: 1, nested: { retained: true } });
  assert.ok((await native.schemaListFields()).fields.some(field => field.key === 'peer_field'));
  assert.ok((await native.schemaList()).custom.some(type => type.name === 'Peer'));
});

test('SDK settings refusals agree for malformed documents and invalid glossary policy', async t => {
  const { pmRoot, host, id } = await fixture(t);
  const ext = await createExtensionTestHarness(extension, { capabilities: ['commands', 'schema', 'renderers'] });
  t.after(() => ext.deactivate());
  const settingsPath = join(pmRoot, 'settings.json');
  const original = await readFile(settingsPath, 'utf8');
  /** Check the same typed refusal and observational read contract through both adapters. */
  const check = async (code: string) => {
    const before = await readFile(settingsPath, 'utf8');
    await assert.rejects(host.settings!(), hasCode(code));
    const result = await ext.runCommand({ command: 'glossary packet', args: [id], options: { scope: 'root' }, pmRoot });
    assert.equal((result.result as GlossaryOutput).refusal?.code, code);
    assert.equal(await readFile(settingsPath, 'utf8'), before);
  };
  const invalid = [null, [], 'invalid', { unknown: 1 }, { output_budget: 0 }, { output_budget: true }, { output_budget: 'unbounded' }, { output_budget: '1.5' }, { output_budget: 1.5 }, { output_budget: '999999999999999999999' }];
  for (const policy of invalid) {
    await writeSettingsSection(pmRoot, 'glossary', policy, { author: 'fixture' });
    await check('settings_section_invalid');
  }
  for (const text of ['{', 'null', '[]', '"invalid"']) {
    await writeFile(settingsPath, text);
    await check('settings_section_document_malformed');
  }
  await writeFile(settingsPath, original);
});
