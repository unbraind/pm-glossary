/** Check every local commit identity and tracked content without revealing private matches. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { gitEnvironment } from './environment.ts';
const env = { ...gitEnvironment(process.env), GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const approved = new Set(readFileSync('.github/approved-git-identities.txt','utf8').split('\n').filter(line=>line !== '' && !line.startsWith('#')));
const identities = execFileSync('git', ['log', '--format=%ae%x00%cn%x00%ce'], { encoding: 'utf8', env }).trim().split('\n');
for (const identity of identities) {
  const [author, committerName, committer] = identity.split('\0');
  if (!approved.has(author) || author === 'noreply@github.com' || !approved.has(committer) || (committer === 'noreply@github.com' && committerName !== 'GitHub')) throw new Error('Unapproved commit identity');
}
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', env }).split('\0').filter(Boolean);
for (const file of files) if (/(?:[\\/](?:home|Users)[\\/]|[\\/]root[\\/])/iu.test(readFileSync(file, 'utf8'))) throw new Error(`Private path policy failed in ${file}`);
console.log(`identity-gate: ${identities.length} commits, ${files.length} tracked files, zero violations`);
