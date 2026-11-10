import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PmClient } from '@unbrained/pm-cli/sdk/core';
import { createExtensionTestHarness } from '@unbrained/pm-cli/sdk/testing';
import extension, { createDirectoryHost, createGlossary, readGlossary } from '../dist/index.js';
import type { Host, DefineSenseInput } from '../dist/index.js';
import type { TestContext } from 'node:test';

/** Build a real native tracker outside any Git repository. */
export async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'pm-glossary-')); t.after(() => rm(root, { recursive: true, force: true }));
  const pmRoot = join(root, '.agents/pm'); const native = new PmClient({ pmRoot, author: 'fixture', noExtensions: true });
  await native.init('corpus', { defaults: true, agentGuidance: 'skip', mergeFence: false });
  const host = createDirectoryHost(pmRoot, 'fixture');
  const birth = { id: 'corpus-lexicon', op: 'birth', title: 'Reviewed lexicon', domain_key: 'context', scopes: [{ scope_key: 'root', parent: null }, { scope_key: 'delivery', parent: 'root' }, { scope_key: 'research', parent: 'root' }] };
  await createGlossary(host, birth); return { root, pmRoot, native, host, birth, id: birth.id };
}
/** Build the native fixture plus a command/schema/renderer extension harness that deactivates after the test. */
export async function harnessFixture(t: TestContext) {
  const base = await fixture(t); const ext = await createExtensionTestHarness(extension, { capabilities: ['commands', 'schema', 'renderers'] }); t.after(() => ext.deactivate());
  return { ...base, ext };
}
/** Use a fresh native revision for one explicit reviewed addition. */
export async function request(host: Host, id: string, senseId: string, term = senseId): Promise<DefineSenseInput> {
  return { id, op: `define-${senseId}`, revision: (await readGlossary(host, id)).revision, sense: { sense_id: senseId, term, definition: `Reviewed meaning for ${senseId}.`, scope_key: 'root', language: 'en' } };
}
/** Assert a bounded typed refusal code without inspecting private diagnostic values. */
export function hasCode(code: string): (error: unknown) => boolean { return error => typeof error === 'object' && error !== null && 'code' in error && error.code === code; }
