// Run only against disposable Docker services, never a linked or hosted project.
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { includeSnapshotPath, localStatus, SUPABASE_CLI_VERSION } from './local-setup-contract.mjs';

const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  !/^(VITE_|SUPABASE_|MODEL_|MOODLE_|YOUTUBE_|SECURITY_TEST_|LOVABLE_)/.test(name)));
const exec = (cmd, args, cwd, options = {}) => execFileSync(cmd, args, {
  cwd, env, stdio: 'pipe', timeout: 600_000, maxBuffer: 32 * 1024 * 1024, ...options,
});
let stage = 'Docker prerequisite';
let workspace;
let app;
let started = false;
const cli = (...args) => exec('bunx', [`supabase@${SUPABASE_CLI_VERSION}`, ...args], workspace);

try {
  exec('docker', ['info']);
  exec('bun', ['--version']);
  workspace = mkdtempSync(join(tmpdir(), 'nextstep-clean-'));
  stage = 'Committed source snapshot';
  const paths = exec('git', ['ls-tree', '-r', '--name-only', '-z', 'HEAD']).toString()
    .split('\0').filter(Boolean).filter(includeSnapshotPath);
  const archive = exec('git', ['archive', '--format=tar', 'HEAD', '--', ...paths]);
  exec('tar', ['-xf', '-', '-C', workspace], undefined, { input: archive });
  const commit = exec('git', ['rev-parse', 'HEAD']).toString().trim();
  console.log(`Checking committed snapshot ${commit}; uncommitted changes are not included.`);
  const configPath = join(workspace, 'supabase/config.toml');
  const project = `nextstep-check-${randomUUID().slice(0, 8)}`;
  writeFileSync(configPath, readFileSync(configPath, 'utf8').replace(/^project_id\s*=.*$/m, `project_id = "${project}"`));
  stage = 'Frozen dependency installation';
  exec('bun', ['install', '--frozen-lockfile'], workspace);
  stage = 'Full local Supabase startup';
  // Unique project ID plus normal port-conflict checks protect existing stacks.
  started = true;
  cli('start');
  stage = 'Local migration replay and seed';
  cli('db', 'reset', '--local');
  const { url, key } = localStatus(JSON.parse(cli('status', '--output', 'json').toString()));
  // This temporary file contains ONLY the freshly generated local public key.
  writeFileSync(join(workspace, '.env'), `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_PUBLISHABLE_KEY=${key}\n`);
  stage = 'Real PostgreSQL, Auth, API, seed and completion checks';
  exec('node', ['scripts/verify-local-setup.mjs', project, url], workspace, {
    env: { ...env, NEXTSTEP_LOCAL_ANON_KEY: key },
  });
  stage = 'Regression tests';
  exec('bun', ['run', 'test'], workspace);
  stage = 'Front-end startup and sign-in page';
  app = spawn('bun', ['run', 'dev', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
    cwd: workspace, env, stdio: 'ignore', detached: true,
  });
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:5173/auth');
      const html = await response.text();
      if (response.ok && html.includes('Sign in') && html.includes('NextStep')) { ready = true; break; }
    } catch { /* Vite is still starting. */ }
    if (app.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error('Sign-in page did not become ready');
  console.log('PASS: clean committed snapshot installs; local services, migrations, seed, Auth, RLS, completion, tests and sign-in page verified.');
} catch {
  // Subprocess output can contain CLI keys or sessions: never print it.
  console.error(`FAIL: ${stage}. Requires Docker, Bun, Git, tar, Node 22.23.5 and free local ports. No hosted database was contacted or reset.`);
  process.exitCode = 1;
} finally {
  if (app?.pid) {
    try { process.kill(-app.pid, 'SIGTERM'); } catch { /* Already exited. */ }
  }
  if (started) {
    try { cli('stop', '--no-backup'); }
    catch { console.error('Cleanup failed; stop the temporary nextstep-check Docker stack manually.'); process.exitCode = 1; }
  }
  if (workspace) rmSync(workspace, { recursive: true, force: true });
}