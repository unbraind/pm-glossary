import { testTime } from './support/time.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { guardSubmitted } from '../dist/src/schema.js';
import { npmEnvironment, testEnvironment } from '../scripts/environment.ts';

test('privacy email matching stays prompt on adversarial maximal strings',{timeout:testTime(30000)},()=>{
  const budget=testTime(500);
  const start=process.cpuUsage();
  for(let i=0;i<12;i++){
    assert.throws(()=>guardSubmitted('+'.repeat(7999)+'@'),{code:'invalid_input'});
    guardSubmitted('a'.repeat(8000));
    guardSubmitted('a@'+'.'.repeat(7998));
  }
  const elapsed=process.cpuUsage(start);const milliseconds=(elapsed.user+elapsed.system)/1000;
  assert.ok(milliseconds<budget,`Adversarial privacy checks used ${milliseconds} ms CPU (harness budget ${budget})`);
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
    const run=()=>spawnSync(process.execPath,['scripts/pack-gate.ts'],{cwd:root,env:testEnvironment(npmEnvironment(process.env)),encoding:'utf8',timeout:testTime(30000)});
    const green=run();assert.equal(green.status,0,green.stdout+green.stderr);
    writeFileSync(join(root,'dist/src/stale.js'),'');assert.match(run().stderr,/stale or undeclared/);rmSync(join(root,'dist/src/stale.js'));
    writeFileSync(join(root,'extra.txt'),'Synthetic undeclared text.');assert.match(run().stderr,/Package allowlist failed: extra.txt/);
    rmSync(join(root,'extra.txt'));rmSync(join(root,'dist/index.js'));assert.match(run().stderr,/entrypoint is missing/);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('installation docs bootstrap local runners and declare source corpus prerequisites',()=>{
  const source = readFileSync('README.md', 'utf8').replaceAll('\r\n', '\n');
  for (const fixture of [source, source.replaceAll('\n', '\r\n')]) {
    const readme = fixture.replaceAll('\r\n', '\n').split(/^## Install$/m)[1].split(/^## /m)[0];
    const blocks=[...readme.matchAll(/```sh\n([\s\S]*?)```/g)].map(match=>match[1]);
    for(const [install,activate] of [
      ['npm install pm-glossary @unbrained/pm-cli','npx --no-install pm package install npm:pm-glossary'],
      ['bun add pm-glossary @unbrained/pm-cli','bunx --bun --no-install pm package install npm:pm-glossary'],
    ]){
      const block=blocks.find(block=>block.includes(install));
      assert.ok(block);assert.ok(block.includes(activate));assert.ok(block.indexOf(install)<block.indexOf(activate));
    }
    assert.doesNotMatch(readme,/^pm package install/m);
  }
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
    assert.equal(readme.slice(0,offset).trimEnd().split('\n').at(-1)?.trimStart().replace(/ \|\| exit 1$/, ''),`${runner} pm init terminology --defaults --agent-guidance skip`);
  }
});


test('README glossary examples use the installed local CLI',()=>{
  const readme=readFileSync('README.md','utf8');
  const examples=[...readme.matchAll(/`([^`\n]*\bpm glossary [^`\n]+)`/g)].map(match=>match[1]);
  assert.equal(examples.length,8);
  for(const example of examples)assert.match(example,/^(?:npx --no-install|bunx --bun --no-install) pm glossary /);
  assert.ok(examples.some(example=>/pm glossary bind \S+ --revision <owner-hash> --op bind-release --input -$/.test(example)));
  assert.ok(examples.some(example=>/pm glossary check \S+ --binding release-use --json$/.test(example)));
  assert.match(readme,/`npx --no-install pm package install` is the explicit activation step/);
});


test('architecture describes email detection as a heuristic',()=>{
  const architecture=readFileSync('ARCHITECTURE.md','utf8');
  assert.match(architecture,/common email shapes \(email detection is a heuristic\)/);
  assert.match(architecture,/Stored reads validate schema without retroactively imposing new submission policy/);
  guardSubmitted('a@b');
});

test('real-data docs disclose the report outside the scratch copy',()=>{
  const documentation=readFileSync('docs/real-data.md','utf8').split('Run this command')[0];
  assert.match(documentation,/writes `real-data\.local\.json` in the current directory, outside the scratch copy, overwriting any existing report/);
  assert.match(documentation,/glossary writes only to that scratch copy/);
  assert.match(documentation,/original tracker is read-only/);
});

test('budget docs distinguish retryable size from the hard-ceiling refusal',()=>{
  const documentation=readFileSync('README.md','utf8').split('The default budget is')[1].split('The optional extension-owned')[0];
  assert.match(documentation,/refuses with `output_budget`/);
  assert.match(documentation,/within the 32 KiB hard ceiling.*numeric `minimum_usable_budget`/);
  assert.match(documentation,/exceed that ceiling, `minimum_usable_budget` is `null`/);
  assert.match(documentation,/narrow the scope or partition the reviewed meanings/);
});

test('reviewed revision meaning describes repository snapshots',()=>{
  const corpus=JSON.parse(readFileSync('test/fixtures/public-corpus.json','utf8')) as {repository:string;terms:Record<string,string>}[];
  const gold=JSON.parse(readFileSync('test/fixtures/gold-meanings.json','utf8')) as Record<string,Record<string,string>>;
  const meaning='A repository snapshot selected by a revision argument, including branch and merge snapshots.';
  assert.equal(corpus.find(source=>source.repository==='unbraind/pm-vcs')!.terms.revision,meaning);
  assert.equal(gold['pm-vcs'].revision,meaning);
  const source=readFileSync('test/fixtures/pm-vcs.md','utf8');
  assert.match(source,/diff \[from\] \[to\].*two revisions' trees/);
  assert.match(source,/branch \[name\].*--at/);assert.match(source,/merge <rev>.*Three-way merge/);
});

test('trusted publishing requires the direct-publish allowed action', () => {
  const readme = readFileSync('README.md', 'utf8');
  assert.match(readme, /select `npm publish` under \*\*Allowed actions\*\*/);
  assert.match(readme, /created after September 3, 2026 default to\s+`npm stage publish` only/);
  assert.match(readme, /https:\/\/docs\.npmjs\.com\/trusted-publishers\//);
});

test('documented archive installs guard setup and verify the installed version', t => {
  const readme = readFileSync('README.md', 'utf8').replaceAll('\r\n', '\n');
  const blocks = [...readme.matchAll(/^```sh\n([\s\S]*?)^```$/gm)]
    .map(match => match[1])
    .filter(block => /^[ \t]*(?:tarball=|(?:npm install|bun add) "\$archive")/m.test(block));
  assert.ok(blocks.length > 0, 'The README must document an archive installation');
  const source = mkdtempSync(join(tmpdir(), 'readme-pack-'));
  t.after(() => rmSync(source, { recursive: true, force: true }));
  writeFileSync(join(source, 'package.tgz'), 'synthetic archive');
  writeFileSync(join(source, 'package.json'), '{"version":"1.2.3"}');
  const installed = join(source, 'consumer', 'node_modules', 'pm-glossary');
  mkdirSync(installed, { recursive: true });

  const stubs = String.raw`
scenario=$1
source=$PWD
npm() {
  case "$1" in
    ci) return 0 ;;
    pack)
      printf 'pack\n' >&2
      case "$scenario" in
        pack_failed) printf '%s\n' package.tgz; return 33 ;;
        pack_empty) return 0 ;;
        pack_missing) printf '%s\n' missing.tgz; return 0 ;;
        *) printf '%s\n' package.tgz ;;
      esac
      ;;
    install) install_archive ;;
    *) return 90 ;;
  esac
}
bun() { [ "$1" = add ] && install_archive; }
install_archive() {
  printf 'install\n' >&2
  [ "$PWD" = "$source/consumer" ] && [ "$scenario" != install_failed ]
}
mktemp() {
  printf 'mktemp\n' >&2
  printf '%s\n' "$source/consumer"
  [ "$scenario" != mktemp_failed ]
}
cd() {
  printf 'cd\n' >&2
  [ "$scenario" != cd_failed ] && command cd "$@"
}
npx() { printf 'cli\n' >&2; }
bunx() { printf 'cli\n' >&2; }
`;
  const cases = [
    ['pack_failed', 'pack\n', 1],
    ['pack_empty', 'pack\n', 1],
    ['pack_missing', 'pack\n', 1],
    ['mktemp_failed', 'pack\nmktemp\n', 1],
    ['cd_failed', 'pack\nmktemp\ncd\n', 1],
    ['install_failed', 'pack\nmktemp\ncd\ninstall\n', 1],
    ['version_match', 'pack\nmktemp\ncd\ninstall\n', 0],
    ['version_mismatch', 'pack\nmktemp\ncd\ninstall\n', 1],
  ] as const;
  for (const block of blocks) {
    assert.match(block.trim(), /^\(\n[\s\S]*\n\)$/, 'The archive install must run in a subshell');
    const cliTrace = 'cli\n'.repeat([...block.matchAll(/^\s*(?:npx|bunx) /gm)].length);
    for (const [scenario, trace, status] of cases) {
      const version = scenario === 'version_mismatch' ? '9.9.9' : '1.2.3';
      writeFileSync(join(installed, 'package.json'), JSON.stringify({ version }));
      const result = spawnSync('sh', ['-c', `${stubs}\n${block}\nprintf 'shell continued: %s\\n' "$?"`, 'readme-pack', scenario], {
        cwd: source,
        encoding: 'utf8',
      });
      assert.ifError(result.error);
      const versionCheck = scenario.startsWith('version_');
      const mismatch = scenario === 'version_mismatch' ? 'Expected version 1.2.3, installed 9.9.9.\n' : '';
      assert.equal(result.stderr, trace + (versionCheck ? cliTrace : '') + mismatch, scenario);
      assert.equal(result.status, 0, `${scenario}: the calling shell must continue`);
      assert.equal(result.stdout, `shell continued: ${status}\n`, scenario);
    }
  }
});
