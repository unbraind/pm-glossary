import test from 'node:test';
import assert from 'node:assert/strict';
import { createExtensionTestHarness, decodeToon } from '@unbrained/pm-cli/sdk/testing';
import extension, { readGlossary, defineSense, resolveTerm, envelope, fitEnvelope } from '../dist/index.js';
import { runCommand } from '../dist/src/commands.js';
import type { GlossaryOutput } from '../dist/index.js';
import type { CommandHandlerContext } from '@unbrained/pm-cli/sdk/authoring';
import { fitOutputEnvelope } from '@unbrained/pm-cli/sdk';
import { fixture, request } from './helpers.ts';

test('native extension harness executes every command, contracts and scoped renderers',async t=>{
  const {pmRoot,id}=await fixture(t);const ext=await createExtensionTestHarness(extension,{capabilities:['commands','schema','renderers']});t.after(()=>ext.deactivate());
  for(const name of ['create','define','alias','resolve','check','packet'])ext.assertCommandContract({command:`glossary ${name}`});
  ext.assertItemField({name:'glossary_state',type:'object'});ext.assertItemType({name:'Glossary',folder:'glossary'});
  const run=(command:string,args:string[]=[],options:Record<string,unknown>={},global:Record<string,unknown>={})=>ext.runCommand({command:`glossary ${command}`,args,options,global,pmRoot}).then(value=>{if(value.cause)throw value.cause;if(value.exitCode){const result=value.result as GlossaryOutput;assert.ok(result.refusal);throw new Error(result.refusal.code);}assert.equal(value.handled,true);return value.result;});
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
  for(const [command,args,options,global,expected] of [
    ['resolve',[id],{term:'gate'},{},'invalid_input'],['packet',[id],{scope:'root',limit:'1.5'},{},'invalid_input'],['create',[],{id:'corpus-fail',op:'fail',input:'[]'},{},'invalid_input'],['create',[],{id:'corpus-fail',op:'fail',input:'{'},{},'invalid_input'],['create',[],{id:'corpus-fail',op:'fail',input:'"x"'},{},'invalid_input'],['create',[],{id:'corpus-fail',op:'fail',input:'x'.repeat(32769)},{},'invalid_input'],['create',[],{id:'corpus-fail',op:'fail',input:'{"id":"other"}'},{},'invalid_input'],['create',[],{id:'corpus-fail',op:'fail',input:'{}'},{outputBudget:'1'},'output_budget'],['resolve',[id],{term:'gate',scope:'root'},{outputBudget:'broken'},'invalid_input'],['resolve',[id],{term:'gate',scope:'root'},{outputInclude:'data'},'invalid_input'],['resolve',[id],{term:'gate',scope:'root'},{outputCursor:'unusable'},'invalid_input'],['resolve',[id],{term:['gate'],scope:'root'},{},'invalid_input'],
  ] as const)await assert.rejects(run(command,[...args],options,global),{message:expected});
  assert.equal((await runCommand('resolve',{args:[],options:{},global:{},pm_root:pmRoot,command:'glossary resolve'} as CommandHandlerContext) as {ok:boolean}).ok,false);
});


test('host renderers round-trip inert historical controls with quotes and backslashes',async t=>{
  const {host,id,native}=await fixture(t);
  await defineSense(host,await request(host,id,'historical'));
  const state=(await readGlossary(host,id)).state;
  const controls=Array.from({length:160},(_,code)=>code).filter(code=>code<32||code>=127).map(code=>String.fromCharCode(code)).join('');
  const bidi='\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069';
  const definition='Historical "quoted" \\path literal \\u009f \\u202e '+controls+bidi+' é 日本 😃';
  state.senses[0].definition=definition;
  for(const [index,text] of ['Legacy\u009f','Legacy\u202e','Literal \\u009f then "quote" \\slash\u2066'].entries()){
    state.senses.push({...state.senses[0],sense_id:`legacy-${index}`,definition:text});
  }
  await native.update(id,{message:'Synthetic historical text fixture',...{glossaryState:state}});
  const before=await native.readItemRevision(id);
  const result=await resolveTerm(host,{id,term:'historical',scope_key:'root'});
  assert.equal(result.candidates[0].definition,definition);
  const fitted=fitEnvelope(host,envelope(result,'root'),8192);
  const ext=await createExtensionTestHarness(extension,{capabilities:['commands','schema','renderers']});t.after(()=>ext.deactivate());
  const rendered:Record<string,string>={};
  for(const format of ['json','toon'] as const){
    const output=await ext.runRendererOverride({format,command:'glossary resolve',result:fitted});
    const text=String(output.rendered);rendered[format]=text;
    assert.doesNotMatch(text,/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u);
    const decoded=(format==='json'?JSON.parse(text):decodeToon(text)) as typeof fitted;
    assert.deepEqual(decoded,fitted);assert.ok(decoded.data&&'candidates' in decoded.data);assert.equal(decoded.data.candidates[0].definition,definition);
  }
  assert.ok(fitted.output_fit.output_bytes>=Math.max(...Object.values(rendered).map(text=>Buffer.byteLength(text+'\n'))));
  assert.deepEqual(await native.readItemRevision(id),before);
});

test('refusal envelopes use the host-pinned fitter like success envelopes',async()=>{
  let calls=0;
  const hostFitter=((...args:Parameters<typeof fitOutputEnvelope>)=>{calls+=1;return fitOutputEnvelope(...args);}) as typeof fitOutputEnvelope;
  const sdk={fitOutputEnvelope:hostFitter,client:{schemaListFields:async()=>{throw Object.assign(new Error('host unavailable'),{code:'EIO'});}}};
  const result=await runCommand('resolve',{args:[],options:{},global:{},pm_root:'unused',command:'glossary resolve',sdk} as unknown as CommandHandlerContext) as {ok:boolean};
  assert.equal(result.ok,false);
  assert.ok(calls>0,'the refusal path must call the host-supplied fitter');
});
