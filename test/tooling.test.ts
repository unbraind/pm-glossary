import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, symlinkSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { testEnvironment, npmEnvironment } from '../scripts/environment.ts';

test('coverage gate rejects missing source, weakened policy, ignored code and empty tests',()=>{
  const root=mkdtempSync(join(tmpdir(),'glossary-gate-'));
  try{
    for(const dir of ['scripts','src/nested','dist/src/nested','test'])mkdirSync(join(root,dir),{recursive:true});
    cpSync('scripts/coverage-gate.ts',join(root,'scripts/coverage-gate.ts'));cpSync('scripts/environment.ts',join(root,'scripts/environment.ts'));cpSync('scripts/inventory.ts',join(root,'scripts/inventory.ts'));symlinkSync(join(process.cwd(),'node_modules'),join(root,'node_modules'),'dir');
    const manifest={type:'module',coverageGate:{thresholds:{statements:100,branches:100,functions:100,lines:100},ignore:[] as string[]}};
    const save=()=>writeFileSync(join(root,'package.json'),JSON.stringify(manifest));save();
    const code='export function answer(flag){let result=1;if(flag){result=2;}return result;}';writeFileSync(join(root,'index.ts'),code);writeFileSync(join(root,'dist/index.js'),code);
    const run=()=>spawnSync(process.execPath,['scripts/coverage-gate.ts'],{cwd:root,env:testEnvironment(npmEnvironment(process.env)),encoding:'utf8',timeout:30000});
    writeFileSync(join(root,'src/nested/missing.ts'),'export const missing=1;');const unemitted=run();assert.notEqual(unemitted.status,0);assert.match(unemitted.stderr,/Emitted source inventory differs/);
    writeFileSync(join(root,'dist/src/nested/missing.js'),'export const missing=1;');const notLoaded=run();assert.notEqual(notLoaded.status,0);assert.match(notLoaded.stdout+notLoaded.stderr,/nonzero|unskipped|absent/);
    writeFileSync(join(root,'test/positive.test.ts'),"import test from 'node:test';import assert from 'node:assert/strict';import {answer} from '../dist/index.js';test('both paths',()=>{assert.equal(answer(true),2);assert.equal(answer(false),1);});");
    const absent=run();assert.notEqual(absent.status,0);assert.match(absent.stderr,/production source is absent/);
    rmSync(join(root,'src/nested/missing.ts'));rmSync(join(root,'dist/src/nested/missing.js'));const green=run();assert.equal(green.status,0,green.stderr);
    const summary=JSON.parse(readFileSync(join(root,'coverage/summary.json'),'utf8'));assert.ok(summary.statements.total>summary.lines.total);assert.equal(summary.statements.covered,summary.statements.total);
    manifest.coverageGate.thresholds.lines=99;save();assert.match(run().stderr,/exactly 100 percent/);manifest.coverageGate.thresholds.lines=100;
    manifest.coverageGate.ignore=['src/nested/missing.ts'];save();assert.match(run().stderr,/without ignores/);manifest.coverageGate.ignore=[];save();
    writeFileSync(join(root,'dist/index.js'),'/* istanbul ignore next */ export const value=1;');assert.match(run().stderr,/Coverage ignores are forbidden/);
  }finally{rmSync(root,{recursive:true,force:true});}
});
