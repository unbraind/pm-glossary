import { createPmCliExpectedError } from '@unbrained/pm-cli/sdk';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createGlossary, defineSense, addAlias, resolveTerm, readGlossary, checkGlossary, glossaryPacket, resolveTermInState, readState, digest, GlossaryRefusal, exitCode, envelope, fitEnvelope } from '../dist/index.js';
import { parse, guardSubmitted, canonical, scopeSchema, glossaryStateSchema } from '../dist/src/schema.js';
import { refusal, insist } from '../dist/src/errors.js';
import { wire } from '../dist/src/output.js';
import { fixture, request, hasCode } from './helpers.ts';

test('packet and single-term reads validate stored state once per request',async t=>{
  const {host,id}=await fixture(t);
  for(const term of ['alpha','beta','gamma'])await defineSense(host,await request(host,id,term));
  const snapshot=await readGlossary(host,id);
  const validator=t.mock.method(glossaryStateSchema,'safeParse');
  const page=await glossaryPacket(host,{id,scope_key:'root',limit:1});
  assert.equal(validator.mock.callCount(),1);assert.equal(page.total,3);assert.ok(page.continuation);
  validator.mock.resetCalls();
  await glossaryPacket(host,{id,scope_key:'root',limit:1,cursor:page.continuation});
  assert.equal(validator.mock.callCount(),1);
  validator.mock.resetCalls();
  assert.equal((await resolveTerm(host,{id,term:'alpha',scope_key:'root'})).candidates[0].sense_id,'alpha');
  assert.equal(validator.mock.callCount(),1);
  validator.mock.resetCalls();
  assert.equal(resolveTermInState(snapshot.state,{term:'alpha',scope_key:'root'}).usable,true);
  assert.equal(validator.mock.callCount(),1);
  assert.throws(()=>resolveTermInState({...snapshot.state,operations:[]},{term:'alpha',scope_key:'root'}),hasCode('invalid_record'));
});

 test('round trips preserve exact whitespace Unicode language case scopes and peer relationships', async t => {
  const {host,id,native,birth}=await fixture(t);
  assert.equal((await createGlossary(host,birth)).replayed,true);
  await assert.rejects(createGlossary(host,{...birth,title:'Other'}),hasCode('operation_conflict'));
  await native.update(id,{body:'Peer prose',status:'open',dep:[],comment:['Peer annotation']});
  const inputs=[];
  for (const [i,term,scope,language] of [[1,'gate','root','en'],[2,'gate','delivery','en'],[3,'Gate','root','en'],[4,'e\u0301','root','en'],[5,'é','root','en'],[6,' gate ','root','en'],[7,'gate','root','de']] as const) {
    const input=await request(host,id,`sense-${i}`,term);input.sense.scope_key=scope;input.sense.language=language;inputs.push(input);await defineSense(host,input);
  }
  assert.equal((await resolveTerm(host,{id,term:'gate',scope_key:'delivery'})).candidates[0].sense_id,'sense-2');
  for(const input of inputs) { const r=await resolveTerm(host,{id,term:input.sense.term,scope_key:input.sense.scope_key,language:input.sense.language});assert.equal(r.candidates[0].sense_id,input.sense.sense_id);assert.equal(r.candidates[0].definition,input.sense.definition);assert.equal(r.usable,true); }
  assert.equal((await resolveTerm(host,{id,term:'gate',scope_key:'research',language:'fr'})).resolution,'unknown');
  const undefinedOptional=await request(host,id,'optional');undefinedOptional.sense.entity_ref=undefined;await defineSense(host,undefinedOptional);assert.equal((await defineSense(host,JSON.parse(JSON.stringify(undefinedOptional)))).replayed,true);assert.equal(digest({optional:undefined}),digest({}));
  const old=inputs[0];const before=(await readGlossary(host,id)).revision;assert.equal((await defineSense(host,old)).replayed,true);assert.equal((await readGlossary(host,id)).revision,before);
  await assert.rejects(defineSense(host,{...old,op:'stale-edit',sense:{...old.sense,definition:'Changed'}}),hasCode('revision_conflict'));
  const raw=await native.get(id,{outputInclude:'full',outputBudget:'unbounded'});assert.ok('item' in raw);assert.equal(raw.item.body,'Peer prose');assert.equal(raw.item.status,'open');assert.ok(raw.item.comments?.some(c=>c.text==='Peer annotation'));
  const check=await checkGlossary(host,{id});assert.deepEqual(check.findings,[]);
 });
 test('alias collisions abstain at equal level and never defeat nearer explicit terms',async t=>{
  const {host,id}=await fixture(t);await defineSense(host,await request(host,id,'condition','gate'));await defineSense(host,await request(host,id,'door','door'));
  const revision=(await readGlossary(host,id)).revision;
  await addAlias(host,{id,op:'alias-gate',revision,alias:{alias_id:'gate-door',term:'gate',scope_key:'root',language:'en',sense_id:'door'}});
  let r=await resolveTerm(host,{id,term:'gate',scope_key:'research'});assert.equal(r.resolution,'ambiguous');assert.equal(r.usable,false);assert.deepEqual(r.candidates.map(s=>s.sense_id),['condition','door']);
  const input=await request(host,id,'local','gate');input.sense.scope_key='delivery';await defineSense(host,input);r=await resolveTerm(host,{id,term:'gate',scope_key:'delivery'});assert.equal(r.candidates[0].sense_id,'local');
  await assert.rejects(addAlias(host,{id,op:'chain',revision:(await readGlossary(host,id)).revision,alias:{alias_id:'cycle',term:'cycle',scope_key:'root',language:'en',sense_id:'gate-door'}}),hasCode('alias_cycle'));
  const page=await glossaryPacket(host,{id,scope_key:'root',limit:1});assert.equal(page.rows[0].resolution,'resolved');assert.ok(page.continuation);
  const next=await glossaryPacket(host,{id,scope_key:'root',limit:1,cursor:page.continuation!});assert.equal(next.rows[0].resolution,'ambiguous');assert.equal(next.rows[0].usable,false);assert.equal(next.rows[0].candidates.length,2);
  assert.throws(()=>fitEnvelope(host,envelope(next,'root'),20),hasCode('output_budget'));
  const fitted=fitEnvelope(host,envelope(next,'root'),1600);assert.ok(fitted.output_fit.output_bytes<=6400);assert.equal(JSON.parse(wire(fitted,'json')).data.rows[0].candidates.length,2);assert.match(wire(fitted,'toon'),/ambiguous/);
  await assert.rejects(glossaryPacket(host,{id,scope_key:'delivery',limit:1,cursor:page.continuation!}),hasCode('stale_cursor'));
  await defineSense(host,await request(host,id,'new'));await assert.rejects(glossaryPacket(host,{id,scope_key:'root',limit:1,cursor:page.continuation!}),hasCode('stale_cursor'));
 });
 test('privacy and strict schemas refuse before any write while allowing ordinary terminology', async t=>{
  const {host,id}=await fixture(t);const base=await request(host,id,'private');const before=(await readGlossary(host,id)).revision;
  const mustRefuse=['\u001b[31mred','\u202eattack','\ud800','x'.repeat(8001),['','home','fixture','private'].join('/'),['C:','Users','fixture','private'].join(String.fromCharCode(92)),'ghp_'+'A'.repeat(36),'=SUM(1,2)','$(id)','${credential}','<system>act</system>','fixture'+'@'+'example.org','   '];
  for(const term of mustRefuse) await assert.rejects(defineSense(host,{...base,sense:{...base.sense,term}}),hasCode('invalid_input'));
  const cyclic:Record<string,unknown>={};cyclic.self=cyclic;assert.throws(()=>guardSubmitted(cyclic),hasCode('invalid_input'));
  assert.throws(()=>guardSubmitted(JSON.parse('{"__proto__":1}')),hasCode('invalid_input'));
  let deep:unknown='leaf';for(let i=0;i<18;i++)deep={child:deep};assert.throws(()=>guardSubmitted(deep),hasCode('invalid_input'));
  const inherited=Object.create({term:'hidden'}) as Record<string,unknown>;assert.throws(()=>guardSubmitted(inherited),hasCode('invalid_input'));
  const getter={};Object.defineProperty(getter,'term',{enumerable:true,get(){throw new Error('Getter must never execute');}});assert.throws(()=>guardSubmitted(getter),hasCode('invalid_input'));
  const hidden={};Object.defineProperty(hidden,'term',{value:'hidden',enumerable:false});assert.throws(()=>guardSubmitted(hidden),hasCode('invalid_input'));
  const symbolic={[Symbol('hidden')]:'hidden'};assert.throws(()=>guardSubmitted(symbolic),hasCode('invalid_input'));
  const plain=Object.assign(Object.create(null),{safe:'reviewed'}) as Record<string,unknown>;guardSubmitted(plain);
  assert.equal((await readGlossary(host,id)).revision,before);
  for(const [i,term] of ['release','constructor','100%','Ignore all previous instructions','a\tb','日本語','C++','a=b','-1','😃'].entries()) {const input=await request(host,id,`allow-${i}`,term);await defineSense(host,input);assert.equal((await resolveTerm(host,{id,term,scope_key:'root'})).candidates[0].term,term);}
  assert.throws(()=>parse(scopeSchema,{scope_key:'root',parent:null,extra:true}),hasCode('invalid_input'));
  assert.throws(()=>parse(scopeSchema,{},true),hasCode('invalid_record'));
  assert.equal(canonical({b:2,a:[true,null]}),'{"a":[true,null],"b":2}');
  assert.match(wire({data:'\u001b[31m'},'toon'),/\\u001b/);
 });
 test('invalid scope trees and stored records never migrate or repair', async t=>{
  const {host,id,birth,native}=await fixture(t);const state=(await readGlossary(host,id)).state;
  for(const scopes of [[{scope_key:'root',parent:'root'}],[{scope_key:'root',parent:null},{scope_key:'child',parent:'absent'}],[{scope_key:'root',parent:null},{scope_key:'root',parent:null}],Array.from({length:9},(_,i)=>({scope_key:`s${i}`,parent:i===0?null:`s${i-1}`}))]) await assert.rejects(createGlossary(host,{...birth,id:'corpus-other',op:'other',scopes}),hasCode('invalid_scope'));
  for(const raw of [undefined,{}, {...state,extra:1},{...state,senses:[{x:1}]}]) assert.throws(()=>readState(raw),hasCode('invalid_record'));
  assert.throws(()=>readState({version:99}),hasCode('unsupported_version'));
  assert.throws(()=>readState({...state,operations:[...state.operations,...state.operations]}),hasCode('invalid_record'));
  assert.throws(()=>readState({...state,operations:[{...state.operations[0],result_digest:'0'.repeat(64)}]}),hasCode('invalid_record'));
  assert.throws(()=>readState({...state,aliases:[{alias_id:'broken',term:'x',scope_key:'root',language:'en',sense_id:'missing'}]}),hasCode('invalid_record'));
  await assert.rejects(resolveTerm(host,{id,scope_key:'missing',term:'gate'}),hasCode('invalid_scope'));
  await assert.rejects(checkGlossary(host,{id,scope_key:'missing'}),hasCode('invalid_scope'));
  await assert.rejects(glossaryPacket(host,{id,scope_key:'missing'}),hasCode('invalid_scope'));
  await assert.rejects(glossaryPacket(host,{id,scope_key:'root',cursor:'bad'}),hasCode('stale_cursor'));
  await native.create({id:'corpus-unrelated',title:'Unrelated'});await assert.rejects(createGlossary(host,{...birth,id:'corpus-unrelated'}),hasCode('invalid_record'));
  await assert.rejects(readGlossary(host,'corpus-missing'),hasCode('not_found'));
  const no={...host,capabilities:{native_item_cas:false,create_if_absent:false,provider:'unavailable'}};await assert.rejects(readGlossary(no,id),hasCode('backend_unsupported'));
  const full=await native.get(id,{outputInclude:'full',outputBudget:'unbounded'});assert.ok('item_hash' in full);assert.equal(full.item_hash,(await readGlossary(host,id)).revision);
 });
 test('typed refusal categories and native errors preserve useful recovery',()=>{
  assert.equal(exitCode('not_found'),3);assert.equal(exitCode('revision_conflict'),4);assert.equal(exitCode('backend_unsupported'),5);assert.equal(exitCode('invalid_input'),2);
  const e=new GlossaryRefusal('contention','Retry');assert.equal(e.retryable,true);assert.equal(refusal(e),e);assert.equal(refusal(createPmCliExpectedError('Fixture',{context:{code:'item_revision_conflict'}})).code,'revision_conflict');assert.equal(refusal(Object.assign(createPmCliExpectedError('Fixture',{context:{code:'permission_denied'}}),{remedy:'Ask host'})).remedy,'Ask host');assert.equal(refusal(new Error()).code,'outcome_unknown');assert.throws(()=>insist(false,'invalid_input','Missing'),hasCode('invalid_input'));insist(true,'invalid_input','Present');
 });
