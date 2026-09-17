import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// preflight.mjs is exercised as a child process against fixture folders, the
// same way the deployment agent runs it. The slow steps (install, build) are
// skipped with flags; the start step runs against a ten-line fake server.

const SCRIPT = join(__dirname, 'preflight.mjs');
const SKIP_ALL = ['--skip-install', '--skip-build', '--skip-start'];
const IS_WINDOWS = process.platform === 'win32';

interface Check {
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'skipped';
  ms: number;
  detail: string;
  logTail?: string;
}

interface Result {
  ok: boolean;
  shape: 'starter' | 'not-starter';
  checks: Check[];
  summary: string;
}

const dirs: string[] = [];

afterEach(() => {
  dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

const makeDir = (files: Record<string, string>): string => {
  const dir = mkdtempSync(join(tmpdir(), 'preflight-test-'));
  dirs.push(dir);
  Object.entries(files).forEach(([name, content]) => {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), content);
  });
  return dir;
};

const pkg = (extra: Record<string, unknown> = {}): string =>
  JSON.stringify({
    name: 'fake-app',
    version: '1.0.0',
    scripts: { start: 'node server.mjs' },
    dependencies: { next: '16.0.0' },
    ...extra,
  });

const starter = (extra: Record<string, string> = {}): Record<string, string> => ({
  'package.json': pkg(),
  'pnpm-lock.yaml': "lockfileVersion: '9.0'\n",
  'app/api/health/route.ts': 'export const GET = () => new Response("ok");\n',
  ...extra,
});

const run = (dir: string, flags: string[] = SKIP_ALL, env: NodeJS.ProcessEnv = {}) => {
  const result = spawnSync(process.execPath, [SCRIPT, ...flags, dir], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 90_000,
  });
  const lines = (result.stdout ?? '').trim().split('\n');
  const json = JSON.parse(lines[lines.length - 1] ?? '{}') as Result;
  return { status: result.status, json };
};

const check = (json: Result, name: string): Check | undefined =>
  json.checks.find((c) => c.name === name);

const portIsOpen = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });

const hasPnpm = (): boolean =>
  spawnSync('pnpm', ['--version'], { shell: IS_WINDOWS, encoding: 'utf8' }).status === 0;

describe('preflight.mjs - starter shape', () => {
  it('stops at a folder that is not the starter, without installing', () => {
    const dir = makeDir({ 'index.html': '<h1>hi</h1>' });
    const { status, json } = run(dir, []);
    expect(status).toBe(1);
    expect(json.ok).toBe(false);
    expect(json.shape).toBe('not-starter');
    expect(check(json, 'starter-shape')?.status).toBe('fail');
    const later = json.checks.filter((c) => c.name !== 'starter-shape');
    expect(later.every((c) => c.status === 'skipped')).toBe(true);
    expect(existsSync(join(dir, 'node_modules'))).toBe(false);
  });

  it('passes shape and lockfiles on a minimal starter', () => {
    const { status, json } = run(makeDir(starter()));
    expect(json.shape).toBe('starter');
    expect(check(json, 'starter-shape')?.status).toBe('pass');
    expect(check(json, 'lockfiles')?.status).toBe('pass');
    expect(check(json, 'install')?.status).toBe('skipped');
    expect(json.ok).toBe(true);
    expect(status).toBe(0);
    expect(typeof json.summary).toBe('string');
  });

  it('accepts a health route written in plain JavaScript', () => {
    const files = starter({ 'app/api/health/route.js': 'export const GET = () => new Response("ok");\n' });
    const { 'app/api/health/route.ts': _dropped, ...rest } = files;
    expect(check(run(makeDir(rest)).json, 'starter-shape')?.status).toBe('pass');
  });

  it('exits 2 for a folder that does not exist', () => {
    const { status, json } = run(join(tmpdir(), 'preflight-test-no-such-folder-xyz'));
    expect(status).toBe(2);
    expect(json.ok).toBe(false);
    expect(json.summary.length).toBeGreaterThan(0);
  });
});

describe('preflight.mjs - lockfiles', () => {
  it('fails on a stray package-lock.json and skips what depends on it', () => {
    const { status, json } = run(makeDir(starter({ 'package-lock.json': '{}' })));
    expect(status).toBe(1);
    expect(json.ok).toBe(false);
    expect(check(json, 'lockfiles')?.status).toBe('fail');
    expect(check(json, 'lockfiles')?.detail).toContain('package-lock.json');
    expect(check(json, 'install')?.status).toBe('skipped');
  });
});

describe('preflight.mjs - runtime-deps', () => {
  const devOnly = { 'package.json': pkg({ devDependencies: { lodash: '4.0.0' } }) };

  it('warns when runtime code imports a devDependencies-only package', () => {
    const dir = makeDir(starter({ ...devOnly, 'src/lib/thing.ts': "import get from 'lodash/get';\nexport const x = get;\n" }));
    const { status, json } = run(dir);
    expect(check(json, 'runtime-deps')?.status).toBe('warn');
    expect(check(json, 'runtime-deps')?.detail).toContain('lodash');
    expect(json.ok).toBe(true);
    expect(status).toBe(0);
  });

  it('warns on a require too', () => {
    const dir = makeDir(starter({ ...devOnly, 'server/index.js': "const _ = require('lodash');\n" }));
    expect(check(run(dir).json, 'runtime-deps')?.status).toBe('warn');
  });

  it('ignores type-only imports, test files and config files', () => {
    const dir = makeDir(starter({
      ...devOnly,
      'src/lib/thing.ts': "import type { Dictionary } from 'lodash';\nimport fs from 'node:fs';\nimport y from './y';\nexport type D = Dictionary<string>;\n",
      'src/lib/thing.test.ts': "import _ from 'lodash';\n",
      'vitest.config.ts': "import _ from 'lodash';\n",
    }));
    expect(check(run(dir).json, 'runtime-deps')?.status).toBe('pass');
  });
});

describe('preflight.mjs - hardcoded-port', () => {
  it('warns on listen with a number literal', () => {
    const dir = makeDir(starter({ 'server.mjs': "import http from 'node:http';\nhttp.createServer().listen(3000);\n" }));
    const { json } = run(dir);
    expect(check(json, 'hardcoded-port')?.status).toBe('warn');
    expect(check(json, 'hardcoded-port')?.detail).toContain('server.mjs');
    expect(json.ok).toBe(true);
  });

  it('warns on PORT = number with no process.env.PORT', () => {
    const dir = makeDir(starter({ 'server.mjs': 'const PORT = 8080;\nserver.listen(PORT);\n' }));
    expect(check(run(dir).json, 'hardcoded-port')?.status).toBe('warn');
  });

  it('does not warn when the port comes from process.env.PORT', () => {
    const dir = makeDir(starter({ 'server.mjs': 'const PORT = process.env.PORT || 3000;\nserver.listen(process.env.PORT);\n' }));
    expect(check(run(dir).json, 'hardcoded-port')?.status).toBe('pass');
  });
});

describe('preflight.mjs - start-and-health', () => {
  const server = (code: number): string => [
    "import http from 'node:http';",
    "import { writeFileSync } from 'node:fs';",
    'const port = Number(process.env.PORT);',
    'http.createServer((req, res) => {',
    `  res.statusCode = req.url === '/api/health' ? ${code} : 404;`,
    "  res.end('ok');",
    "}).listen(port, () => writeFileSync('port.txt', String(port)));",
  ].join('\n');

  it.skipIf(!hasPnpm())('passes against a tiny app and leaves nothing running (skipped when pnpm is not installed)', async () => {
    const dir = makeDir(starter({ 'server.mjs': server(200) }));
    const { status, json } = run(dir, ['--skip-install', '--skip-build']);
    expect(check(json, 'start-and-health')?.status).toBe('pass');
    expect(status).toBe(0);
    const port = Number(readFileSync(join(dir, 'port.txt'), 'utf8'));
    expect(port).toBeGreaterThan(0);
    expect(await portIsOpen(port)).toBe(false);
  }, 120_000);

  it.skipIf(!hasPnpm())('fails when the health route never answers 200, and still cleans up', async () => {
    const dir = makeDir(starter({ 'server.mjs': server(500) }));
    const { status, json } = run(dir, ['--skip-install', '--skip-build'], { KST_PREFLIGHT_START_TIMEOUT_MS: '3000' });
    expect(check(json, 'start-and-health')?.status).toBe('fail');
    expect(status).toBe(1);
    const port = Number(readFileSync(join(dir, 'port.txt'), 'utf8'));
    expect(await portIsOpen(port)).toBe(false);
  }, 120_000);
});
