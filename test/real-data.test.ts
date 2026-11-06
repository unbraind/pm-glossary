import test from 'node:test';
import assert from 'node:assert/strict';
import { realData, trackerRepository, sourceReceipt } from './corpus.ts';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, cpSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { npmEnvironment, testEnvironment } from '../scripts/environment.ts';
import { fixture, request } from './helpers.ts';
import { defineSense, resolveTerm } from '../dist/index.js';

test('corpus sibling checkout paths decode spaces Unicode and URL delimiters',()=>{
  const root=join(tmpdir(),'glossary space é 日本 # %');
  const moduleUrl=pathToFileURL(join(root,'pm-glossary','test','corpus.ts')).href;
  assert.equal(trackerRepository(moduleUrl),join(root,'pm-vcs'));
  assert.equal(trackerRepository(),join(process.cwd(),'..','pm-vcs'));
});

test('public gold corpus resolves 42 meanings, abstains on ten probes and saves at least half the bytes',async()=>{
  const report=await realData();assert.equal(report.terms,38);assert.equal(report.senses,44);assert.ok(report.reduction_percent>=50);for(const source of report.sources){assert.equal(source.source_sha256,undefined);assert.match(source.unverified_source_sha256!,/^[a-f0-9]{64}$/);}
});
test('non-software research and physics terminology uses explicit scopes',async t=>{
  const {host,id}=await fixture(t);
  const statistical=await request(host,id,'statistical-power','power');statistical.sense.scope_key='research';statistical.sense.definition='Probability of rejecting a false null hypothesis in a declared study design.';await defineSense(host,statistical);
  const physical=await request(host,id,'physical-power','power');physical.sense.definition='Energy transferred per unit time.';await defineSense(host,physical);
  assert.equal((await resolveTerm(host,{id,term:'power',scope_key:'research'})).candidates[0].sense_id,'statistical-power');
  assert.equal((await resolveTerm(host,{id,term:'power',scope_key:'delivery'})).candidates[0].sense_id,'physical-power');
});


test('corpus rejects duplicated ambiguity witnesses before counting abstentions',()=>{
  const root=mkdtempSync(join(tmpdir(),'glossary-witness-'));
  try{
    for(const directory of ['dist','test/fixtures'])cpSync(directory,join(root,directory),{recursive:true});
    mkdirSync(join(root,'scripts'));cpSync('scripts/environment.ts',join(root,'scripts/environment.ts'));
    cpSync('test/corpus.ts',join(root,'test/corpus.ts'));cpSync('package.json',join(root,'package.json'));
    symlinkSync(join(process.cwd(),'node_modules'),join(root,'node_modules'),'dir');
    const kernel=join(root,'dist/src/kernel.js');const source=readFileSync(kernel,'utf8');
    const marker=/matched_scope:\s*scope,\s*candidates\s*\}/;assert.match(source,marker);
    writeFileSync(kernel,source.replace(marker,"matched_scope: scope, candidates: query.term === 'gate' && scope === 'root' ? [candidates[0], candidates[0]] : candidates }"));
    const result=spawnSync(process.execPath,['--input-type=module','-e',"import {realData} from './test/corpus.ts'; await realData();"],{cwd:root,env:testEnvironment(npmEnvironment(process.env)),encoding:'utf8',timeout:120000});
    assert.notEqual(result.status,0,'The corpus accepted two copies of one witness');
    assert.match(result.stderr,/AssertionError/);assert.match(result.stderr,/gate-door/);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('corpus verifies full source digests and labels unavailable full sources as unverified',()=>{
  const text = 'Selected public passage';
  const full = Buffer.from(text + '\nAdditional full document content');
  const source = { repository: 'public/corpus', revision: 'fixed-revision', path: 'README.md', sha256: createHash('sha256').update(full).digest('hex'), selected_sha256: createHash('sha256').update(text).digest('hex'), terms: {} };
  const verified = sourceReceipt(source, text, full);
  assert.equal(verified.source_sha256, source.sha256);
  assert.equal(verified.unverified_source_sha256, undefined);
  assert.throws(()=>sourceReceipt({...source,sha256:'0'.repeat(64)},text,full),/Full source digest mismatch/);
  assert.throws(()=>sourceReceipt(source,text,Buffer.from(text)),/Full source digest mismatch/);
  assert.throws(()=>sourceReceipt(source,text+'changed',full),/Selected source digest mismatch/);
  const offline = sourceReceipt(source,text);
  assert.equal(offline.source_sha256,undefined);
  assert.equal(offline.unverified_source_sha256,source.sha256);
});
