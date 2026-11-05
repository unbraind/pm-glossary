import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { guardSubmitted } from '../dist/src/schema.js';
import { npmEnvironment, testEnvironment } from '../scripts/environment.ts';

test('privacy email matching stays prompt on adversarial maximal strings',()=>{
  const start=process.cpuUsage();
  for(let i=0;i<12;i++){
    assert.throws(()=>guardSubmitted('+'.repeat(7999)+'@'),{code:'invalid_input'});
    guardSubmitted('a'.repeat(8000));
    guardSubmitted('a@'+'.'.repeat(7998));
  }
  const elapsed=process.cpuUsage(start);const milliseconds=(elapsed.user+elapsed.system)/1000;
  assert.ok(milliseconds<500,`Adversarial privacy checks used ${milliseconds} ms CPU`);
  for(const email of ['person@example.invalid','Text (a.b+c-d@example.invalid).','a@b.co','a@'+'.'.repeat(7988)+'aa.invalid'])assert.throws(()=>guardSubmitted(email),{code:'invalid_input'});
  for(const text of ['ordinary prose','mention a@b without a public suffix','a'.repeat(7999)+'@'])assert.doesNotThrow(()=>guardSubmitted(text));
});

test('pack inventory accepts nested emitted modules and rejects undeclared assets',()=>{
  const root=mkdtempSync(join(tmpdir(),'glossary-pack-'));
  try{
    for(const dir of ['scripts','src/nested','dist/src/nested','docs'])mkdirSync(join(root,dir),{recursive:true});
    for(const name of ['pack-gate','inventory','environment'])cpSync(`scripts/${name}.ts`,join(root,`scripts/${name}.ts`));
    const manifest={name:'synthetic-glossary-fixture',version:'1.0.0',type:'module',files:['dist','docs/real-data.md','extra.txt']};
    writeFileSync(join(root,'package.json'),JSON.stringify(manifest));
    writeFileSync(join(root,'index.ts'),'export {};');writeFileSync(join(root,'src/nested/reader-v2.ts'),'export {};');
    for(const name of ['index','src/nested/reader-v2'])for(const extension of ['.js','.js.map','.d.ts','.d.ts.map'])writeFileSync(join(root,`dist/${name}${extension}`),'');
    writeFileSync(join(root,'docs/real-data.md'),'Public text.');
    const run=()=>spawnSync(process.execPath,['scripts/pack-gate.ts'],{cwd:root,env:testEnvironment(npmEnvironment(process.env)),encoding:'utf8',timeout:30000});
    const green=run();assert.equal(green.status,0,green.stdout+green.stderr);
    writeFileSync(join(root,'dist/src/stale.js'),'');assert.match(run().stderr,/stale or undeclared/);rmSync(join(root,'dist/src/stale.js'));
    writeFileSync(join(root,'extra.txt'),'Synthetic undeclared text.');assert.match(run().stderr,/Package allowlist failed: extra.txt/);
    rmSync(join(root,'extra.txt'));rmSync(join(root,'dist/index.js'));assert.match(run().stderr,/entrypoint is missing/);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('installation docs bootstrap local runners and declare source corpus prerequisites',()=>{
  const readme=readFileSync('README.md','utf8').split('# After the owner approves initial publication:')[1].split('```')[0];
  for(const [install,activate] of [
    ['npm install pm-glossary @unbrained/pm-cli','npx --no-install pm package install npm:pm-glossary'],
    ['bun add pm-glossary @unbrained/pm-cli','bunx --bun --no-install pm package install npm:pm-glossary'],
  ]){
    assert.ok(readme.includes(install)&&readme.includes(activate));assert.ok(readme.indexOf(install)<readme.indexOf(activate));
  }
  assert.doesNotMatch(readme,/^pm package install/m);
  const prerequisites=readFileSync('docs/real-data.md','utf8').split('| Public input |')[0];
  assert.match(prerequisites,/source checkout/);assert.match(prerequisites,/`\.\.\/pm-vcs`/);
  assert.match(prerequisites,/revision pinned in `test\/fixtures\/public-corpus.json`/);
  assert.match(prerequisites,/npm package does not include.*test fixtures.*runner/);
});
