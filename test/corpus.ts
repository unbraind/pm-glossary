import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { PmClient } from '@unbrained/pm-cli/sdk/core';
import { certifyCompleteListResult } from '@unbrained/pm-cli/sdk/runtime';
import { createDirectoryHost, createGlossary, defineSense, resolveTerm, glossaryPacket, envelope, fitEnvelope, readGlossary, GlossaryRefusal } from '../dist/index.js';
import { gitEnvironment } from '../scripts/environment.ts';

/** Public fixed provenance plus manually reviewed gold definitions, independent from the resolver. */
interface Source {
  /** Public repository slug. */
  repository:string;
  /** Immutable input Git commit. */
  revision:string;
  /** Source path inside that revision. */
  path:string;
  /** Full original document digest. */
  sha256:string;
  /** Selected source-passage digest. */
  selected_sha256:string;
  /** Reviewed exact surfaces and definitions. */
  terms:Record<string,string>;
}
/** Verify available full-source bytes before presenting a source digest as a receipt. */
export function sourceReceipt(source: Source, text: string, fullSource?: Uint8Array) {
  const hash = createHash('sha256').update(text).digest('hex');
  assert.equal(hash, source.selected_sha256, 'Selected source digest mismatch');
  const fullHash = fullSource === undefined ? undefined : createHash('sha256').update(fullSource).digest('hex');
  if (fullHash !== undefined) assert.equal(fullHash, source.sha256, 'Full source digest mismatch');
  return { repository: source.repository, revision: source.revision, ...(fullHash === undefined ? { unverified_source_sha256: source.sha256, source_sha256: undefined } : { source_sha256: fullHash, unverified_source_sha256: undefined }), selected_sha256: hash, selected_bytes: Buffer.byteLength(text) };
}
/** Locate the sibling source checkout from a module URL, decoding filesystem characters. */
export function trackerRepository(moduleUrl = import.meta.url): string {
  return fileURLToPath(new URL('../../pm-vcs', moduleUrl));
}
/** Reproduce public scoped resolution measurements in a fresh plain native tracker. */
export async function realData(copyTracker=false) {
  const root=await mkdtemp(join(tmpdir(),'glossary-corpus-'));const start=performance.now();
  try{
    const pmRoot=join(root,'.agents/pm');let copiedItems=0,rawItemBytes=0,trackerRevision:string|null=null;let trackerItems:{id:string;title?:unknown;description?:unknown;body?:unknown}[]=[];
    if(copyTracker){
      const repository=trackerRepository();const env=gitEnvironment(process.env);trackerRevision=(JSON.parse(await readFile(new URL('./fixtures/public-corpus.json',import.meta.url),'utf8')) as Source[]).find(source=>source.repository==='unbraind/pm-vcs')!.revision;
      const files=execFileSync('git',['-C',repository,'ls-tree','-r','--name-only',trackerRevision,'--','.agents/pm'],{env,encoding:'utf8'}).trim().split('\n').filter(Boolean);
      for(const file of files){if(!/\.(?:toon|json|jsonl)$/.test(file))continue;const bytes=execFileSync('git',['-C',repository,'show',`${trackerRevision}:${file}`],{env,maxBuffer:32*1024*1024});await mkdir(dirname(join(root,file)),{recursive:true});await writeFile(join(root,file),bytes);}
      const reader=new PmClient({pmRoot,author:'corpus',noExtensions:true});const result=certifyCompleteListResult(await reader.listAllComplete({includeBody:true}));copiedItems=result.items.length;trackerItems=result.items;
      rawItemBytes=Buffer.byteLength(JSON.stringify(result.items));
    }else{
      await new PmClient({pmRoot,author:'corpus',noExtensions:true}).init('lexicon',{defaults:true,agentGuidance:'skip',mergeFence:false});
    }
    const native=new PmClient({pmRoot,author:'corpus',noExtensions:true});const host=createDirectoryHost(pmRoot,'corpus');
    const sources=JSON.parse(await readFile(new URL('./fixtures/public-corpus.json',import.meta.url),'utf8')) as Source[];
    const gold=JSON.parse(await readFile(new URL('./fixtures/gold-meanings.json',import.meta.url),'utf8')) as Record<string,Record<string,string>>;
    const born=await createGlossary(host,{id:'lexicon-public',op:'birth',title:'Public reviewed domain meanings',domain_key:'fleet',scopes:[{scope_key:'root',parent:null},...(copyTracker?[{scope_key:'pm-vcs-tracker',parent:'root'}]:[]),...sources.map(source=>({scope_key:source.repository.split('/')[1],parent:'root'}))]});
    const id=born.owner_id;let revision=born.revision;let rawBytes=0,senses=0,correct=0;const expected: {scope:string;term:string;sense_id:string;definition:string}[]=[];const sourceReceipts=[];const probeReceipts:{term:string;scope:string;expected:string[];actual:string[];resolution:string;usable:boolean}[]=[];
    for(const source of sources){
      const domain=source.repository.split('/')[1];assert.deepEqual(source.terms,gold[domain]);const text=await readFile(new URL(`./fixtures/${domain}.md`,import.meta.url),'utf8');const fullSource=copyTracker?execFileSync('git',['-C',fileURLToPath(new URL(`../../${domain}`,import.meta.url)),'show',`${source.revision}:${source.path}`],{env:gitEnvironment(process.env),maxBuffer:32*1024*1024}):undefined;const receipt=sourceReceipt(source,text,fullSource);rawBytes+=Buffer.byteLength(text);
      const doc=await native.create({id:`public-${domain}`,title:`Public ${domain} source passages`,body:text});const sourceRevision=await native.readItemRevision(doc.item.id);sourceReceipts.push(receipt);
      for(const [term,definition] of Object.entries(source.terms)){
        const senseId=`${domain}-${term}`;assert.ok(text.includes(term));const result=await defineSense(host,{id,op:senseId,revision,sense:{sense_id:senseId,term,scope_key:domain,language:'en',definition,provenance:[{item_id:doc.item.id,item_hash:sourceRevision.item_hash,field_pointer:'/body'}]}});revision=result.revision;senses++;expected.push({scope:domain,term,sense_id:senseId,definition});
      }
    }
    const trackerEvidence:{term:string;item_id:string;item_hash:string;field_pointer:string;bytes:number}[]=[];const selectedFields=new Map<string,string>();
    const trackerGold=JSON.parse(await readFile(new URL('./fixtures/tracker-meanings.json',import.meta.url),'utf8')) as Record<string,{item_id:string;item_hash:string;definition:string}>;
    if(copyTracker)for(const [term,reviewed] of Object.entries(trackerGold)){
      const selected=trackerItems.find(item=>item.id===reviewed.item_id);assert.ok(selected);assert.equal(typeof selected.description,'string');const text=selected.description as string;
      assert.ok(new RegExp('(?:^|[^a-z])'+term+'(?:$|[^a-z])','i').test(text));const pinned=await native.readItemRevision(selected.id);assert.equal(pinned.item_hash,reviewed.item_hash);const senseId='tracker-'+term;
      revision=(await defineSense(host,{id,op:senseId,revision,sense:{sense_id:senseId,term,scope_key:'pm-vcs-tracker',language:'en',definition:reviewed.definition,provenance:[{item_id:selected.id,item_hash:pinned.item_hash,field_pointer:'/description'}]}})).revision;senses++;expected.push({scope:'pm-vcs-tracker',term,sense_id:senseId,definition:reviewed.definition});
      trackerEvidence.push({term,item_id:selected.id,item_hash:pinned.item_hash,field_pointer:'/description',bytes:Buffer.byteLength(text)});selectedFields.set(selected.id+'/description',text);
    }
    for(const text of selectedFields.values())rawBytes+=Buffer.byteLength(text);
    for(const probe of expected){const result=await resolveTerm(host,{id,scope_key:probe.scope,term:probe.term});assert.equal(result.resolution,'resolved');assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].sense_id,probe.sense_id);assert.equal(result.candidates[0].definition,probe.definition);assert.equal(result.usable,true);probeReceipts.push({term:probe.term,scope:probe.scope,expected:[probe.sense_id],actual:result.candidates.map(sense=>sense.sense_id),resolution:result.resolution,usable:result.usable});correct++;}
    for(const [senseId,definition] of [['gate-check','A reviewed acceptance condition.'],['gate-door','A physical barrier controlling an opening.']] as const){revision=(await defineSense(host,{id,op:senseId,revision,sense:{sense_id:senseId,term:'gate',scope_key:'root',language:'en',definition}})).revision;senses++;}
    const ambiguity=await resolveTerm(host,{id,term:'gate',scope_key:'root'});assert.equal(ambiguity.resolution,'ambiguous');assert.equal(ambiguity.candidates.length,2);assert.deepEqual(ambiguity.candidates.map(sense=>sense.sense_id).sort(),['gate-check','gate-door']);assert.equal(ambiguity.usable,false);probeReceipts.push({term:'gate',scope:'root',expected:['gate-check','gate-door'],actual:ambiguity.candidates.map(sense=>sense.sense_id),resolution:ambiguity.resolution,usable:ambiguity.usable});let abstained=1;
    const narrower=await resolveTerm(host,{id,term:'gate',scope_key:'pm-vcs'});assert.equal(narrower.resolution,'resolved');assert.equal(narrower.usable,true);assert.equal(narrower.candidates.length,1);assert.equal(narrower.candidates[0].sense_id,'pm-vcs-gate');assert.equal(narrower.candidates[0].definition,gold['pm-vcs'].gate);
    for(let n=0;n<9;n++){const result=await resolveTerm(host,{id,term:`not-defined-${n}`,scope_key:'root'});assert.equal(result.usable,false);assert.equal(result.resolution,'unknown');assert.equal(result.candidates.length,0);probeReceipts.push({term:`not-defined-${n}`,scope:'root',expected:[],actual:result.candidates.map(sense=>sense.sense_id),resolution:result.resolution,usable:result.usable});abstained++;}
    let packetBytes=0,packetTokens=0;const packets=[];
    for(const source of sources){const scope=source.repository.split('/')[1];const packet=await glossaryPacket(host,{id,scope_key:scope,limit:100});const fitted=fitEnvelope(host,envelope(packet,scope),8192);const bytes=fitted.output_fit.output_bytes;packetBytes+=bytes;packetTokens+=fitted.output_fit.estimated_tokens;packets.push({scope,returned:packet.returned,ambiguous:packet.rows.filter(row=>row.resolution==='ambiguous').length,bytes,tokens:fitted.output_fit.estimated_tokens});}
    if(copyTracker){const scope='pm-vcs-tracker';const packet=await glossaryPacket(host,{id,scope_key:scope,limit:100});const fitted=fitEnvelope(host,envelope(packet,scope),8192);packetBytes+=fitted.output_fit.output_bytes;packetTokens+=fitted.output_fit.estimated_tokens;packets.push({scope,returned:packet.returned,ambiguous:packet.rows.filter(row=>row.resolution==='ambiguous').length,bytes:fitted.output_fit.output_bytes,tokens:fitted.output_fit.estimated_tokens});}
    assert.ok(packetBytes<=rawBytes/2);assert.equal(correct,copyTracker?46:42);assert.equal(abstained,10);
    let budgetRefusal:{code:string;remedy:string;details:Record<string,unknown>}|undefined;try{fitEnvelope(host,envelope(ambiguity,'root'),1);assert.fail('Tiny witness budget must refuse');}catch(error){assert.ok(error instanceof GlossaryRefusal);assert.equal(error.code,'output_budget');budgetRefusal={code:error.code,remedy:error.remedy,details:error.details};}
    const report={schema_version:1,tracker_evidence:trackerEvidence,selected_tracker_field_bytes:[...selectedFields.values()].reduce((sum,text)=>sum+Buffer.byteLength(text),0),probe_receipts:probeReceipts,budget_refusal:budgetRefusal,ambiguity_resolution:{term:'gate',scope:'pm-vcs',expected:['pm-vcs-gate'],actual:narrower.candidates.map(sense=>sense.sense_id),resolution:narrower.resolution},sources:sourceReceipts,copied_tracker_revision:trackerRevision,copied_items:copiedItems,raw_item_bytes:rawItemBytes,raw_item_tokens:Math.ceil(rawItemBytes/4),terms:new Set(expected.map(probe=>probe.term)).size,senses,bindings:0,bindings_status:'deferred_by_first_slice',unambiguous_correct:correct,unambiguous_total:expected.length,abstained,abstention_total:10,ambiguities_detected:1,ambiguities_resolved_by_narrower_scope:1,raw_passage_bytes:rawBytes,raw_passage_tokens:Math.ceil(rawBytes/4),packet_bytes:packetBytes,packet_tokens:packetTokens,reduction_percent:Math.round((1-packetBytes/rawBytes)*10000)/100,packets,wall_ms:Math.round(performance.now()-start),owner_operations:(await readGlossary(host,id)).state.operations.length};
    return report;
  }finally{await rm(root,{recursive:true,force:true});}
}
