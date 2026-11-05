import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineSense, addAlias, createGlossary, createDirectoryHost, readGlossary } from '../dist/index.js';
import { fixture, request, hasCode } from './helpers.ts';
import { npmEnvironment } from '../scripts/environment.ts';

for (const step of ['after_read','before_guard','before_update','after_update','after_guard','before_receipt']) test(`competing native write at ${step} preserves both meanings`,async t=>{
  const {host,id,pmRoot}=await fixture(t);const peer=createDirectoryHost(pmRoot,'peer');const input=await request(host,id,'owner');let injected=false;
  host.boundary=async boundary=>{if(boundary===step&&!injected){injected=true;await defineSense(peer,await request(peer,id,'peer'));}};
  const result=await defineSense(host,input);assert.equal(result.outcome,'committed');assert.equal(injected,true);
  assert.deepEqual((await readGlossary(peer,id)).state.senses.map(s=>s.sense_id).sort(),['owner','peer']);
  const before=await readFile(join(pmRoot,'history',`${id}.jsonl`),'utf8');assert.equal((await defineSense(peer,input)).replayed,true);assert.equal(await readFile(join(pmRoot,'history',`${id}.jsonl`),'utf8'),before);
});
for(const step of ['before_create','after_create']) test(`create collision at ${step} converges without adoption`,async t=>{
  const {host,birth,pmRoot}=await fixture(t);const peer=createDirectoryHost(pmRoot,'peer');const input={...birth,id:'corpus-second',op:'second'};let injected=false;
  host.boundary=async boundary=>{if(boundary===step&&!injected){injected=true;const result=await createGlossary(peer,input);assert.equal(result.outcome,'committed');}};
  await createGlossary(host,input);assert.equal((await createGlossary(peer,input)).replayed,true);
  const history=(await readFile(join(pmRoot,'history','corpus-second.jsonl'),'utf8')).trim().split('\n');assert.equal(history.length,1);
});
for(const step of ['before_guard','before_update','after_update','after_guard','before_receipt']) test(`crash at ${step} and rerun converge on original key`,async t=>{
  const {host,id,pmRoot}=await fixture(t);const input=await request(host,id,'recovery');let crashed=false;
  host.boundary=async boundary=>{if(boundary===step&&!crashed){crashed=true;throw new Error('Synthetic interrupted caller');}};
  await assert.rejects(defineSense(host,input));delete host.boundary;
  const recovered=await defineSense(host,input);assert.equal(recovered.replayed,['after_update','after_guard','before_receipt'].includes(step));
  const state=(await readGlossary(host,id)).state;assert.equal(state.senses.length,1);assert.equal(state.operations.length,2);
  assert.equal((await readFile(join(pmRoot,'history',`${id}.jsonl`),'utf8')).trim().split('\n').length,2);
});
test('three CAS losses return contention; explicit edits never auto-rebase',async t=>{
  const {host,id,pmRoot}=await fixture(t);const peer=createDirectoryHost(pmRoot,'peer');const input=await request(host,id,'contended');let sequence=0;
  host.boundary=async step=>{if(step==='before_update')await defineSense(peer,await request(peer,id,`peer-${sequence++}`));};
  await assert.rejects(defineSense(host,input),hasCode('contention'));assert.equal(sequence,3);delete host.boundary;
  const edit=await request(host,id,'peer-0');edit.op='edit-peer-0';edit.sense.definition='Explicit redefinition';
  host.boundary=async step=>{if(step==='before_update')await defineSense(peer,await request(peer,id,'new-peer'));};
  await assert.rejects(defineSense(host,edit),hasCode('revision_conflict'));delete host.boundary;
  assert.equal((await readGlossary(host,id)).state.senses.find(s=>s.sense_id==='peer-0')?.definition,'Reviewed meaning for peer-0.');
});
test('two OS processes retain twenty acknowledged additions with bounded retries',async t=>{
  const {host,id,root,pmRoot}=await fixture(t);await defineSense(host,await request(host,id,'target'));
  const worker=join(root,'worker.mjs');
  await writeFile(worker,`import {createDirectoryHost,defineSense,addAlias,readGlossary} from ${JSON.stringify(new URL('../dist/index.js',import.meta.url).href)};\nconst host=createDirectoryHost(process.argv[2],process.argv[3]);const id=process.argv[4];let acknowledged=0,contention=0;const acceptedKeys=[],refusedKeys=[];for(let i=0;i<10;i++){const key=process.argv[3]+'-'+i;const revision=(await readGlossary(host,id)).revision;try{const result=i%2===0?await defineSense(host,{id,op:key,revision,sense:{sense_id:key,term:key,scope_key:'root',language:'en',definition:'Explicit process meaning.'}}):await addAlias(host,{id,op:key,revision,alias:{alias_id:key,term:key,scope_key:'root',language:'en',sense_id:'target'}});if(result.outcome==='committed'){acknowledged++;acceptedKeys.push(key);}}catch(error){if(['contention','revision_conflict'].includes(error.code)){contention++;refusedKeys.push({id:key,code:error.code});}else throw error;}}console.log(JSON.stringify({acknowledged,contention,acceptedKeys,refusedKeys}));`);
  const execute=(author:string)=>new Promise<{acknowledged:number;contention:number;acceptedKeys:string[];refusedKeys:{id:string;code:string}[]}>((resolve,reject)=>{const child=spawn(process.execPath,[worker,pmRoot,author,id],{env:{...npmEnvironment(process.env),GIT_CEILING_DIRECTORIES:root}});let out='',err='';child.stdout.on('data',chunk=>out+=String(chunk));child.stderr.on('data',chunk=>err+=String(chunk));child.on('error',reject);child.on('close',code=>code===0?resolve(JSON.parse(out)):reject(new Error(err)));});
  const results=await Promise.all([execute('writer-a'),execute('writer-b')]);const state=(await readGlossary(host,id)).state;const accepted=results.reduce((n,r)=>n+r.acknowledged,0);assert.equal(accepted+results.reduce((n,r)=>n+r.contention,0),20);assert.equal(state.senses.length+state.aliases.length-1,accepted);assert.equal(state.operations.length-2,accepted);assert.ok(accepted>0);const keys=results.flatMap(result=>result.acceptedKeys).sort();assert.deepEqual([...state.senses.filter(sense=>sense.sense_id!=='target').map(sense=>sense.sense_id),...state.aliases.map(alias=>alias.alias_id)].sort(),keys);assert.deepEqual(state.operations.slice(2).map(operation=>operation.operation_id).sort(),keys);assert.equal(results.flatMap(result=>result.refusedKeys).length,20-accepted);t.diagnostic(JSON.stringify({requests:20,acknowledged:accepted,explicit_conflicts:20-accepted,preserved:state.senses.length+state.aliases.length-1}));
});
