import test from 'node:test';
import assert from 'node:assert/strict';
import { createExtensionTestHarness, decodeToon } from '@unbrained/pm-cli/sdk/testing';
import extension, { readGlossary, defineSense, resolveTerm, envelope, fitEnvelope } from '../dist/index.js';
import { runCommand } from '../dist/src/commands.js';
import type { GlossaryOutput } from '../dist/index.js';
import type { CommandHandlerContext } from '@unbrained/pm-cli/sdk/authoring';
import { GlossaryRefusal } from '../dist/src/errors.js';
import { fitRefusal, glossaryOutputSchema } from '../dist/src/output.js';
import { fitOutputEnvelope, createPmCliExpectedError } from '@unbrained/pm-cli/sdk';
import { fixture, harnessFixture, request } from './helpers.ts';

test('native extension harness executes every command, contracts and scoped renderers',async t=>{
  const {pmRoot,id,ext}=await harnessFixture(t);
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

test('refusal envelopes use the host-pinned fitter like success envelopes',async t=>{
  const {native,pmRoot}=await fixture(t);
  let calls=0;
  const hostFitter=((...args:Parameters<typeof fitOutputEnvelope>)=>{calls+=1;return fitOutputEnvelope(...args);}) as typeof fitOutputEnvelope;
  native.schemaListFields=async()=>{throw Object.assign(new Error('host unavailable'),{code:'EIO'});};
  const sdk={fitOutputEnvelope:hostFitter,client:native};
  const result=await runCommand('resolve',{args:[],options:{},global:{},pm_root:pmRoot,command:'glossary resolve',sdk} as unknown as CommandHandlerContext) as {ok:boolean};
  assert.equal(result.ok,false);
  assert.ok(calls>0,'the refusal path must call the host-supplied fitter');
});

test('oversized native refusals stay typed and fit the 1600 budget with omission receipts',async t=>{
  const {native,pmRoot}=await fixture(t);
  for (const size of [8000,40000]) for (const [code, remedy] of [['permission_denied', 'R'.repeat(size)], ['C'.repeat(size), 'Review access'], ['C'.repeat(size), 'R'.repeat(size)]]) {
    native.schemaListFields=async()=>{throw createPmCliExpectedError('Private host diagnostic',{exitCode:77,context:{code,required:remedy}});};
    const sdk={fitOutputEnvelope,client:native};
    const result = await runCommand('resolve',{args:[],options:{},global:{},pm_root:pmRoot,command:'glossary resolve',sdk} as unknown as CommandHandlerContext).catch(()=>assert.fail('Oversized native refusal escaped instead of returning typed output')) as ReturnType<typeof fitRefusal>;
    assert.equal(result.exit_code,77);assert.equal(result.ok,false);assert.ok(result.output_fit.estimated_tokens<=1600);assert.ok(result.output_fit.output_bytes<=32768);
    const {output_fit,...portable}=result;assert.ok(output_fit);glossaryOutputSchema.parse(portable);
    assert.equal(result.refusal!.code,code.length<100?code:'outcome_unknown');
    assert.equal(result.refusal!.remedy,remedy.length<100?remedy:'Read back the original operation and inspect host diagnostics before retrying');
    assert.deepEqual(result.refusal!.details.omitted_fields,[...(code.length>100?['code']:[]),...(remedy.length>100?['remedy']:[])]);
    assert.doesNotMatch(JSON.stringify(result),/Private host diagnostic/);
  }
});

test('compact refusals preserve fitting native fields and report oversized details and messages',()=>{
  for(const field of ['details','message'] as const){
    const error = new GlossaryRefusal('revision_conflict',field==='message'?'M'.repeat(40000):'Native refusal','Reread the owner',field==='details'?{native:'D'.repeat(40000)}:{},44);
    const result=fitRefusal({},error);
    assert.equal(result.exit_code,44);assert.equal(result.refusal!.code,'revision_conflict');assert.equal(result.refusal!.retryable,true);assert.equal(result.refusal!.remedy,error.remedy);
    assert.deepEqual(result.refusal!.details.omitted_fields,[field]);assert.ok(result.output_fit.estimated_tokens<=1600);
  }
  const error=new GlossaryRefusal('permission_denied','M'.repeat(40000));
  assert.throws(()=>fitRefusal({},error,1),{code:'output_budget'});
  assert.throws(()=>fitRefusal({},error,0),{code:'invalid_input'});
  let calls=0;
  const broken=((...args:Parameters<typeof fitOutputEnvelope>)=>{calls++;if(calls>1)throw new Error('fitter unavailable');return fitOutputEnvelope(...args);}) as typeof fitOutputEnvelope;
  assert.throws(()=>fitRefusal({fitOutputEnvelope:broken},error),/fitter unavailable/);
  const failsRetention=((...args:Parameters<typeof fitOutputEnvelope>)=>{
    if(args[1].tokenBudget===1600){calls++;if(calls===3)throw new Error('retention fitter unavailable');}
    return fitOutputEnvelope(...args);
  }) as typeof fitOutputEnvelope;
  calls=0;
  assert.throws(()=>fitRefusal({fitOutputEnvelope:failsRetention},error),/retention fitter unavailable/);
});
