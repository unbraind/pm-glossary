import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { gitEnvironment, npmEnvironment, testEnvironment } from '../scripts/environment.ts';

test('identity policy admits GitHub merge committers while preserving strict authors',()=>{
  const root=mkdtempSync(join(tmpdir(),'glossary-identities-'));
  const maintainer='1153461+unbraind@users.noreply.github.com';
  const env={...Object.fromEntries(Object.entries(gitEnvironment(testEnvironment(npmEnvironment(process.env)))).filter(([key])=>!/^GITHUB_/i.test(key))),GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'};
  const git=(args:string[])=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  try{
    mkdirSync(join(root,'scripts'));mkdirSync(join(root,'.github'));
    for(const file of ['scripts/identity-gate.ts','scripts/environment.ts','.github/approved-git-identities.txt'])cpSync(file,join(root,file));
    git(['init','-b','main']);git(['add','scripts/identity-gate.ts','scripts/environment.ts','.github/approved-git-identities.txt']);
    let sequence=0;
    const commit=(author:string,committer:string,committerName='GitHub')=>execFileSync('git',['-c','commit.gpgsign=false','commit','--allow-empty','-m',`Synthetic identity fixture ${++sequence}`],{cwd:root,env:{...env,GIT_AUTHOR_NAME:'SteveBot',GIT_AUTHOR_EMAIL:author,GIT_COMMITTER_NAME:committerName,GIT_COMMITTER_EMAIL:committer},stdio:'pipe'});
    commit(maintainer,maintainer,'SteveBot');const base=git(['rev-parse','HEAD']);
    const run=(eventName='',event:unknown={},cwd=root)=>{
      const eventPath=join(root,'event.json');writeFileSync(eventPath,JSON.stringify(event));
      return spawnSync(process.execPath,['scripts/identity-gate.ts'],{cwd,env:{...env,GITHUB_EVENT_NAME:eventName,GITHUB_EVENT_PATH:eventPath},encoding:'utf8',timeout:30000});
    };
    assert.equal(run().status,0);
    const shallow=join(root,'shallow');
    git(['clone','--depth=1',pathToFileURL(root).href,shallow]);
    const shallowResult=run('',{},shallow);
    assert.equal(shallowResult.status,1);assert.match(shallowResult.stderr,/Shallow clone.*full history.*git fetch --unshallow/);assert.doesNotMatch(shallowResult.stdout,/zero violations/);
    execFileSync('git',['fetch','--unshallow'],{cwd:shallow,env,stdio:'pipe'});
    const completeResult=run('',{},shallow);
    assert.equal(completeResult.status,0,completeResult.stderr);assert.match(completeResult.stdout,/zero violations/);

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
    git(['checkout','main']);commit(maintainer,maintainer,'SteveBot');const main=git(['rev-parse','HEAD']);
    for(const [name,author,committer,allowed] of [
      ['valid-pr',maintainer,maintainer,true],
      ['bad-pr-author','unapproved@example.invalid',maintainer,false],
      ['bad-pr-committer',maintainer,'unapproved@example.invalid',false],
    ] as const){
      git(['checkout','-b',name,base]);commit(author,committer,'SteveBot');
      // A clean tip must not hide an unapproved earlier real branch commit.
      commit(maintainer,maintainer,'SteveBot');const head=git(['rev-parse','HEAD']);
      git(['checkout','-b',`${name}-merge`,main]);
      git(['-c',`user.email=${maintainer}`,'-c','user.name=SteveBot','merge','--no-ff','--no-commit',head]);
      commit('unapproved@example.invalid','noreply@github.com');
      const pr=run('pull_request',{pull_request:{base:{sha:main},head:{sha:head}}});
      assert.equal(pr.status,allowed?0:1,`PR checkout: ${pr.stdout}${pr.stderr}`);
      if(allowed)assert.match(pr.stdout,/2 commits,/);else assert.match(pr.stderr,/Unapproved commit identity/);
      // Push events check actual main commits, including merged branch ancestry.
      const synthetic=git(['rev-parse','HEAD']);
      assert.match(run('push',{before:main,after:synthetic}).stderr,/Unapproved commit identity/);
      git(['checkout','-B','main',head]);
      const push=run('push',{before:base,after:head});
      assert.equal(push.status,allowed?0:1,`push checkout: ${push.stdout}${push.stderr}`);
      if(allowed)assert.match(push.stdout,/2 commits,/);else assert.match(push.stderr,/Unapproved commit identity/);
      const initialPush=run('push',{before:'0'.repeat(40),after:head});
      assert.equal(initialPush.status,allowed?0:1,initialPush.stdout+initialPush.stderr);
    }
    const empty=run('pull_request',{pull_request:{base:{sha:main},head:{sha:main}}});
    assert.equal(empty.status,0,empty.stdout+empty.stderr);assert.match(empty.stdout,/0 commits,/);
    assert.match(run('pull_request',{pull_request:{base:{sha:'invalid'},head:{sha:main}}}).stderr,/Invalid PR commit range/);
    assert.match(run('push',{before:'invalid',after:main}).stderr,/Invalid push commit range/);
  }finally{rmSync(root,{recursive:true,force:true});}
});


test('identity fixtures ignore inherited CI events whose PR base is absent from a shallow checkout',()=>{
  const root=mkdtempSync(join(tmpdir(),'glossary-ci-identities-'));
  const maintainer='1153461+unbraind@users.noreply.github.com';
  const env={...gitEnvironment(testEnvironment(npmEnvironment(process.env))),GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1',GIT_AUTHOR_NAME:'SteveBot',GIT_AUTHOR_EMAIL:maintainer,GIT_COMMITTER_NAME:'SteveBot',GIT_COMMITTER_EMAIL:maintainer};
  const git=(args:string[],cwd=root)=>execFileSync('git',args,{cwd,env,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  try{
    // Match the production checkout contract: full history is needed by the real audit.
    const checkout=readFileSync('.github/workflows/ci.yml','utf8').split('      - name: Checkout')[1].split('      - name: Setup Node.js')[0];
    assert.match(checkout,/fetch-depth: 0/);assert.match(checkout,/fetch-tags: true/);
    for(const file of ['test/identity.test.ts','scripts/identity-gate.ts','scripts/environment.ts','.github/approved-git-identities.txt']){
      mkdirSync(join(root,file,'..'),{recursive:true});cpSync(file,join(root,file));
    }
    git(['init','-b','main']);git(['add','.']);git(['-c','commit.gpgsign=false','commit','-m','Synthetic CI base']);
    const base=git(['rev-parse','HEAD']);
    git(['-c','commit.gpgsign=false','commit','--allow-empty','-m','Synthetic CI head']);const head=git(['rev-parse','HEAD']);
    const shallow=join(root,'checkout');git(['clone','--depth=1',pathToFileURL(root).href,shallow]);
    assert.equal(git(['rev-parse','--is-shallow-repository'],shallow),'true');
    assert.notEqual(spawnSync('git',['cat-file','-e',base],{cwd:shallow,env,stdio:'pipe'}).status,0);
    const eventPath=join(root,'ci-event.json');writeFileSync(eventPath,JSON.stringify({pull_request:{base:{sha:base},head:{sha:head}}}));
    const result=spawnSync(process.execPath,['--test','--test-reporter=tap','--test-concurrency=2','--test-name-pattern=^identity policy admits GitHub merge committers while preserving strict authors$','test/identity.test.ts'],{
      cwd:shallow,env:{...env,GITHUB_EVENT_NAME:'pull_request',GITHUB_EVENT_PATH:eventPath,GITHUB_BASE_REF:'main',GITHUB_HEAD_REF:'feat/glossary',GITHUB_SHA:head,GITHUB_REF:'refs/pull/1/merge'},encoding:'utf8',timeout:120000,
    });
    assert.equal(result.status,0,result.stdout+result.stderr);assert.match(result.stdout,/# pass 1/);assert.match(result.stdout,/# fail 0/);
  }finally{rmSync(root,{recursive:true,force:true});}
});
