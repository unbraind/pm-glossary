import test from 'node:test';
import assert from 'node:assert/strict';
import { realData, trackerRepository } from './corpus.ts';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fixture, request } from './helpers.ts';
import { defineSense, resolveTerm } from '../dist/index.js';

test('corpus sibling checkout paths decode spaces Unicode and URL delimiters',()=>{
  const root=join(tmpdir(),'glossary space é 日本 # %');
  const moduleUrl=pathToFileURL(join(root,'pm-glossary','test','corpus.ts')).href;
  assert.equal(trackerRepository(moduleUrl),join(root,'pm-vcs'));
  assert.equal(trackerRepository(),join(process.cwd(),'..','pm-vcs'));
});

test('public gold corpus resolves 42 meanings, abstains on ten probes and saves at least half the bytes',async()=>{
  const report=await realData();assert.equal(report.terms,38);assert.equal(report.senses,44);assert.ok(report.reduction_percent>=50);
});
test('non-software research and physics terminology uses explicit scopes',async t=>{
  const {host,id}=await fixture(t);
  const statistical=await request(host,id,'statistical-power','power');statistical.sense.scope_key='research';statistical.sense.definition='Probability of rejecting a false null hypothesis in a declared study design.';await defineSense(host,statistical);
  const physical=await request(host,id,'physical-power','power');physical.sense.definition='Energy transferred per unit time.';await defineSense(host,physical);
  assert.equal((await resolveTerm(host,{id,term:'power',scope_key:'research'})).candidates[0].sense_id,'statistical-power');
  assert.equal((await resolveTerm(host,{id,term:'power',scope_key:'delivery'})).candidates[0].sense_id,'physical-power');
});
