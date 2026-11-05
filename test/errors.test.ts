import test from 'node:test';
import assert from 'node:assert/strict';
import { createPmCliExpectedError } from '@unbrained/pm-cli/sdk';
import { refusal, exitCode } from '../dist/src/errors.js';

test('system failures expose only a generic I/O refusal and bounded code details',()=>{
  for(const code of ['ENOENT','EACCES','EIO','ERR_ACCESS_DENIED']){
    const error=Object.assign(new Error('Synthetic private diagnostic'),{code,path:'private-input',remedy:'private-remedy',exitCode:4});
    const result=refusal(error);assert.equal(result.code,'io_error');assert.deepEqual(result.details,{native_code:code});
    assert.equal(result.nativeExit,undefined);assert.equal(result.retryable,false);assert.equal(exitCode(result.code),5);
    assert.doesNotMatch(JSON.stringify(result),/private/);assert.doesNotMatch(result.message,/private/);
  }
  for(const error of [null,undefined,'ENOENT',1,{}, {code:1},{code:'not_a_contract'},{code:'E'.repeat(65)},{code:'E!'}, {code:'permission_denied',exitCode:4,context:{}}])assert.equal(refusal(error).code,'outcome_unknown');
});

test('native SDK contracts preserve domain categories and valid native exit codes',()=>{
  const conflict=createPmCliExpectedError('Fixture',{exitCode:4,context:{code:'item_revision_conflict',required:'Reread the owner'}});
  const mapped=refusal(conflict);assert.equal(mapped.code,'revision_conflict');assert.equal(mapped.retryable,true);assert.equal(mapped.remedy,'Reread the owner');assert.equal(exitCode(mapped.code,mapped.nativeExit),4);
  assert.equal(refusal(createPmCliExpectedError('No code')).code,'outcome_unknown');
  for(const status of [0,-1,1.5,256]){
    const invalid=Object.assign(createPmCliExpectedError('Fixture',{context:{code:'permission_denied'}}),{exitCode:status});
    assert.equal(refusal(invalid).nativeExit,undefined);
  }
  const allowed=createPmCliExpectedError('Fixture',{exitCode:255,context:{code:'permission_denied'}});
  assert.equal(refusal(allowed).nativeExit,255);
});
