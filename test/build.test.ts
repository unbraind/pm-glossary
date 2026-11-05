import test from 'node:test';
import { decode } from '@toon-format/toon';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, symlinkSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { npmEnvironment, testEnvironment } from '../scripts/environment.ts';

test('clean-checkout CI and standalone typecheck build before checking emitted test imports',()=>{
  const root=mkdtempSync(join(tmpdir(),'glossary-clean-build-'));
  try{
    for(const file of ['src','scripts','test','index.ts','tsconfig.json','tsconfig.test.json','package.json'])cpSync(file,join(root,file),{recursive:true});
    symlinkSync(join(process.cwd(),'node_modules'),join(root,'node_modules'),'dir');
    const env=testEnvironment(npmEnvironment(process.env));
    const run=(command:string)=>spawnSync('npm',['run',command],{cwd:root,env,encoding:'utf8',timeout:120000});
    const workflow=readFileSync('.github/workflows/ci.yml','utf8');
    const steps=[...workflow.matchAll(/^        run: npm run (build|typecheck)$/gm)].map(match=>match[1]);
    assert.deepEqual(steps,['build','typecheck']);assert.equal(existsSync(join(root,'dist')),false);
    for(const step of steps){const result=run(step);assert.equal(result.status,0,result.stdout+result.stderr);}
    rmSync(join(root,'dist'),{recursive:true});
    const standalone=run('typecheck');assert.equal(standalone.status,0,standalone.stdout+standalone.stderr);
    rmSync(join(root,'dist'),{recursive:true});
    // A minimal acceptance consumer isolates the script's real build prerequisite.
    writeFileSync(join(root,'test/revert.acceptance.ts'),"import assert from 'node:assert/strict';import {exitCode} from '../dist/index.js';assert.equal(exitCode('not_found'),3);\n");
    const reverts=run('test:revert');assert.equal(reverts.status,0,reverts.stdout+reverts.stderr);
  }finally{rmSync(root,{recursive:true,force:true});}
});


test('linked focused test commands build emitted imports on a clean checkout',()=>{
  for(const item of ['pm-glossary-c1dt','pm-glossary-tpwk']){
    const tracker=decode(readFileSync(`.agents/pm/features/${item}.toon`,'utf8')) as {tests:{command:string}[]};
    const focused=tracker.tests.filter(entry=>entry.command.includes('node --test'));
    assert.ok(focused.length>0);
    for(const entry of focused)assert.match(entry.command,/^npm run build && node --test /,`${item}: ${entry.command}`);
  }
});
