import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// send-deploy.mjs exits before touching the network on any local-input
// problem, so it can be exercised as a child process with a fixture folder.
// A request that passes every local check goes on to the reachability probe;
// pointing it at a closed local port turns that into a fast "unreachable"
// (exit 3), which is the proof the local checks were satisfied.

const SCRIPT = join(__dirname, 'send-deploy.mjs');
const TEMPLATE = join(__dirname, '..', 'templates', 'DEPLOY_REQUEST.md');
const SPEC_TEMPLATE = join(__dirname, '..', 'templates', 'app-spec.md');

const EXIT_LOCAL = 1;
const EXIT_REFUSED = 2;
const EXIT_UNREACHABLE = 3;
const EXIT_SIGNIN = 4;

// The field list the platform's security gate requires, kept in lockstep with
// platform/templates/stages/security-gate.yml ("Validate DEPLOY_REQUEST.md
// schema") and kst.auth.api's buildDefaultDeployRequest.
const GATE_REQUIRED_FIELDS = [
  'app-name',
  'purpose',
  'description',
  'tags',
  'data-sources',
  'audience-type',
  'audience-members',
  'declared-secrets',
  'requested-by-upn',
  'requested-by-object-id',
  'broker-verified-at',
  'verifier-signoff',
];

const STAMPED_FIELDS = [
  'requested-by-upn',
  'requested-by-object-id',
  'broker-verified-at',
  'verifier-signoff',
];

const template = (): string => readFileSync(TEMPLATE, 'utf8');

const filledTemplate = (): string =>
  template()
    .replace(/^app-name: CHANGE-ME$/m, 'app-name: probe-app')
    .replace(/^purpose: CHANGE-ME$/m, 'purpose: A probe.')
    .replace(/^description: CHANGE-ME$/m, 'description: A probe app.')
    .replace(/^tags: CHANGE-ME$/m, 'tags: probe')
    .replace(/^data-sources: CHANGE-ME$/m, 'data-sources: none')
    .replace(/^audience-type: CHANGE-ME$/m, 'audience-type: individuals')
    .replace(/^audience-members: CHANGE-ME$/m, 'audience-members: probe@example.com');

const withoutLines = (text: string, names: string[]): string =>
  text
    .split('\n')
    .filter((line) => !names.some((name) => line.startsWith(`${name}:`)))
    .join('\n');

// The app spec the deployment agent writes. The spec headings are the
// contract Keshet's assessment checks, so the filled copy here is the
// template with every CHANGE-ME answered and nothing else touched.
const SPEC_HEADINGS = [
  '## What the app does',
  '## Who uses it',
  '## Data it reads and writes',
  '## Systems it connects to',
  '## How people sign in',
];
const specTemplate = (): string => readFileSync(SPEC_TEMPLATE, 'utf8');
const filledSpec = (): string => specTemplate()
  .replace(/^# App spec: CHANGE-ME$/m, '# App spec: probe-app')
  .replace(/^CHANGE-ME$/mg, 'A probe, described.');

const runSend = (request: string, baseUrl = 'http://127.0.0.1:9', spec: string | null = filledSpec()) => {
  const dir = mkdtempSync(join(tmpdir(), 'send-deploy-test-'));
  writeFileSync(join(dir, 'DEPLOY_REQUEST.md'), request);
  writeFileSync(join(dir, 'package.json'), '{}');
  if (spec !== null) {
    mkdirSync(join(dir, '.kst'), { recursive: true });
    writeFileSync(join(dir, '.kst', 'app-spec.md'), spec);
  }
  const result = spawnSync(process.execPath, [SCRIPT, dir], {
    encoding: 'utf8',
    env: { ...process.env, KST_AUTH_API_BASE_URL: baseUrl },
    timeout: 30_000,
  });
  return { dir, status: result.status, stdout: result.stdout ?? '' };
};

// The stand-in service below answers on this process's own event loop, so the
// send has to run without blocking it - spawnSync would deadlock against its
// own fixture.
const runSendAsync = async (request: string, baseUrl: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'send-deploy-test-'));
  writeFileSync(join(dir, 'DEPLOY_REQUEST.md'), request);
  writeFileSync(join(dir, 'package.json'), '{}');
  mkdirSync(join(dir, '.kst'), { recursive: true });
  writeFileSync(join(dir, '.kst', 'app-spec.md'), filledSpec());
  const child = spawn(process.execPath, [SCRIPT, dir], {
    env: { ...process.env, KST_AUTH_API_BASE_URL: baseUrl },
  });
  let stdout = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => { stdout += chunk; });
  const status = await new Promise<number | null>((resolve) => {
    child.on('close', (code) => resolve(code));
  });
  return { dir, status, stdout };
};

// A stand-in for the deployment service: the reachability probe always
// answers, and the test decides what the sign-in start does. That is the
// point where a real send met a 404, a 500 and an app pool recycling itself,
// and reported all three as "Keshet's sign-in service is down".
type DeviceCodeReply = (res: ServerResponse) => void;

const startFakeApi = async (onDeviceCode: DeviceCodeReply): Promise<{ server: Server; baseUrl: string }> => {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/api/monitor/check') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"status":"ok"}');
      return;
    }
    if (req.url === '/api/apps/auth/device-code') {
      onDeviceCode(res);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end('{}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
};

describe('templates/DEPLOY_REQUEST.md', () => {
  it('carries every field the platform security gate requires', () => {
    const lines = template().split('\n');
    for (const field of GATE_REQUIRED_FIELDS) {
      expect(lines.some((line) => line.startsWith(`${field}:`)), field).toBe(true);
    }
  });

  it('carries the placeholder values the API stamper rewrites', () => {
    const text = template();
    expect(text).toContain('requested-by-upn: STAMPED-BY-BROKER');
    expect(text).toContain('requested-by-object-id: STAMPED-BY-BROKER');
    expect(text).toContain('broker-verified-at: STAMPED-BY-BROKER');
    expect(text).toContain('verifier-signoff: pending');
  });
});

describe('templates/app-spec.md', () => {
  it('carries exactly the five headings the assessment checks, in order', () => {
    const headings = specTemplate().split('\n').filter((l) => l.startsWith('## '));
    expect(headings).toEqual(SPEC_HEADINGS);
  });
});

describe('send-deploy.mjs app spec checks', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('refuses a send with no .kst/app-spec.md', () => {
    const run = runSend(filledTemplate(), undefined, null);
    dirs.push(run.dir);
    expect(run.status).toBe(EXIT_LOCAL);
    expect(run.stdout).toContain('.kst/app-spec.md');
    expect(run.stdout).toContain('nothing was sent');
  });

  it('refuses the unfilled spec template', () => {
    const run = runSend(filledTemplate(), undefined, specTemplate());
    dirs.push(run.dir);
    expect(run.status).toBe(EXIT_LOCAL);
    expect(run.stdout).toContain('CHANGE-ME');
  });

  for (const heading of SPEC_HEADINGS) {
    it(`refuses a spec missing the section "${heading.slice(3)}"`, () => {
      const run = runSend(filledTemplate(), undefined, filledSpec().replace(`${heading}\n`, '## Something else\n'));
      dirs.push(run.dir);
      expect(run.status).toBe(EXIT_LOCAL);
      expect(run.stdout).toContain(heading.slice(3));
    });
  }

  it('refuses a spec whose section is empty', () => {
    const empty = filledSpec().replace('## Who uses it\n\nA probe, described.\n', '## Who uses it\n\n');
    const run = runSend(filledTemplate(), undefined, empty);
    dirs.push(run.dir);
    expect(run.status).toBe(EXIT_LOCAL);
    expect(run.stdout).toContain('Who uses it');
  });

  it('passes the spec checks when the spec is filled (fails later, on the network)', () => {
    const run = runSend(filledTemplate());
    dirs.push(run.dir);
    expect(run.stdout).not.toContain('app-spec');
  });
});

describe('send-deploy.mjs local checks', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('refuses the unfilled template before sending', () => {
    const run = runSend(template());
    dirs.push(run.dir);
    expect(run.status).toBe(EXIT_LOCAL);
    expect(run.stdout).toContain("missing 'app-name'");
  });

  it('refuses a request without the Requester block and names the missing lines', () => {
    const run = runSend(
      withoutLines(filledTemplate(), ['requested-by-upn', 'requested-by-object-id', 'broker-verified-at']),
    );
    dirs.push(run.dir);
    expect(run.status).toBe(EXIT_LOCAL);
    expect(run.stdout).toContain('requested-by-upn, requested-by-object-id, broker-verified-at');
    expect(run.stdout).toContain('nothing was sent');
  });

  it('refuses a request without the Local agent sign-off block', () => {
    const run = runSend(withoutLines(filledTemplate(), ['verifier-signoff']));
    dirs.push(run.dir);
    expect(run.status).toBe(EXIT_LOCAL);
    expect(run.stdout).toContain('verifier-signoff');
  });

  it('refuses a request missing every stamped line', () => {
    const run = runSend(withoutLines(filledTemplate(), STAMPED_FIELDS));
    dirs.push(run.dir);
    expect(run.status).toBe(EXIT_LOCAL);
    for (const field of STAMPED_FIELDS) expect(run.stdout).toContain(field);
  });

  it('refuses a platform-provided variable declared as a secret, without asking for a value', () => {
    const request = filledTemplate().replace(
      /^declared-secrets:.*$/m,
      'declared-secrets: APPLICATIONINSIGHTS_CONNECTION_STRING, KST_AZURE_APP_ID',
    );
    const run = runSend(request);
    dirs.push(run.dir);
    expect(run.status).toBe(EXIT_LOCAL);
    expect(run.stdout).toContain('APPLICATIONINSIGHTS_CONNECTION_STRING');
    expect(run.stdout).toContain('KST_AZURE_APP_ID');
    expect(run.stdout).toContain('Keshet sets');
    expect(run.stdout).not.toContain('private settings file');
  });

  it('leaves the deploy run record out of the tree it sends', () => {
    // The tree is DEPLOY_REQUEST.md + package.json = 2 files. With the cap at
    // 2, a record swept in would push it to 3 and be refused before the send.
    const dir = mkdtempSync(join(tmpdir(), 'send-deploy-test-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'DEPLOY_REQUEST.md'), filledTemplate());
    mkdirSync(join(dir, '.kst'), { recursive: true });
    writeFileSync(join(dir, '.kst', 'app-spec.md'), filledSpec());
    writeFileSync(join(dir, 'package.json'), '{}');
    mkdirSync(join(dir, '.kst-deploy'));
    writeFileSync(join(dir, '.kst-deploy', 'run-record.json'), '{"agents":[]}');
    const result = spawnSync(process.execPath, [SCRIPT, dir], {
      encoding: 'utf8',
      env: { ...process.env, KST_AUTH_API_BASE_URL: 'http://127.0.0.1:9', KST_DEPLOY_MAX_FILES: '3' },
      timeout: 30_000,
    });
    expect(result.status).toBe(EXIT_UNREACHABLE);
    expect(result.stdout ?? '').not.toContain('far more files');
  });

  it('passes the local checks on a filled template and proceeds to the send', () => {
    const run = runSend(filledTemplate());
    dirs.push(run.dir);
    expect(run.status).toBe(EXIT_UNREACHABLE);
    expect(run.stdout).not.toContain('nothing was sent');
  });

  it('names the address it could not reach', () => {
    const run = runSend(filledTemplate(), 'http://127.0.0.1:9');
    dirs.push(run.dir);
    expect(run.status).toBe(EXIT_UNREACHABLE);
    expect(run.stdout).toContain('http://127.0.0.1:9');
    expect(run.stdout).toContain('/api/monitor/check');
  });
});

// Every one of these used to print the same sentence - "The sign-in could not
// start on the Keshet side" - so a builder's report could not tell an outage
// from a wrong address. Each must now say something different and true, and
// carry the status, the endpoint and the instance that answered.
describe('send-deploy.mjs sign-in diagnostics', () => {
  const dirs: string[] = [];
  const servers: Server[] = [];

  afterEach(async () => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
    for (const server of servers.splice(0)) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  const send = async (onDeviceCode: DeviceCodeReply) => {
    const { server, baseUrl } = await startFakeApi(onDeviceCode);
    servers.push(server);
    const run = await runSendAsync(filledTemplate(), baseUrl);
    dirs.push(run.dir);
    return { ...run, baseUrl };
  };

  it('reports a 404 on the sign-in start as the wrong or too-old service', async () => {
    const run = await send((res) => {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{"message":"Cannot POST /api/apps/auth/device-code"}');
    });
    expect(run.status).toBe(EXIT_SIGNIN);
    expect(run.stdout).toContain('there is no sign-in at the address the send is using');
    expect(run.stdout).toContain('HTTP 404 from /api/apps/auth/device-code');
    expect(run.stdout).toContain(run.baseUrl);
  });

  it('reports a 500 on the sign-in start as the service failing, and says it is safe to retry', async () => {
    const run = await send((res) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end('{"message":"Internal Server Error"}');
    });
    expect(run.status).toBe(EXIT_UNREACHABLE);
    expect(run.stdout).toContain('could not start the sign-in');
    expect(run.stdout).toContain('safe to run the send again');
    expect(run.stdout).toContain('HTTP 500 from /api/apps/auth/device-code');
    expect(run.stdout).toContain(run.baseUrl);
  });

  it('reports a dropped connection on the sign-in start as a connection problem', async () => {
    const run = await send((res) => {
      res.socket?.destroy();
    });
    expect(run.status).toBe(EXIT_UNREACHABLE);
    expect(run.stdout).toContain('The connection to Keshet dropped while starting the sign-in');
    expect(run.stdout).toContain('no answer from /api/apps/auth/device-code');
    expect(run.stdout).toContain(run.baseUrl);
  });

  it('reports an empty 200 on the sign-in start as a service that restarted mid-request', async () => {
    const run = await send((res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('');
    });
    expect(run.status).toBe(EXIT_UNREACHABLE);
    expect(run.stdout).toContain('nothing at all');
    expect(run.stdout).toContain('HTTP 200 from /api/apps/auth/device-code');
  });

  it('reports a well-formed answer without a deviceCode as a missing sign-in code', async () => {
    const run = await send((res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"userCode":"ABCD-EFGH","interval":5}');
    });
    expect(run.status).toBe(EXIT_SIGNIN);
    expect(run.stdout).toContain('carried no sign-in code');
    expect(run.stdout).toContain('HTTP 200 from /api/apps/auth/device-code');
    expect(run.stdout).toContain(run.baseUrl);
  });
});

// --- Findings from the md-render deploy report (Sep 2026) -------------------
// #9: the VPN was discovered missing only at send time. `--check` lets the
// chain probe reachability before any agent runs.
// #8: every attempt was a fresh device sign-in. The tooling now keeps the
// sign-in between attempts, the way the device-login script does.
// #7: a 413 under the published limit read as the builder's problem.
describe('send-deploy.mjs check mode, sign-in cache, and 413', () => {
  const dirs: string[] = [];
  const servers: Server[] = [];

  afterEach(async () => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
    for (const server of servers.splice(0)) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  type Counts = { deviceCode: number; refresh: number; send: number };
  const startRichApi = async (sendStatus: number): Promise<{ baseUrl: string; counts: Counts }> => {
    const counts: Counts = { deviceCode: 0, refresh: 0, send: 0 };
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const reply = (status: number, body: string) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(body);
      };
      if (req.url === '/api/monitor/check') return reply(200, '{"status":"ok"}');
      if (req.url === '/api/apps/auth/device-code') {
        counts.deviceCode += 1;
        return reply(200, '{"deviceCode":"d1","userCode":"CODE1","verificationUri":"https://example.test/device","interval":1,"expiresIn":60}');
      }
      if (req.url === '/api/apps/auth/device-token') {
        return reply(200, '{"status":"authenticated","accessToken":"at-1","refreshToken":"rt-1","expiresIn":3600,"displayName":"Probe"}');
      }
      if (req.url === '/api/apps/auth/refresh') {
        counts.refresh += 1;
        return reply(200, '{"accessToken":"at-2","refreshToken":"rt-2","expiresIn":3600}');
      }
      if (req.url === '/api/apps') {
        counts.send += 1;
        return reply(sendStatus, sendStatus === 413 ? '{"message":"request entity too large"}' : '{"message":"boom"}');
      }
      reply(404, '{}');
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as { port: number }).port;
    return { baseUrl: `http://127.0.0.1:${port}`, counts };
  };

  const runWith = (dir: string, baseUrl: string, cacheDir: string, extraArgs: string[] = []) =>
    new Promise<{ status: number | null; stdout: string }>((resolve) => {
      const child = spawn(process.execPath, [SCRIPT, ...extraArgs, dir], {
        env: { ...process.env, KST_AUTH_API_BASE_URL: baseUrl, KST_AUTH_TOKEN_CACHE_DIR: cacheDir },
      });
      let stdout = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (c: string) => { stdout += c; });
      child.on('close', (code) => resolve({ status: code, stdout }));
    });

  it('--check reports a reachable service and exits 0 without touching the request', async () => {
    const { baseUrl } = await startRichApi(500);
    const dir = mkdtempSync(join(tmpdir(), 'send-deploy-test-'));
    dirs.push(dir);
    const run = await runWith(dir, baseUrl, join(dir, 'cache'), ['--check']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('reachable');
  });

  it('--check reports an unreachable service with the VPN hint', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'send-deploy-test-'));
    dirs.push(dir);
    const run = await runWith(dir, 'http://127.0.0.1:9', join(dir, 'cache'), ['--check']);
    expect(run.status).toBe(EXIT_UNREACHABLE);
    expect(run.stdout).toContain('VPN');
  });

  it('keeps the sign-in between attempts: the second send asks for no new code', async () => {
    const { baseUrl, counts } = await startRichApi(500);
    const dir = mkdtempSync(join(tmpdir(), 'send-deploy-test-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'DEPLOY_REQUEST.md'), filledTemplate());
    mkdirSync(join(dir, '.kst'), { recursive: true });
    writeFileSync(join(dir, '.kst', 'app-spec.md'), filledSpec());
    writeFileSync(join(dir, 'package.json'), '{}');
    const cache = join(dir, 'cache');
    const first = await runWith(dir, baseUrl, cache);
    expect(first.status).toBe(EXIT_UNREACHABLE);
    expect(counts.deviceCode).toBe(1);
    const second = await runWith(dir, baseUrl, cache);
    expect(second.status).toBe(EXIT_UNREACHABLE);
    expect(counts.deviceCode).toBe(1);
    expect(second.stdout).toContain('Still signed in');
    expect(counts.send).toBe(2);
  }, 30_000);

  it('names a 413 as a platform-side limit, not the builder\'s app', async () => {
    const { baseUrl } = await startRichApi(413);
    const dir = mkdtempSync(join(tmpdir(), 'send-deploy-test-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'DEPLOY_REQUEST.md'), filledTemplate());
    mkdirSync(join(dir, '.kst'), { recursive: true });
    writeFileSync(join(dir, '.kst', 'app-spec.md'), filledSpec());
    writeFileSync(join(dir, 'package.json'), '{}');
    const run = await runWith(dir, baseUrl, join(dir, 'cache'));
    expect(run.status).toBe(EXIT_REFUSED);
    expect(run.stdout).toContain('under the limit');
    expect(run.stdout).toContain('platform team');
    expect(run.stdout).not.toContain('leave out');
  }, 30_000);
});
