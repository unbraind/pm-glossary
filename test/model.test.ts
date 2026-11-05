import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlossary, defineSense, addAlias, readGlossary, resolveTerm, digest } from '../dist/index.js';
import { fixture, request, hasCode } from './helpers.ts';

test('500 seeded random operation sequences agree with an independent exact scope oracle',async t=>{
  const {host,birth,native}=await fixture(t);let seed=0x51a5;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  let related=false;let id='';let gold=new Map<string,{term:string;scope:string;definition:string;language:string}>();let aliases:{term:string;scope:string;sense:string;language:string}[]=[];
  const old: Awaited<ReturnType<typeof request>>[]=[];let writes=0,reads=0,replays=0,refused=0;
  for(let sequence=0;sequence<500;sequence++){
    if(sequence%50===0){id=`corpus-model-${sequence}`;await createGlossary(host,{...birth,id,op:`birth-${sequence}`});gold=new Map();aliases=[];related=false;}
    const checkRelationship=random()<0.15;if(checkRelationship){related=random()<0.5;await native.update(id,related?{replaceDeps:true,dep:['id=corpus-lexicon,kind=related']}:{clearDeps:true});}
    const key=`s-${sequence}`;const terms=['gate','release',' lease ','é','e\u0301','Receipt','receipt'];const term=terms[Math.floor(random()*terms.length)];const scope=random()<0.5?'root':'delivery';const language=random()<0.2?'de':'en';
    const input=await request(host,id,key,term);input.sense.scope_key=scope;input.sense.language=language;input.sense.definition=`Meaning ${sequence}.`;await defineSense(host,input);old.push(input);writes++;gold.set(key,{term,scope,language,definition:input.sense.definition});
    if(random()<0.5){const alias={alias_id:`a-${sequence}`,term:terms[Math.floor(random()*terms.length)],scope_key:scope,language,sense_id:key};await addAlias(host,{id,op:`alias-${sequence}`,revision:(await readGlossary(host,id)).revision,alias});aliases.push({term:alias.term,scope,language,sense:key});writes++;}
    if(random()<0.5){const previous=old[Math.floor(random()*old.length)];assert.equal((await defineSense(host,previous)).replayed,true);replays++;}else{await assert.rejects(defineSense(host,{...input,op:`stale-${sequence}`,revision:'0'.repeat(64)}),hasCode('revision_conflict'));refused++;}
    const probeTerm=terms[Math.floor(random()*terms.length)];const probeScope=random()<0.5?'delivery':'research';const probeLanguage=random()<0.5?'en':'de';let expected:string[]=[];
    for(const level of [probeScope,'root']){const candidates=new Set([...gold.entries()].filter(([,v])=>v.term===probeTerm&&v.scope===level&&v.language===probeLanguage).map(([k])=>k));for(const alias of aliases)if(alias.term===probeTerm&&alias.scope===level&&alias.language===probeLanguage)candidates.add(alias.sense);if(candidates.size){expected=[...candidates].sort();break;}}
    const actual=await resolveTerm(host,{id,term:probeTerm,scope_key:probeScope,language:probeLanguage});assert.deepEqual(actual.candidates.map(s=>s.sense_id),expected);assert.equal(actual.usable,expected.length===1);reads++;
    if(checkRelationship){const item=await native.get(id,{outputInclude:'full',outputBudget:'unbounded'});assert.ok('item' in item);assert.equal(item.item.dependencies?.length??0,related?1:0);}
    const state=(await readGlossary(host,id)).state;assert.deepEqual(state.senses.map(s=>[s.sense_id,s.term,s.scope_key,s.language,s.definition]),[...gold].map(([k,v])=>[k,v.term,v.scope,v.language,v.definition]));
  }
  t.diagnostic(JSON.stringify({seed:'0x51a5',sequences:500,writes,reads,replays,refused}));
  assert.equal(reads,500);assert.ok(writes>=500&&replays>100&&refused>100);assert.equal(digest({b:1,a:2}),digest({a:2,b:1}));
});
