import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// tree-digest.mjs is what the deploy chain records against each step. The
// point of the default mode is that it moves when the app's code moves and
// at no other time - not on a checkpoint commit, not on a build leftover, not
// on the request file or the secrets file the steps write as part of their
// job.

const SCRIPT = join(__dirname, 'tree-digest.mjs');

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const git = (dir: string, ...args: string[]) =>
  spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { encoding: 'utf8' });

const repo = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'tree-digest-test-'));
  dirs.push(dir);
  git(dir, 'init', '-q');
  writeFileSync(join(dir, '.gitignore'), 'node_modules\n*.tsbuildinfo\n.env*\n.kst-deploy/\n');
  writeFileSync(join(dir, 'package.json'), '{"name":"probe"}');
  mkdirSync(join(dir, 'app'));
  writeFileSync(join(dir, 'app', 'page.tsx'), 'export default () => null;\n');
  writeFileSync(join(dir, 'DEPLOY_REQUEST.md'), 'app-name: probe\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'first');
  return dir;
};

const digest = (dir: string, ...args: string[]) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args, dir], { encoding: 'utf8' });
  return { status: r.status, out: (r.stdout ?? '').trim() };
};

describe('tree-digest.mjs (run-record digest)', () => {
  it('prints one sha256 digest and exits 0', () => {
    const run = digest(repo());
    expect(run.status).toBe(0);
    expect(run.out).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('does not move on a checkpoint commit', () => {
    const dir = repo();
    writeFileSync(join(dir, 'app', 'page.tsx'), 'export default () => "changed";\n');
    const before = digest(dir).out;
    git(dir, 'commit', '-q', '-am', 'checkpoint');
    expect(digest(dir).out).toBe(before);
  });

  it('moves when code changes, is added, or is deleted', () => {
    const dir = repo();
    const start = digest(dir).out;
    writeFileSync(join(dir, 'app', 'page.tsx'), 'export default () => "changed";\n');
    const edited = digest(dir).out;
    expect(edited).not.toBe(start);
    writeFileSync(join(dir, 'app', 'new.ts'), 'export const x = 1;\n');
    const added = digest(dir).out;
    expect(added).not.toBe(edited);
    unlinkSync(join(dir, 'package.json'));
    expect(digest(dir).out).not.toBe(added);
  });

  it('ignores the request file, secrets files, the run record and ignored build leftovers', () => {
    const dir = repo();
    const start = digest(dir).out;
    writeFileSync(join(dir, 'DEPLOY_REQUEST.md'), 'app-name: other\n');
    writeFileSync(join(dir, '.env'), 'KEY=value\n');
    mkdirSync(join(dir, '.kst-deploy'));
    writeFileSync(join(dir, '.kst-deploy', 'run-record.json'), '{}');
    writeFileSync(join(dir, 'tsconfig.tsbuildinfo'), 'build noise');
    expect(digest(dir).out).toBe(start);
  });

  it('refuses a folder that is not a git repo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tree-digest-test-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'package.json'), '{}');
    const run = digest(dir);
    expect(run.status).toBe(2);
    expect(run.out).not.toMatch(/^sha256:/);
  });
});

describe('tree-digest.mjs --sent (sign-off digest)', () => {
  it('covers the request file but never node_modules, .env or the run record', () => {
    const dir = repo();
    const start = digest(dir, '--sent').out;
    expect(start).toMatch(/^sha256:[0-9a-f]{64}$/);
    mkdirSync(join(dir, 'node_modules'));
    writeFileSync(join(dir, 'node_modules', 'x.js'), 'x');
    writeFileSync(join(dir, '.env.local'), 'KEY=value\n');
    mkdirSync(join(dir, '.kst-deploy'));
    writeFileSync(join(dir, '.kst-deploy', 'run-record.json'), '{}');
    expect(digest(dir, '--sent').out).toBe(start);
    writeFileSync(join(dir, 'DEPLOY_REQUEST.md'), 'app-name: other\n');
    expect(digest(dir, '--sent').out).not.toBe(start);
  });
});
