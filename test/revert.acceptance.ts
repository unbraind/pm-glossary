/** Behavioral mutation proofs run only in disposable copies of emitted code. */
import { mkdtempSync, cpSync, symlinkSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { testEnvironment, npmEnvironment } from '../scripts/environment.ts';

const changes=[
  {name:'ambiguous resolver reduced to first candidate',file:'kernel.js',pattern:/const candidates = ([^\n]+)\.sort\(([^\n]+)\);/,replacement:'const candidates = $1.sort($2).slice(0, 1);',test:'test/core.test.ts',filter:'alias collisions'},
  {name:'native guarded update replaced by unconditional write',file:'api.js',pattern:/const checked = await host\.client\.withExpectedItemRevisions\(\[\{ id: snapshot.id, itemHash: snapshot.revision \}\], \(\) => host\.client\.update\(snapshot.id, (\{[^\n]+\})\)\);/,replacement:'const checked = { result: await host.client.update(snapshot.id, $1), checked: [snapshot.id], unchecked: [] };',test:'test/concurrency.test.ts',filter:'before_update preserves'},
  {name:'SDK secret admission check removed',file:'schema.js',pattern:/scanMutationSecrets\(value\)\.length === 0/,replacement:'true',test:'test/core.test.ts',filter:'privacy and strict'},
];
for(const change of changes){
  const root=mkdtempSync(join(tmpdir(),'glossary-revert-'));
  try{
    cpSync('dist',join(root,'dist'),{recursive:true});cpSync('test',join(root,'test'),{recursive:true});cpSync('scripts',join(root,'scripts'),{recursive:true});cpSync('package.json',join(root,'package.json'));cpSync('manifest.json',join(root,'manifest.json'));symlinkSync(join(process.cwd(),'node_modules'),join(root,'node_modules'),'dir');
    const file=join(root,'dist/src',change.file);const before=readFileSync(file,'utf8');assert.match(before,change.pattern);writeFileSync(file,before.replace(change.pattern,change.replacement));
    const result=spawnSync(process.execPath,['--test','--test-concurrency=2',`--test-name-pattern=${change.filter}`,change.test],{cwd:root,env:testEnvironment(npmEnvironment(process.env)),encoding:'utf8',timeout:120000});
    assert.notEqual(result.status,0,`Behavioral revert unexpectedly passed: ${change.name}`);assert.match(result.stdout+result.stderr,/AssertionError|Missing expected rejection/);console.log(`EXPECTED FAIL: ${change.name}`);
  }finally{rmSync(root,{recursive:true,force:true});}
}
const green=spawnSync(process.execPath,['--test','--test-concurrency=2','--test-name-pattern=alias collisions|privacy and strict','test/core.test.ts'],{env:testEnvironment(npmEnvironment(process.env)),stdio:'inherit'});assert.equal(green.status,0);console.log('revert-gate: 3 behavioral failures; unchanged implementation passes');
