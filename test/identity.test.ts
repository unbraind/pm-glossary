import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { gitEnvironment, npmEnvironment, testEnvironment } from '../scripts/environment.ts';

test('identity policy admits GitHub merge committers while preserving strict authors',()=>{
  const root=mkdtempSync(join(tmpdir(),'glossary-identities-'));
  const maintainer='1153461+unbraind@users.noreply.github.com';
  const env={...gitEnvironment(testEnvironment(npmEnvironment(process.env))),GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'};
  const git=(args:string[])=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  try{
    mkdirSync(join(root,'scripts'));mkdirSync(join(root,'.github'));
    for(const file of ['scripts/identity-gate.ts','scripts/environment.ts','.github/approved-git-identities.txt'])cpSync(file,join(root,file));
    git(['init','-b','main']);git(['add','scripts/identity-gate.ts','scripts/environment.ts','.github/approved-git-identities.txt']);
    const commit=(author:string,committer:string,committerName='GitHub')=>execFileSync('git',['-c','commit.gpgsign=false','commit','--allow-empty','-m','Synthetic identity fixture'],{cwd:root,env:{...env,GIT_AUTHOR_NAME:'SteveBot',GIT_AUTHOR_EMAIL:author,GIT_COMMITTER_NAME:committerName,GIT_COMMITTER_EMAIL:committer},stdio:'pipe'});
    commit(maintainer,maintainer,'SteveBot');const base=git(['rev-parse','HEAD']);
    const run=()=>spawnSync(process.execPath,['scripts/identity-gate.ts'],{cwd:root,env,encoding:'utf8',timeout:30000});
    assert.equal(run().status,0);
    for(const [name,author,committer,committerName,allowed] of [
      ['rebase',maintainer,'noreply@github.com','GitHub',true],
      ['squash','41898282+github-actions[bot]@users.noreply.github.com','noreply@github.com','GitHub',true],
      ['web-author','noreply@github.com',maintainer,'SteveBot',false],
      ['wrong-name',maintainer,'noreply@github.com','Other',false],
      ['unknown-author','unapproved@example.invalid',maintainer,'SteveBot',false],
      ['unknown-committer',maintainer,'unapproved@example.invalid','Other',false],
    ] as const){
      git(['checkout','-b',name,base]);commit(author,committer,committerName);
      const result=run();assert.equal(result.status,allowed?0:1,result.stdout+result.stderr);
      if(!allowed)assert.match(result.stderr,/Unapproved commit identity/);
    }
  }finally{rmSync(root,{recursive:true,force:true});}
});
