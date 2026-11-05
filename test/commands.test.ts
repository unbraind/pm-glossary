import test from 'node:test';
import assert from 'node:assert/strict';
import { createExtensionTestHarness, decodeToon } from '@unbrained/pm-cli/sdk/testing';
import extension, { readGlossary } from '../dist/index.js';
import { runCommand } from '../dist/src/commands.js';
import type { CommandHandlerContext } from '@unbrained/pm-cli/sdk/authoring';
import { fixture } from './helpers.ts';

test('native extension harness executes every command, contracts and scoped renderers',async t=>{
  const {pmRoot,id}=await fixture(t);const ext=await createExtensionTestHarness(extension,{capabilities:['commands','schema','renderers']});t.after(()=>ext.deactivate());
  for(const name of ['create','define','alias','resolve','check','packet'])ext.assertCommandContract({command:`glossary ${name}`});
  ext.assertItemField({name:'glossary_state',type:'object'});ext.assertItemType({name:'Glossary',folder:'glossary'});
  const run=(command:string,args:string[]=[],options:Record<string,unknown>={},global:Record<string,unknown>={})=>ext.runCommand({command:`glossary ${command}`,args,options,global,pmRoot}).then(value=>{if(value.cause)throw value.cause;if(value.exitCode)throw new Error(value.errorCode);assert.equal(value.handled,true);return value.result;});
  const created=await run('create',[],{id:'corpus-cli',op:'create-cli',input:JSON.stringify({title:'CLI data',domain_key:'cli',scopes:[{scope_key:'root',parent:null}]})}) as {revision:string};
  const defined=await run('define',['corpus-cli'],{op:'define-cli',revision:created.revision,input:JSON.stringify({sense:{sense_id:'gate',term:'gate',scope_key:'root',language:'en',definition:'A reviewed condition.'}})}) as {revision:string};
  await run('alias',['corpus-cli'],{op:'alias-cli',revision:defined.revision,input:JSON.stringify({alias:{alias_id:'door',term:'door',scope_key:'root',language:'en',sense_id:'gate'}})});
  const resolved=await run('resolve',['corpus-cli'],{term:'door',scope:'root',language:'en'});assert.equal((resolved as {ok:boolean}).ok,true);
  await run('check',['corpus-cli']);await run('check',['corpus-cli'],{scope:'root'});await run('packet',['corpus-cli'],{scope:'root',limit:'1'});
  const json=ext.assertRendererOverride({format:'json'});const toon=ext.assertRendererOverride({format:'toon'});
  // Registered renderer functions are exercised through the public harness renderer runner.
  const jsonText=await ext.runRendererOverride({format:'json',command:'glossary resolve',result:resolved});const toonText=await ext.runRendererOverride({format:'toon',command:'glossary resolve',result:resolved});
  assert.deepEqual(JSON.parse(String(jsonText.rendered)),decodeToon(String(toonText.rendered)));assert.ok(json);assert.ok(toon);
  assert.equal((await run('resolve',['corpus-cli'],{term:'gate',scope:'root',budget:'1600'}) as {ok:boolean}).ok,true);
  assert.equal((await run('resolve',['corpus-cli'],{term:'gate',scope:'root'},{outputBudget:'unbounded'}) as {ok:boolean}).ok,true);
  const paged=await run('packet',['corpus-cli'],{scope:'root',limit:1}) as {continuation:string};assert.ok(paged.continuation);await run('packet',['corpus-cli'],{scope:'root',limit:1},{outputCursor:paged.continuation});await run('packet',['corpus-cli'],{scope:'root',limit:1,cursor:paged.continuation});
  for(const [command,args,options,global] of [
    ['resolve',[id],{term:'gate'},{}],['packet',[id],{scope:'root',limit:'1.5'},{}],['create',[],{id:'corpus-fail',op:'fail',input:'[]'},{}],['create',[],{id:'corpus-fail',op:'fail',input:'{'},{}],['create',[],{id:'corpus-fail',op:'fail',input:'"x"'},{}],['create',[],{id:'corpus-fail',op:'fail',input:'x'.repeat(32769)},{}],['create',[],{id:'corpus-fail',op:'fail',input:'{"id":"other"}'},{}],['create',[],{id:'corpus-fail',op:'fail',input:'{}'},{outputBudget:'1'}],['resolve',[id],{term:'gate',scope:'root'},{outputBudget:'broken'}],['resolve',[id],{term:'gate',scope:'root'},{outputInclude:'data'}],['resolve',[id],{term:'gate',scope:'root'},{outputCursor:'unusable'}],['resolve',[id],{term:['gate'],scope:'root'},{}],
  ] as const)await assert.rejects(run(command,[...args],options,global));
  assert.equal((await runCommand('resolve',{args:[],options:{},global:{},pm_root:pmRoot,command:'glossary resolve'} as CommandHandlerContext) as {ok:boolean}).ok,false);
});
