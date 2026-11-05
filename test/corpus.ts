import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { PmClient } from '@unbrained/pm-cli/sdk/core';
import { certifyCompleteListResult } from '@unbrained/pm-cli/sdk/runtime';
import { createDirectoryHost, createGlossary, defineSense, resolveTerm, glossaryPacket, envelope, fitEnvelope, readGlossary } from '../dist/index.js';
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
/** Reproduce public scoped resolution measurements in a fresh plain native tracker. */
export async function realData(copyTracker=false) {
  const root=await mkdtemp(join(tmpdir(),'glossary-corpus-'));const start=performance.now();
  try{
    const pmRoot=join(root,'.agents/pm');let copiedItems=0,rawItemBytes=0,trackerRevision:string|null=null;
    if(copyTracker){
      const repository=new URL('../../pm-vcs',import.meta.url).pathname;const env=gitEnvironment(process.env);trackerRevision=execFileSync('git',['-C',repository,'rev-parse','HEAD'],{env,encoding:'utf8'}).trim();
      const files=execFileSync('git',['-C',repository,'ls-tree','-r','--name-only',trackerRevision,'--','.agents/pm'],{env,encoding:'utf8'}).trim().split('\n').filter(Boolean);
      for(const file of files){if(!/\.(?:toon|json|jsonl)$/.test(file))continue;const bytes=execFileSync('git',['-C',repository,'show',`${trackerRevision}:${file}`],{env,maxBuffer:32*1024*1024});await mkdir(dirname(join(root,file)),{recursive:true});await writeFile(join(root,file),bytes);}
      const reader=new PmClient({pmRoot,author:'corpus',noExtensions:true});const result=certifyCompleteListResult(await reader.listAllComplete({includeBody:true}));copiedItems=result.items.length;
      rawItemBytes=Buffer.byteLength(JSON.stringify(result.items));
    }else{
      await new PmClient({pmRoot,author:'corpus',noExtensions:true}).init('lexicon',{defaults:true,agentGuidance:'skip',mergeFence:false});
    }
    const native=new PmClient({pmRoot,author:'corpus',noExtensions:true});const host=createDirectoryHost(pmRoot,'corpus');
    const sources=JSON.parse(await readFile(new URL('./fixtures/public-corpus.json',import.meta.url),'utf8')) as Source[];
    const gold=JSON.parse(await readFile(new URL('./fixtures/gold-meanings.json',import.meta.url),'utf8')) as Record<string,Record<string,string>>;
    const born=await createGlossary(host,{id:'lexicon-public',op:'birth',title:'Public reviewed domain meanings',domain_key:'fleet',scopes:[{scope_key:'root',parent:null},...sources.map(source=>({scope_key:source.repository.split('/')[1],parent:'root'}))]});
    const id=born.owner_id;let revision=born.revision;let rawBytes=0,senses=0,correct=0;const expected: {scope:string;term:string;sense_id:string}[]=[];const sourceReceipts=[];
    for(const source of sources){
      const domain=source.repository.split('/')[1];assert.deepEqual(source.terms,gold[domain]);const text=await readFile(new URL(`./fixtures/${domain}.md`,import.meta.url),'utf8');const hash=createHash('sha256').update(text).digest('hex');assert.equal(hash,source.selected_sha256);rawBytes+=Buffer.byteLength(text);
      const doc=await native.create({id:`public-${domain}`,title:`Public ${domain} source passages`,body:text});const sourceRevision=await native.readItemRevision(doc.item.id);sourceReceipts.push({repository:source.repository,revision:source.revision,source_sha256:source.sha256,selected_sha256:hash,selected_bytes:Buffer.byteLength(text)});
      for(const [term,definition] of Object.entries(source.terms)){
        const senseId=`${domain}-${term}`;assert.ok(text.includes(term));const result=await defineSense(host,{id,op:senseId,revision,sense:{sense_id:senseId,term,scope_key:domain,language:'en',definition,provenance:[{item_id:doc.item.id,item_hash:sourceRevision.item_hash,field_pointer:'/body'}]}});revision=result.revision;senses++;expected.push({scope:domain,term,sense_id:senseId});
      }
    }
    for(const probe of expected){const result=await resolveTerm(host,{id,scope_key:probe.scope,term:probe.term});assert.equal(result.resolution,'resolved');assert.equal(result.candidates[0].sense_id,probe.sense_id);correct++;}
    for(const [senseId,definition] of [['gate-check','A reviewed acceptance condition.'],['gate-door','A physical barrier controlling an opening.']] as const){revision=(await defineSense(host,{id,op:senseId,revision,sense:{sense_id:senseId,term:'gate',scope_key:'root',language:'en',definition}})).revision;senses++;}
    const ambiguity=await resolveTerm(host,{id,term:'gate',scope_key:'root'});assert.equal(ambiguity.resolution,'ambiguous');assert.equal(ambiguity.candidates.length,2);let abstained=1;
    const narrower=await resolveTerm(host,{id,term:'gate',scope_key:'pm-vcs'});assert.equal(narrower.resolution,'resolved');
    for(let n=0;n<9;n++){const result=await resolveTerm(host,{id,term:`not-defined-${n}`,scope_key:'root'});assert.equal(result.usable,false);assert.equal(result.resolution,'unknown');abstained++;}
    let packetBytes=0,packetTokens=0;const packets=[];
    for(const source of sources){const scope=source.repository.split('/')[1];const packet=await glossaryPacket(host,{id,scope_key:scope,limit:100});const fitted=fitEnvelope(host,envelope(packet,scope),8192);const bytes=fitted.output_fit.output_bytes;packetBytes+=bytes;packetTokens+=fitted.output_fit.estimated_tokens;packets.push({scope,returned:packet.returned,ambiguous:packet.rows.filter(row=>row.resolution==='ambiguous').length,bytes,tokens:fitted.output_fit.estimated_tokens});}
    assert.ok(packetBytes<=rawBytes/2);assert.equal(correct,42);assert.equal(abstained,10);
    const report={schema_version:1,sources:sourceReceipts,copied_tracker_revision:trackerRevision,copied_items:copiedItems,raw_item_bytes:rawItemBytes,raw_item_tokens:Math.ceil(rawItemBytes/4),terms:new Set(expected.map(probe=>probe.term)).size,senses,bindings:0,bindings_status:'deferred_by_first_slice',unambiguous_correct:correct,unambiguous_total:expected.length,abstained,abstention_total:10,ambiguities_detected:1,ambiguities_resolved_by_narrower_scope:1,raw_passage_bytes:rawBytes,raw_passage_tokens:Math.ceil(rawBytes/4),packet_bytes:packetBytes,packet_tokens:packetTokens,reduction_percent:Math.round((1-packetBytes/rawBytes)*10000)/100,packets,wall_ms:Math.round(performance.now()-start),owner_operations:(await readGlossary(host,id)).state.operations.length};
    return report;
  }finally{await rm(root,{recursive:true,force:true});}
}
