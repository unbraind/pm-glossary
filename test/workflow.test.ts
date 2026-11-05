import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decideDailyRelease } from 'pm-ops/daily-release';
import { verify } from 'pm-ops/attestation';

test('daily release remains main-only and approval-gated with exact archived provenance publishing',()=>{
  const workflow=readFileSync('.github/workflows/release.yml','utf8');assert.match(workflow,/schedule:/);assert.match(workflow,/workflow_dispatch:/);
  assert.equal((workflow.match(/if: github.ref == 'refs\/heads\/main' && vars.PM_RELEASE_APPROVED == 'true'/g)??[]).length,3);
  const publishes=[...workflow.matchAll(/^\s*npm publish\s+(\S+)([^\n]*)/gm)];assert.equal(publishes.length,1);assert.equal(publishes[0][1],'./release-artifact/package.tgz');assert.match(publishes[0][2],/--provenance --ignore-scripts/);
  assert.match(workflow,/sha256sum --check --strict/);assert.match(workflow,/npm run release:check/);assert.match(workflow,/npm run release:notes/);assert.match(workflow,/id-token: write/);
  const sync=readFileSync('.github/workflows/pm-github-sync.yml','utf8');assert.match(sync,/pm-github-sync.yml@1191c65f88bb9129c33e74a650afc8d9c0eae219/);assert.match(sync,/pm-github-version: "2026.10.28"/);
  assert.deepEqual(verify(process.cwd()).failures,[]);
});
test('canonical pm-ops release planner covers no-change dependency-only collision and stale PR decisions',()=>{
  const base={existingPrs:[],mainSha:'a'.repeat(40),lastRelease:{tag:'v2026.11.4',sha:'b'.repeat(40)},today:'2026.11.5',hasChanges:true,releaseTags:['v2026.11.4']};
  const unchanged=decideDailyRelease({...base,hasChanges:false});assert.equal(unchanged.should_release,false);
  const dependency=decideDailyRelease(base);assert.equal(dependency.should_release,true);assert.equal(dependency.npm_version,'2026.11.5');
  const collision=decideDailyRelease({...base,releaseTags:['v2026.11.4','v2026.11.5'],publishedToday:true});assert.equal(collision.should_release,false);
  const stale=decideDailyRelease({...base,existingPrs:[{number:4,headRefName:'release/v2026.11.4',isCrossRepository:false,author:{login:'github-actions[bot]'}}]});assert.equal(stale.base_sha,base.mainSha);
  // The archived handoff is published only after the complete gate succeeds.
  const workflow=readFileSync('.github/workflows/release.yml','utf8');assert.match(workflow,/needs.prepare.outputs.should_release == 'true'/);assert.match(workflow,/steps.publish.outcome == 'success'/);assert.ok(workflow.indexOf('npm run release:check')<workflow.indexOf('npm publish ./release-artifact/package.tgz'));
});
