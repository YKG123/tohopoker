// Builds the game and publishes dist/ to the gh-pages branch (GitHub Pages serves it from there).
// Usage: npm run deploy
// Locally it pushes with your own git login; in GitHub Actions (.github/workflows/deploy.yml) with the
// workflow's GITHUB_TOKEN. The branch holds only the latest build: each deploy replaces it.
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });
const read = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8' }).trim();

run('npm', ['run', 'build']);

const sha = read('git', ['rev-parse', '--short', 'HEAD']);
const { GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_ACTIONS } = process.env;
const remote = GITHUB_TOKEN && GITHUB_REPOSITORY
  ? `https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git`
  : read('git', ['remote', 'get-url', 'origin']);

// GitHub Pages would otherwise run the files through Jekyll.
writeFileSync(join(dist, '.nojekyll'), '');

// A throwaway repo in dist/ with one commit, force-pushed over the branch.
rmSync(join(dist, '.git'), { recursive: true, force: true });
run('git', ['init', '--quiet', '--initial-branch', 'gh-pages'], dist);
if (GITHUB_ACTIONS) {
  run('git', ['config', 'user.name', 'github-actions[bot]'], dist);
  run('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'], dist);
}
run('git', ['add', '--all'], dist);
run('git', ['commit', '--quiet', '-m', `Deploy ${sha}`], dist);
run('git', ['push', '--force', '--quiet', remote, 'gh-pages'], dist);
rmSync(join(dist, '.git'), { recursive: true, force: true });
console.log(`Deployed ${sha} to the gh-pages branch.`);
