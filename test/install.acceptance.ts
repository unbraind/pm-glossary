import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { npmEnvironment } from '../scripts/environment.ts';

/** Execute a captured command with bounded output and credential-free npm settings. */
function execute(executable:string,args:string[],cwd:string,env:NodeJS.ProcessEnv,input?:string,expected=0):string {
  const result=spawnSync(executable,args,{cwd,env,input,encoding:'utf8',timeout:300000,maxBuffer:4*1024*1024});
  assert.equal(result.status,expected,`${executable} ${args.slice(0,4).join(' ')}: ${result.stderr.slice(-2000)} ${result.stdout.slice(-2000)}`);return result.stdout || (expected === 0 ? result.stdout : result.stderr);
}

test('one packed artifact works with npm, bun, npx, bunx and native SDK without Git',()=>{
  const root=mkdtempSync(join(tmpdir(),'glossary-packed-'));const env=npmEnvironment(process.env);delete env.NODE_V8_COVERAGE;
  try{
    const packed=JSON.parse(execute('npm',['pack','--ignore-scripts','--json','--pack-destination',root],process.cwd(),env)) as {filename:string;files:{path:string}[]}[];
    const archive=join(root,packed[0].filename);const digest=createHash('sha256').update(readFileSync(archive)).digest('hex');
    const bin=join(root,'bin');mkdirSync(bin);const bun=execFileSync('bash',['-c','command -v bun'],{encoding:'utf8',env}).trim();
    symlinkSync('/bin/sh',join(bin,'sh'));symlinkSync(process.execPath,join(bin,'node'));symlinkSync(bun,join(bin,'bun'));symlinkSync(bun,join(bin,'bunx'));
    const npm=execFileSync('bash',['-c','command -v npm'],{encoding:'utf8',env}).trim();const npx=execFileSync('bash',['-c','command -v npx'],{encoding:'utf8',env}).trim();
    symlinkSync(npm,join(bin,'npm'));symlinkSync(npx,join(bin,'npx'));
    for(const manager of ['npm','bun']){
      const cwd=join(root,manager);mkdirSync(cwd);writeFileSync(join(cwd,'package.json'),JSON.stringify({name:'glossary-consumer',version:'1.0.0',private:true,type:'module'}));
      execute(manager,manager==='npm'?['install','--ignore-scripts','--no-audit','--no-fund',archive,'@unbrained/pm-cli@2026.11.4']:['add','--ignore-scripts',archive,'@unbrained/pm-cli@2026.11.4'],cwd,env);
      const safe={...env,PM_PATH:join(cwd,'.agents/pm'),PM_AUTHOR:'consumer',PATH:bin,GIT_CEILING_DIRECTORIES:root,HOME:join(root,'isolated-home')};mkdirSync(safe.HOME,{recursive:true});
      const runner=manager==='npm'?'npx':'bunx';const prefix=manager==='npm'?['--no-install','pm']:['--bun','--no-install','pm'];
      const run=(args:string[],input?:string,expected=0)=>execute(runner,[...prefix,...args],cwd,safe,input,expected);
      run(['init','packed','--defaults','--agent-guidance','skip','--no-merge-fence']);
      run(['package','install','./node_modules/pm-glossary']);
      run(['glossary','--help']);const contracts=JSON.parse(run(['contracts','--json','--output-budget','unbounded']));assert.ok(contracts);
      const budgetRefusal=JSON.parse(run(['glossary','create','--id','packed-lexicon','--op','birth','--input','-','--json','--output-budget','1600'],JSON.stringify({title:'Public terminology',domain_key:'release',scopes:[{scope_key:'root',parent:null}]}),2));assert.match(budgetRefusal.detail,/not a read surface/);
      const small=JSON.parse(run(['glossary','create','--id','packed-lexicon','--op','birth','--input','-','--json','--budget','1'],JSON.stringify({title:'Public terminology',domain_key:'release',scopes:[{scope_key:'root',parent:null}]}),2));assert.equal(small.refusal.code,'output_budget');
      const birth=JSON.parse(run(['glossary','create','--id','packed-lexicon','--op','birth','--input','-','--json','--budget','1600'],JSON.stringify({title:'Public terminology',domain_key:'release',scopes:[{scope_key:'root',parent:null}]})));
      assert.equal(birth.replayed,false);
      const defined=JSON.parse(run(['glossary','define','packed-lexicon','--revision',birth.revision,'--op','gate','--input','-','--json'],JSON.stringify({sense:{sense_id:'gate',term:'gate',scope_key:'root',language:'en',definition:'Reviewed condition.'}})));
      assert.equal(defined.ok,true);
      const alias=JSON.parse(run(['glossary','alias','packed-lexicon','--revision',defined.revision,'--op','alias-gate','--input','-','--json'],JSON.stringify({alias:{alias_id:'door',term:'door',scope_key:'root',language:'en',sense_id:'gate'}})));assert.equal(alias.ok,true);
      const checked=JSON.parse(run(['glossary','check','packed-lexicon','--json']));assert.equal(checked.ok,true,JSON.stringify(checked));assert.equal(checked.data.findings.length,0);
      const projection=JSON.parse(run(['glossary','resolve','packed-lexicon','--term','gate','--scope','root','--output-include','data','--json'],undefined,2));assert.match(projection.detail,/not a read surface/);
      const page=JSON.parse(run(['glossary','packet','packed-lexicon','--scope','root','--limit','1','--budget','1600','--json']));assert.ok(page.continuation);
      const next=JSON.parse(run(['glossary','packet','packed-lexicon','--scope','root','--limit','1','--cursor',page.continuation,'--json']));assert.equal(next.data.rows.length,1);
      assert.equal(JSON.parse(run(['glossary','resolve','packed-lexicon','--term','gate','--scope','root','--budget','1','--json'],undefined,2)).refusal.code,'output_budget');const serialized=run(['glossary','resolve','packed-lexicon','--term','gate','--scope','root','--json']);const resolution=JSON.parse(serialized);assert.ok(Buffer.byteLength(serialized)<=resolution.output_fit.output_bytes);assert.ok(Math.ceil(Buffer.byteLength(serialized)/4)<=resolution.output_fit.token_budget);assert.equal(resolution.data.candidates[0].sense_id,'gate');assert.equal(resolution.data.candidates[0].definition,'Reviewed condition.');assert.equal(resolution.data.usable,true);
      assert.match(run(['glossary','resolve','packed-lexicon','--term','gate','--scope','root']),/resolved/);
      const refused=JSON.parse(run(['glossary','define','packed-lexicon','--revision',birth.revision,'--op','stale','--input','-','--json'],JSON.stringify({sense:{sense_id:'gate',term:'gate',scope_key:'root',language:'en',definition:'Other.'}}),4));assert.equal(refused.refusal.code,'revision_conflict');
      const malformed=JSON.parse(run(['glossary','define','packed-lexicon','--revision',defined.revision,'--op','bad','--input','-','--json'],'\u001b[31m',2));assert.equal(malformed.refusal.code,'invalid_input');
      writeFileSync(join(cwd,'sdk.mjs'),"import assert from 'node:assert/strict';import {createDirectoryHost,resolveTerm,defineSense,readGlossary} from 'pm-glossary';const host=createDirectoryHost(process.cwd()+'/.agents/pm','consumer');const result=await resolveTerm(host,{id:'packed-lexicon',term:'gate',scope_key:'root'});assert.equal(result.resolution,'resolved');assert.equal((await readGlossary(host,'packed-lexicon')).state.senses.length,1);console.log('SDK OK');\n");
      assert.match(execute(manager==='npm'?'node':'bun',['sdk.mjs'],cwd,safe),/SDK OK/);
    }
    assert.equal(createHash('sha256').update(readFileSync(archive)).digest('hex'),digest);
    writeFileSync('packed-receipt.local.json',JSON.stringify({sha256:digest,files:packed[0].files.map(file=>file.path),journeys:2,commands:['npm','bun','npx','bunx'],git_in_path:false},null,2));
  }finally{rmSync(root,{recursive:true,force:true});}
});
