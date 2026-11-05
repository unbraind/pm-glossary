import { encodeReadOutputContinuationCursor } from '@unbrained/pm-cli/sdk/contracts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlossary, defineSense, addAlias, readGlossary, resolveTerm, resolveTermInState, readState, checkGlossary, glossaryPacket, glossaryStateSchema, digest, fitEnvelope, envelope } from '../dist/index.js';
import { capacity } from '../dist/src/api.js';
import { fixture, request, hasCode } from './helpers.ts';

 test('explicit revisions permit reviewed sense and alias replacements and preserve related tasks',async t=>{
  const {host,id,native,birth}=await fixture(t);const task=await native.create({title:'Consuming task'});const related=await createGlossary(host,{...birth,id:'corpus-related',op:'related',related:[task.item.id]});const got=await native.get(related.owner_id,{outputInclude:'full',outputBudget:'unbounded'});assert.ok('item' in got);assert.equal(got.item.dependencies?.[0].id,task.item.id);assert.equal(got.item.dependencies?.[0].kind,'related');await native.update(related.owner_id,{clearDeps:true});const cleared=await native.get(related.owner_id,{outputInclude:'full',outputBudget:'unbounded'});assert.ok('item' in cleared);assert.equal(cleared.item.dependencies?.length??0,0);
  const first=await request(host,id,'first','gate');await defineSense(host,first);await defineSense(host,await request(host,id,'second','barrier'));
  const edit=await request(host,id,'first','gate');edit.op='edit';edit.sense.definition='Reviewed replacement.';edit.sense.contrast_sense_ids=['second'];await defineSense(host,edit);assert.deepEqual((await checkGlossary(host,{id})).findings,[]);
  const alias={alias_id:'door',term:'door',scope_key:'root',language:'en',sense_id:'first'};let result=await addAlias(host,{id,op:'alias-one',revision:(await readGlossary(host,id)).revision,alias});
  const changed={id,op:'alias-two',revision:result.revision,alias:{...alias,sense_id:'second'}};result=await addAlias(host,changed);assert.equal((await addAlias(host,changed)).replayed,true);assert.equal(result.result.kind,'alias');
  const invalid=await request(host,id,'invalid');invalid.sense.contrast_sense_ids=['invalid'];await assert.rejects(defineSense(host,invalid),hasCode('invalid_input'));
  const missing=await request(host,id,'missing-scope');missing.sense.scope_key='absent';await assert.rejects(defineSense(host,missing),hasCode('invalid_scope'));
  await assert.rejects(createGlossary(host,{...birth,op:'unrelated-create'}),hasCode('operation_conflict'));
  await host.client.update(id,{body:'Native peer update through injected directory port'});
  await assert.rejects(host.client.update(id,{field:['other=1']}),hasCode('invalid_input'));
 });
 test('diagnostics retain duplicate alias and broken contrast evidence from native read-back',async t=>{
  const {host,id,native}=await fixture(t);await defineSense(host,await request(host,id,'first'));
  for(const aliasId of ['one','two'])await addAlias(host,{id,op:`alias-${aliasId}`,revision:(await readGlossary(host,id)).revision,alias:{alias_id:aliasId,term:'same',scope_key:'root',language:'en',sense_id:'first'}});
  const state=(await readGlossary(host,id)).state;state.senses[0].contrast_sense_ids=['missing'];const update={message:'Synthetic native fixture',glossaryState:state};await native.update(id,update);
  const check=await checkGlossary(host,{id,scope_key:'root'});assert.deepEqual(check.findings.map(f=>f.code),['duplicate_alias','broken_contrast']);
 });
 test('future malformed oversized and duplicate native records refuse without repair',async t=>{
  const {host,id,native}=await fixture(t);const snapshot=await readGlossary(host,id);const sense={sense_id:'s',term:'s',scope_key:'root',language:'en',definition:'Meaning.',contrast_sense_ids:[],provenance:[]};
  assert.throws(()=>readState({...snapshot.state,senses:[{...sense,scope_key:'absent'}]}),hasCode('invalid_record'));
  assert.throws(()=>readState({...snapshot.state,senses:[sense,sense]}),hasCode('invalid_record'));
  const alias={alias_id:'a',term:'a',scope_key:'root',language:'en',sense_id:'s'};assert.throws(()=>readState({...snapshot.state,senses:[sense],aliases:[alias,alias]}),hasCode('invalid_record'));
  const big={...snapshot.state,senses:Array.from({length:64},(_,i)=>({...sense,sense_id:`s-${i}`,definition:'文'.repeat(1000)}))};assert.equal(glossaryStateSchema.safeParse(big).success,true);assert.throws(()=>readState(big),hasCode('invalid_record'));
  for(const raw of [{...snapshot.state,version:2},{...snapshot.state,operations:[]},{...snapshot.state,senses:[{...sense,definition:22}]}]){const update={message:'Synthetic native fixture',glossaryState:raw};await native.update(id,update);const before=await native.readItemRevision(id);await assert.rejects(readGlossary(host,id));assert.deepEqual(await native.readItemRevision(id),before);}
 });
 test('independent capacity ceilings refuse before any native owner mutation',async t=>{
  const {host,id,native}=await fixture(t);const snapshot=await readGlossary(host,id);const before=await native.readItemRevision(id);const operation=snapshot.state.operations[0];
  const sense={sense_id:'s',term:'s',scope_key:'root',language:'en',definition:'Meaning.',contrast_sense_ids:[],provenance:[]};
  const alias={alias_id:'a',term:'a',scope_key:'root',language:'en',sense_id:'s'};
  for(const state of [{...snapshot.state,operations:Array.from({length:257},()=>operation)},{...snapshot.state,senses:Array.from({length:129},()=>sense)},{...snapshot.state,aliases:Array.from({length:257},()=>alias)},{...snapshot.state,senses:Array.from({length:64},(_,i)=>({...sense,sense_id:`s-${i}`,definition:'文'.repeat(1000)}))}])assert.throws(()=>capacity(state),hasCode('capacity'));
  const state={...snapshot.state,senses:Array.from({length:128},(_,i)=>({...sense,sense_id:`s-${i}`}))};await native.update(id,{message:'Synthetic boundary fixture',...{glossaryState:state}});
  const atLimit=await native.readItemRevision(id);await assert.rejects(defineSense(host,await request(host,id,'overflow')),hasCode('capacity'));assert.deepEqual(await native.readItemRevision(id),atLimit);assert.notDeepEqual(atLimit,before);
 });
 test('packet cursor validation and full-envelope ceilings retain required identities',async t=>{
  const {host,id}=await fixture(t);await defineSense(host,await request(host,id,'one'));const snapshot=await readGlossary(host,id);const query=digest({scope:'root',language:'en',limit:1,projection:'full-witness-v1'});
  const cursor=(offset:number)=>encodeReadOutputContinuationCursor({command:'extension:glossary packet',path:'data.rows',offset,total_rows:1,fingerprint:digest({revision:snapshot.revision,query})});await assert.rejects(glossaryPacket(host,{id,scope_key:'root',limit:1,cursor:cursor(5)}),hasCode('stale_cursor'));
  await assert.rejects(glossaryPacket(host,{id,scope_key:'root',cursor:Buffer.from('{}').toString('base64url')}));
  const resolution=await resolveTerm(host,{id,term:'one',scope_key:'root'});
  assert.throws(()=>fitEnvelope(host,envelope(resolution,'root'),0),hasCode('invalid_input'));
  assert.equal(fitEnvelope({},envelope(resolution,'root'),1600).ok,true);
  const large={...resolution,candidates:Array.from({length:40},(_,i)=>({...resolution.candidates[0],sense_id:`large-${i}`,definition:'x'.repeat(2000)}))};assert.throws(()=>fitEnvelope(host,envelope(large,'root'),99999),hasCode('output_budget'));
  const original=structuredClone(snapshot.state);assert.equal(resolveTermInState(original,{term:'missing',scope_key:'root',language:'zz'}).resolution,'unknown');
 });

test('native identifier normalization makes canonical and unprefixed retries identical',async t=>{
  const {host,birth,native}=await fixture(t);const input={...birth,id:' short ',op:'normalize'};const made=await createGlossary(host,input);assert.equal(made.owner_id,'corpus-short');assert.equal((await createGlossary(host,{...input,id:made.owner_id})).replayed,true);
  const sense=await request(host,'short','normalized');const first=await defineSense(host,sense);assert.equal((await defineSense(host,{...sense,id:made.owner_id})).replayed,true);assert.equal((await native.readItemRevision(made.owner_id)).item_hash,first.revision);
  const {normalizeId:ignored,...canonicalHost}=host;const other=await createGlossary(canonicalHost,{...birth,id:'corpus-canonical',op:'canonical'});assert.equal(other.owner_id,'corpus-canonical');
});
