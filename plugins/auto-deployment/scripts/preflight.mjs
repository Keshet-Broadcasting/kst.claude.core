#!/usr/bin/env node
// ===========================================================================
// preflight.mjs - prove in ONE run that an app fits Keshet's build contract.
//
// The deployment agent runs this once instead of a dozen separate shell
// turns. It mirrors how Keshet builds and runs the app: frozen-lockfile
// install, production build, `pnpm start` on $PORT, GET /api/health = 200,
// plus two static checks (misfiled runtime dependencies, hardcoded port).
//
// It runs on Node.js 18+ and NOTHING ELSE, the same on Windows, macOS and
// Linux. It changes nothing in the app: it only reads, builds and starts.
//
// Usage:
//   node preflight.mjs [--skip-install] [--skip-build] [--skip-start] [APP_DIR]
//
// Output: progress lines on stderr, and exactly one JSON object as the last
// line of stdout:
//   { ok, shape: "starter"|"not-starter", checks: [{ name, status, ms,
//     detail, logTail? }], summary }
//
// Exit codes:
//   0  every check passed (warnings allowed)
//   1  a check failed
//   2  the script itself could not run (bad folder, pnpm missing)
//
// Env: KST_PREFLIGHT_START_TIMEOUT_MS - how long to wait for the health
// route after `pnpm start` (default 60000).
// ===========================================================================

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, relative, resolve, sep } from 'node:path';

const EXIT_OK = 0;
const EXIT_CHECK_FAILED = 1;
const EXIT_COULD_NOT_RUN = 2;

const IS_WINDOWS = process.platform === 'win32';
const DEFAULT_START_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 500;
const REQUEST_TIMEOUT_MS = 3_000;
const KILL_GRACE_MS = 5_000;
const LOG_TAIL_LINES = 30;
const MAX_LISTED = 5;

const SKIP_FLAGS = { '--skip-install': 'install', '--skip-build': 'build', '--skip-start': 'start-and-health' };
const HEALTH_ROUTE_FILES = ['route.ts', 'route.js', 'route.mjs'];
const STRAY_LOCKFILES = ['package-lock.json', 'yarn.lock'];
const SOURCE_DIRS = ['app', 'src', 'server', 'lib'];
const SOURCE_EXT = /\.(?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$/;
const ROOT_SOURCE_EXT = /\.(?:js|mjs|ts)$/;
const IGNORED_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'coverage', '__tests__', '__mocks__']);
const NON_RUNTIME_FILE = /(?:\.(?:test|spec|config|setup|stories)\.[a-z]+$|\.d\.ts$)/;

const IMPORT_PATTERNS = [
  /\bimport\s+(?!type\b)[^'"();]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bexport\s+(?!type\b)[^'"();]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];
const LISTEN_LITERAL = /\.listen\(\s*\d+\s*[,)]/;
const PORT_LITERAL = /\bPORT\s*=\s*\d+/i;
const ENV_PORT = /process\.env\.PORT|process\.env\[['"]PORT['"]\]/;

const progress = (message) => process.stderr.write(`${message}\n`);
const errorText = (error) => (error instanceof Error ? error.message : String(error));
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const listed = (items) => (items.length > MAX_LISTED ? [...items.slice(0, MAX_LISTED), `and ${items.length - MAX_LISTED} more`] : items).join(', ');

// --------------------------------------------------------------------------
// Input
// --------------------------------------------------------------------------

const parseArgs = (argv) => {
  const unknown = argv.filter((arg) => arg.startsWith('--') && !(arg in SKIP_FLAGS));
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  return {
    appDir: resolve(positional[0] ?? '.'),
    skip: new Set(argv.filter((arg) => arg in SKIP_FLAGS).map((arg) => SKIP_FLAGS[arg])),
    problem: unknown.length > 0 ? `The check was started with an option it does not know (${unknown.join(', ')}), so nothing was checked.` : positional.length > 1 ? 'The check was given more than one folder, so nothing was checked.' : null,
  };
};

const startTimeoutMs = () => {
  const parsed = Number(process.env.KST_PREFLIGHT_START_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_START_TIMEOUT_MS;
};

const isDirectory = (path) => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false; // a path that cannot be read is treated as not a folder
  }
};

const readPackageJson = (appDir) => {
  try {
    const parsed = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null; // missing or unreadable package.json is reported by starter-shape
  }
};

const pnpmAvailable = () => {
  try {
    return spawnSync('pnpm', ['--version'], { shell: IS_WINDOWS, encoding: 'utf8' }).status === 0;
  } catch {
    return false;
  }
};

// --------------------------------------------------------------------------
// Results
// --------------------------------------------------------------------------

const pass = (detail) => ({ status: 'pass', detail });
const warn = (detail) => ({ status: 'warn', detail });
const failed = (detail, logTail) => (logTail ? { status: 'fail', detail, logTail } : { status: 'fail', detail });
const skipped = (detail) => ({ status: 'skipped', detail });

const tailOf = (text) => text.split(/\r?\n/).filter((line) => line.trim() !== '').slice(-LOG_TAIL_LINES).join('\n');

const emit = (result, exitCode) => {
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = exitCode;
};

const cannotRun = (summary) => emit({ ok: false, shape: 'not-starter', checks: [], summary }, EXIT_COULD_NOT_RUN);

// --------------------------------------------------------------------------
// Running commands
// --------------------------------------------------------------------------

const killTree = (child) => {
  if (child.pid === undefined || !groupAlive(child)) return;
  try {
    if (IS_WINDOWS) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    else process.kill(-child.pid, 'SIGTERM');
  } catch (error) {
    progress(`could not stop process ${child.pid}: ${errorText(error)}`);
  }
};

const forceKillGroup = (child) => {
  if (IS_WINDOWS || child.pid === undefined) return;
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    // ESRCH: the whole group is already gone, which is the goal
  }
};

const groupAlive = (child) => {
  if (IS_WINDOWS || child.pid === undefined) return child.exitCode === null;
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch {
    return false;
  }
};

const stopTree = async (child) => {
  killTree(child);
  const deadline = Date.now() + KILL_GRACE_MS;
  while (groupAlive(child) && Date.now() < deadline) await sleep(100);
  if (groupAlive(child)) forceKillGroup(child);
};

const spawnPnpm = (args, appDir, extraEnv = {}) => {
  const child = spawn('pnpm', args, {
    cwd: appDir,
    shell: IS_WINDOWS,
    detached: !IS_WINDOWS,
    env: { ...process.env, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const chunks = [];
  child.stdout.on('data', (chunk) => chunks.push(String(chunk)));
  child.stderr.on('data', (chunk) => chunks.push(String(chunk)));
  const exited = new Promise((done) => {
    child.once('error', (error) => done({ code: null, error: errorText(error) }));
    child.once('close', (code) => done({ code, error: null }));
  });
  return { child, exited, output: () => chunks.join('') };
};

const runPnpm = async (args, appDir) => {
  const { exited, output } = spawnPnpm(args, appDir);
  const { code, error } = await exited;
  return { code, output: error ? `${output()}\n${error}` : output() };
};

// --------------------------------------------------------------------------
// Checks 1-4: shape, lockfiles, install, build
// --------------------------------------------------------------------------

const checkStarterShape = ({ appDir, pkg }) => {
  const hasNext = typeof pkg?.dependencies?.next === 'string';
  const hasHealth = HEALTH_ROUTE_FILES.some((file) => existsSync(join(appDir, 'app', 'api', 'health', file)));
  const missing = [
    ...(pkg ? [] : ['a readable package.json']),
    ...(hasNext ? [] : ['next listed under dependencies']),
    ...(existsSync(join(appDir, 'pnpm-lock.yaml')) ? [] : ['pnpm-lock.yaml']),
    ...(hasHealth ? [] : ['the health route at app/api/health']),
  ];
  return missing.length === 0
    ? pass('The folder has the starter shape Keshet builds.')
    : failed(`This is not the starter shape Keshet builds. Missing: ${missing.join(', ')}.`);
};

const checkLockfiles = ({ appDir }) => {
  const strays = STRAY_LOCKFILES.filter((file) => existsSync(join(appDir, file)));
  if (!existsSync(join(appDir, 'pnpm-lock.yaml'))) return failed('pnpm-lock.yaml is missing from the project root.');
  return strays.length === 0
    ? pass('pnpm-lock.yaml is present and no other lock file is.')
    : failed(`A lock file from another package manager is present: ${strays.join(', ')}.`);
};

const checkInstall = async ({ appDir }) => {
  const { code, output } = await runPnpm(['install', '--frozen-lockfile'], appDir);
  return code === 0
    ? pass('A clean install from the lock file succeeded.')
    : failed('A clean install from the lock file did not succeed.', tailOf(output));
};

const checkBuild = async ({ appDir }) => {
  const { code, output } = await runPnpm(['build'], appDir);
  return code === 0
    ? pass('The production build completed.')
    : failed('The production build did not complete.', tailOf(output));
};

// --------------------------------------------------------------------------
// Check 5: start the built app and ask the health route
// --------------------------------------------------------------------------

const freePort = () =>
  new Promise((done, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => done(port));
    });
  });

const healthStatus = async (port) => {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    return response.status;
  } catch {
    return null; // not listening yet, or not answering in time
  }
};

const pollHealth = async (port, state, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline && !state.exited) {
    last = await healthStatus(port);
    if (last === 200) return { ok: true, last };
    await sleep(POLL_INTERVAL_MS);
  }
  return { ok: false, last };
};

const startFailureDetail = (state, last, timeoutMs) => {
  if (state.exited) return 'The app stopped on its own right after pnpm start, before the health route answered.';
  if (last === null) return `The app did not answer on its port within ${Math.round(timeoutMs / 1000)} seconds of pnpm start.`;
  return `GET /api/health answered ${last} instead of 200.`;
};

const checkStartAndHealth = async ({ appDir }) => {
  const timeoutMs = startTimeoutMs();
  const port = await freePort();
  const { child, exited, output } = spawnPnpm(['start'], appDir, { PORT: String(port), NODE_ENV: 'production' });
  const state = { exited: false };
  exited.then(() => Object.assign(state, { exited: true }));
  try {
    const { ok, last } = await pollHealth(port, state, timeoutMs);
    return ok
      ? pass('pnpm start served the app and GET /api/health answered 200.')
      : failed(startFailureDetail(state, last, timeoutMs), tailOf(output()));
  } finally {
    await stopTree(child);
  }
};

// --------------------------------------------------------------------------
// Checks 6-7: static scans
// --------------------------------------------------------------------------

const walk = (dir) => {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    progress(`could not read ${dir}: ${errorText(error)}`);
    return [];
  }
  return entries.flatMap((entry) => {
    if (entry.isDirectory()) return IGNORED_DIRS.has(entry.name) ? [] : walk(join(dir, entry.name));
    return entry.isFile() && SOURCE_EXT.test(entry.name) ? [join(dir, entry.name)] : [];
  });
};

const rootSources = (appDir) => {
  try {
    return readdirSync(appDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && ROOT_SOURCE_EXT.test(entry.name))
      .map((entry) => join(appDir, entry.name));
  } catch (error) {
    progress(`could not read ${appDir}: ${errorText(error)}`);
    return [];
  }
};

const runtimeSources = (appDir) =>
  [...SOURCE_DIRS.flatMap((dir) => walk(join(appDir, dir))), ...rootSources(appDir)]
    .filter((file) => !NON_RUNTIME_FILE.test(file))
    .flatMap((file) => {
      try {
        return [{ file: relative(appDir, file).split(sep).join('/'), text: readFileSync(file, 'utf8') }];
      } catch (error) {
        progress(`could not read ${file}: ${errorText(error)}`);
        return [];
      }
    });

const packageNameOf = (specifier) => {
  if (/^(?:\.|\/|node:|@\/|~|#)/.test(specifier)) return null;
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
};

const importedPackages = (text) =>
  IMPORT_PATTERNS.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => packageNameOf(match[1])))
    .filter((name) => name !== null);

const checkRuntimeDeps = ({ pkg, sources }) => {
  const deps = pkg?.dependencies ?? {};
  const devOnly = new Set(Object.keys(pkg?.devDependencies ?? {}).filter((name) => !(name in deps)));
  const findings = sources.flatMap(({ file, text }) =>
    [...new Set(importedPackages(text))].filter((name) => devOnly.has(name)).map((name) => `${name} (${file})`));
  return findings.length === 0
    ? pass('No runtime code imports a package that is only under devDependencies.')
    : warn(`Runtime code imports packages listed only under devDependencies: ${listed(findings)}.`);
};

const checkHardcodedPort = ({ sources }) => {
  const findings = sources
    .filter(({ text }) => LISTEN_LITERAL.test(text) || (PORT_LITERAL.test(text) && !ENV_PORT.test(text)))
    .map(({ file }) => file);
  return findings.length === 0
    ? pass('No port number is written into the server code.')
    : warn(`A port number is written into the code instead of coming from PORT: ${listed(findings)}.`);
};

// --------------------------------------------------------------------------
// Orchestration
// --------------------------------------------------------------------------

const CHECKS = [
  { name: 'starter-shape', needs: [], run: checkStarterShape },
  { name: 'lockfiles', needs: ['starter-shape'], run: checkLockfiles },
  { name: 'install', needs: ['starter-shape', 'lockfiles'], run: checkInstall },
  { name: 'build', needs: ['starter-shape', 'install'], run: checkBuild },
  { name: 'start-and-health', needs: ['starter-shape', 'build'], run: checkStartAndHealth },
  { name: 'runtime-deps', needs: ['starter-shape'], run: checkRuntimeDeps },
  { name: 'hardcoded-port', needs: ['starter-shape'], run: checkHardcodedPort },
];

const runOne = async (check, context, done) => {
  const blocker = check.needs.find((name) => done.some((c) => c.name === name && c.status === 'fail'));
  const blockedBySkip = check.needs.find((name) => done.some((c) => c.name === name && c.status === 'skipped' && c.blocked));
  if (blocker || blockedBySkip) return { name: check.name, ms: 0, blocked: true, ...skipped(`Not run because ${blocker ?? blockedBySkip} did not pass.`) };
  if (context.skip.has(check.name)) return { name: check.name, ms: 0, ...skipped('Skipped on request.') };
  progress(`preflight: ${check.name}...`);
  const started = Date.now();
  try {
    // Await first: an object literal evaluates `Date.now() - started` before
    // the spread's await, which always recorded 0.
    const outcome = await check.run(context);
    return { name: check.name, ms: Date.now() - started, ...outcome };
  } catch (error) {
    return { name: check.name, ms: Date.now() - started, ...failed(`The check could not be completed: ${errorText(error)}`) };
  }
};

const runChecks = async (context) => {
  let done = [];
  for (const check of CHECKS) {
    const result = await runOne(check, context, done);
    done = [...done, { ...result, ms: result.status === 'skipped' ? 0 : Math.max(result.ms, 0) }];
  }
  return done.map(({ blocked, ...rest }) => rest);
};

const summarise = (shape, checks) => {
  if (shape === 'not-starter') return 'This app was started outside the shape Keshet builds, so it has to be moved into the starter before anything else can be checked.';
  const firstFail = checks.find((c) => c.status === 'fail');
  if (firstFail) return `The app is not ready for Keshet yet: ${firstFail.detail}`;
  const notRun = checks.filter((c) => c.status === 'skipped').map((c) => c.name);
  const warnings = checks.filter((c) => c.status === 'warn').length;
  const base = warnings > 0 ? `The checks that ran passed, with ${warnings} thing${warnings === 1 ? '' : 's'} to look at before sending.` : 'Every check that ran passed.';
  return notRun.length > 0 ? `${base} Not run this time: ${notRun.join(', ')}.` : base;
};

const needsPnpm = (skip) => ['install', 'build', 'start-and-health'].some((name) => !skip.has(name));

const main = async () => {
  const { appDir, skip, problem } = parseArgs(process.argv.slice(2));
  if (problem) return cannotRun(problem);
  if (!isDirectory(appDir)) return cannotRun(`The app folder could not be found at ${appDir}, so nothing was checked.`);
  const pkg = readPackageJson(appDir);
  const shapeOk = checkStarterShape({ appDir, pkg }).status === 'pass';
  if (shapeOk && needsPnpm(skip) && !pnpmAvailable()) {
    return cannotRun('pnpm is not installed on this machine, so the app could not be installed, built or started. Nothing was checked.');
  }
  const sources = shapeOk ? runtimeSources(appDir) : [];
  const checks = await runChecks({ appDir, pkg, skip, sources });
  const shape = shapeOk ? 'starter' : 'not-starter';
  const ok = checks.every((c) => c.status !== 'fail');
  return emit({ ok, shape, checks, summary: summarise(shape, checks) }, ok ? EXIT_OK : EXIT_CHECK_FAILED);
};

main().catch((error) => cannotRun(`The check stopped unexpectedly and nothing can be concluded from it: ${errorText(error)}`));
