import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

const EXIT_LOCAL = 1;
const EXIT_UNREACHABLE = 3;

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

const runSend = (request: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'send-deploy-test-'));
  writeFileSync(join(dir, 'DEPLOY_REQUEST.md'), request);
  writeFileSync(join(dir, 'package.json'), '{}');
  const result = spawnSync(process.execPath, [SCRIPT, dir], {
    encoding: 'utf8',
    env: { ...process.env, KST_AUTH_API_BASE_URL: 'http://127.0.0.1:9' },
    timeout: 30_000,
  });
  return { dir, status: result.status, stdout: result.stdout ?? '' };
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

  it('passes the local checks on a filled template and proceeds to the send', () => {
    const run = runSend(filledTemplate());
    dirs.push(run.dir);
    expect(run.status).toBe(EXIT_UNREACHABLE);
    expect(run.stdout).not.toContain('nothing was sent');
  });
});
