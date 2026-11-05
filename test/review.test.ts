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


test('documentation matches measured receipt and privacy admission limits',()=>{
  const document=readFileSync('docs/real-data.md','utf8');
  const receipts=JSON.parse(document.split('```json\n')[1].split('```')[0]) as {repository:string;selected_bytes:number}[];
  for(const receipt of receipts){
    const domain=receipt.repository.split('/')[1];const bytes=Buffer.byteLength(readFileSync(`test/fixtures/${domain}.md`));
    assert.equal(receipt.selected_bytes,bytes);
    const row=document.split('\n').find(line=>line.startsWith(`| ${receipt.repository} README |`));assert.ok(row);assert.equal(Number(row.split('|')[3].trim()),bytes);
  }
  const readme=readFileSync('README.md','utf8');assert.match(readme,/Email detection is a heuristic/);assert.match(readme,/`a@b` without a public suffix may pass/);assert.match(readme,/Do not rely on it to prevent personal data from entering retained history/);
  guardSubmitted('a@b');assert.throws(()=>guardSubmitted('a@b.invalid'),{code:'invalid_input'});
});

test('npm and Bun setup each initialize before activating in fresh consumers',()=>{
  const readme=readFileSync('README.md','utf8');
  for(const suffix of ['./node_modules/pm-glossary','npm:pm-glossary'])for(const runner of ['npx --no-install','bunx --bun --no-install']){
    const activation=`${runner} pm package install ${suffix}`;const offset=readme.indexOf(activation);assert.ok(offset>=0);
    assert.equal(readme.slice(0,offset).trimEnd().split('\n').at(-1),`${runner} pm init terminology --defaults --agent-guidance skip`);
  }
});


test('README glossary examples use the installed local CLI',()=>{
  const readme=readFileSync('README.md','utf8');
  const examples=[...readme.matchAll(/`([^`\n]*\bpm glossary [^`\n]+)`/g)].map(match=>match[1]);
  assert.equal(examples.length,7);
  for(const example of examples)assert.match(example,/^(?:npx --no-install|bunx --bun --no-install) pm glossary /);
  assert.match(readme,/`npx --no-install pm package install` is the explicit activation step/);
});
