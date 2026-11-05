import { mkdir, writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createExtensionTestHarness } from '@unbrained/pm-cli/sdk/testing';
import { defineCommand } from '@unbrained/pm-cli/sdk/authoring';
import { PmClient, fitOutputEnvelope, OutputEnvelopeFitError, readSettings } from '@unbrained/pm-cli/sdk';
import extension, { exitCode, createDirectoryHost, createGlossary, defineSense, readGlossary, resolveTerm, resolveTermInState, envelope, fitEnvelope, glossaryOutputSchema } from '../dist/index.js';
import { inputJson, runCommand } from '../dist/src/commands.js';
import { wire } from '../dist/src/output.js';
import { refusal } from '../dist/src/errors.js';
import type { Host } from '../dist/index.js';
import type { ExtensionApi, ExtensionCommandSdk, CommandHandlerContext } from '@unbrained/pm-cli/sdk/authoring';
import { fixture, request, hasCode } from './helpers.ts';

test('incompatible native schema refuses before registering either glossary contribution',async t=>{
  const root=await mkdtemp(join(tmpdir(),'glossary-schema-'));t.after(()=>rm(root,{recursive:true,force:true}));
  for(const conflict of ['type','field','both']){
    const pmRoot=join(root,conflict,'.agents/pm');const native=new PmClient({pmRoot,author:'fixture',noExtensions:true});
    await native.init('schema',{defaults:true,agentGuidance:'skip',mergeFence:false});
    if(conflict!=='field')await native.schemaAddType('Glossary',{folder:'foreign',description:'Peer-owned type'});
    if(conflict!=='type')await native.schemaAddField('glossary_state',{type:'string',description:'Peer-owned field'});
    const before=await readSettings(pmRoot);
    await assert.rejects(createGlossary(createDirectoryHost(pmRoot,'fixture'),{id:'schema-lexicon',op:'birth',title:'Reviewed lexicon',domain_key:'context',scopes:[{scope_key:'root',parent:null}]}),hasCode('invalid_record'));
    assert.deepEqual(await readSettings(pmRoot),before);
    assert.equal((await native.listAllComplete({includeBody:true})).items.length,0);
  }
});

test('bounded stdin accepts valid UTF-8 and refuses malformed oversized and empty streams',async()=>{
  assert.deepEqual(await inputJson('-',Readable.from([Buffer.from('{"term":'),Buffer.from('"é"}')])),{term:'é'});
  await assert.rejects(inputJson('-',Readable.from([Buffer.from([0xff])])),hasCode('invalid_input'));
  await assert.rejects(inputJson('-',Readable.from([Buffer.alloc(32769,32)])),hasCode('invalid_input'));
  await assert.rejects(inputJson('-',Readable.from([])),hasCode('invalid_input'));
  assert.deepEqual(await inputJson('{"value":1}'),{value:1});
});

test('real settings-section CAS feeds CLI policy without read-time migrations',async t=>{
  const {pmRoot,native,host,id,birth}=await fixture(t);assert.equal(await host.settings!(),undefined);
  const directory=join(pmRoot,'extensions','pm-glossary');await mkdir(directory,{recursive:true});
  const manifest=JSON.parse(await readFile(new URL('../manifest.json',import.meta.url),'utf8'));
  await writeFile(join(directory,'manifest.json'),JSON.stringify({...manifest,entry:'entry.js'}));
  await writeFile(join(directory,'entry.js'),`export {default} from ${JSON.stringify(new URL('../dist/index.js',import.meta.url).href)};\n`);
  await native.schemaRemoveField('glossary_state');
  let captured: ExtensionCommandSdk | undefined;
  const module={...extension,activate(api:ExtensionApi){extension.activate(api);api.registerCommand(defineCommand({name:'fixture policy',description:'Write an explicit scratch policy',run:ctx=>{captured=ctx.sdk;return ctx.sdk!.writeSettingsSection('glossary',ctx.options.value);}}));}};
  const ext=await createExtensionTestHarness(module,{capabilities:['commands','schema','renderers']});t.after(()=>ext.deactivate());
  await ext.runCommand({command:'fixture policy',options:{value:undefined},pmRoot});assert.ok(captured);
  const sdk={...captured,client:new PmClient({pmRoot,author:'fixture',noExtensions:false})};
  const run=(command:string,options:Record<string,unknown>={},global:Record<string,unknown>={})=>ext.runCommand({command:`glossary ${command}`,args:[id],options,global,pmRoot,sdk});
  const created=await ext.runCommand({command:'glossary create',options:{id:'corpus-extension-only',op:'extension-birth',input:JSON.stringify({title:birth.title,domain_key:birth.domain_key,scopes:birth.scopes})},pmRoot,sdk});assert.equal((created.result as {ok:boolean}).ok,true,JSON.stringify(created.result));
  for(const policy of [{output_budget:1600},[],null,'invalid',{unknown:1},{output_budget:0},{output_budget:true}]){
    await ext.runCommand({command:'fixture policy',options:{value:policy},pmRoot});const result=await run('packet',{scope:'root',language:'en',limit:20});assert.equal((result.result as {ok:boolean}).ok,typeof policy==='object'&&policy!==null&&'output_budget' in policy&&policy.output_budget===1600);
  }
  await ext.runCommand({command:'fixture policy',options:{value:undefined},pmRoot});
  assert.equal(((await run('resolve',{scope:'root',term:'absent'})).result as {ok:boolean}).ok,true);
  for(const value of ['0','999999999999999999999',false])assert.equal(((await run('packet',{scope:'root',limit:value})).result as {ok:boolean}).ok,false);
  await assert.rejects(run('unknown',{scope:'root'}),{message:/^Expected a registered command handler for "glossary unknown" to invoke\./});
  const context={command:'glossary unknown',args:[id],options:{scope:'root'},global:{},pm_root:pmRoot,sdk};assert.equal((await runCommand('unknown',context as CommandHandlerContext) as {ok:boolean}).ok,false);
});

test('fault-decorated native host receipts never certify incomplete reads or unchecked writes',async t=>{
  const {host,id,native,birth}=await fixture(t);
  for(const projection of ['empty','no-hash','bad-hash','wrong-type']){
    const get=async()=>{const raw=await native.get(id,{outputInclude:'full',outputBudget:'unbounded'});assert.ok('item' in raw);if(projection==='empty')return {};if(projection==='bad-hash')return {...raw,item_hash:33};if(projection==='no-hash'){const {item_hash:ignored,...rest}=raw;return rest;}return {...raw,item:{...raw.item,type:'Task'}};};
    const broken={...host,client:{...host.client,get} as unknown as Host['client']};await assert.rejects(readGlossary(broken,id),hasCode(projection==='wrong-type'?'invalid_record':'incomplete_read'));
  }
  const badGuard:Host['client']['withExpectedItemRevisions']=async(expectations,operation)=>{const checked=await host.client.withExpectedItemRevisions(expectations,operation);return {...checked,checked:[],unchecked:[id]};};
  const broken={...host,client:{...host.client,withExpectedItemRevisions:badGuard}};const input=await request(host,id,'guarded');await assert.rejects(defineSense(broken,input),hasCode('backend_unsupported'));assert.equal((await defineSense(host,input)).replayed,true);
  host.boundary=async step=>{if(step==='before_create')return;if(step==='after_create')throw new Error('Synthetic crash after native create');};
  await assert.rejects(createGlossary(host,{...birth,id:'corpus-crash-create',op:'crash-birth'}),hasCode('outcome_unknown'));delete host.boundary;assert.equal((await createGlossary(host,{...birth,id:'corpus-crash-create',op:'crash-birth'})).replayed,true);
  await assert.rejects(host.client.create(),{message:/title/i});const before=await readGlossary(host,id);await host.client.update(id);assert.equal((await readGlossary(host,id)).revision,before.revision);
  assert.equal(refusal({code:'permission_denied',context:{required:'Obtain authorization'}}).remedy,'Obtain authorization');
  assert.equal(refusal({code:'permission_denied',context:null}).code,'permission_denied');
  const nativeError=refusal({code:'ownership_conflict',exitCode:4,context:{required:'Reread the claim'}});assert.equal(exitCode(nativeError.code,nativeError.nativeExit),4);assert.equal(refusal({code:'bad_status',exitCode:0}).nativeExit,undefined);
});

test('native fitting failures and strict output unions cannot turn omitted witnesses into success',async t=>{
  const {host,id}=await fixture(t);await defineSense(host,await request(host,id,'one'));const data=await resolveTerm(host,{id,term:'one',scope_key:'root'});const value=envelope(data,'root');assert.equal(fitEnvelope(host,value).ok,true);
  assert.equal(resolveTermInState((await readGlossary(host,id)).state,{term:'one',scope_key:'root'}).resolution,'resolved');
  assert.match(wire({text:'\u009f\u202e'},'toon'),/\\u009f/);
  assert.throws(()=>fitEnvelope({fitOutputEnvelope:()=>{throw new Error('Host fitting unavailable');}},value),{message:'Host fitting unavailable'});
  const work={evaluated_candidates:0,render_calls:0,max_render_calls:1};assert.throws(()=>fitEnvelope({fitOutputEnvelope:()=>{throw new OutputEnvelopeFitError('output_envelope_work_limit',work);}},value),hasCode('backend_unsupported'));
  const oversized={...data,candidates:Array.from({length:40},(_,i)=>({...data.candidates[0],sense_id:`many-${i}`,definition:'x'.repeat(2000)}))};
  const dishonest:typeof fitOutputEnvelope=(rows,options)=>fitOutputEnvelope(rows,{...options,tokenBudget:100000});assert.throws(()=>fitEnvelope({fitOutputEnvelope:dishonest},envelope(oversized,'root'),8192),hasCode('output_budget'));
  for(let n=0;n<20;n++){const varied={...value,owner_id:'x'.repeat(n+1)};let minimum=0;try{fitEnvelope(host,varied,1);}catch(error){assert.ok(error instanceof Error&&'details' in error);minimum=(error.details as {minimum_usable_budget:number}).minimum_usable_budget;}assert.equal(fitEnvelope(host,varied,minimum).ok,true);}
  let hint=200;assert.throws(()=>fitEnvelope({fitOutputEnvelope:()=>{throw new OutputEnvelopeFitError('output_envelope_infeasible',work,hint++);}},value,1),hasCode('backend_unsupported'));
  let calls=0;assert.throws(()=>fitEnvelope({fitOutputEnvelope:()=>{calls++;if(calls===1)throw new OutputEnvelopeFitError('output_envelope_infeasible',work,200);throw new Error('Interrupted fitter');}},value,1),{message:'Interrupted fitter'});
  let staleCalls=0;assert.throws(()=>fitEnvelope({fitOutputEnvelope:()=>{staleCalls++;throw new OutputEnvelopeFitError('output_envelope_infeasible',work,200);}},value,1),hasCode('backend_unsupported'));
  assert.ok(staleCalls>1);
  assert.equal(glossaryOutputSchema.safeParse({...value,data:undefined}).success,false);assert.equal(glossaryOutputSchema.safeParse({...value,ok:false}).success,false);
});
