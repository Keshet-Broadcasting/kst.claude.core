#!/usr/bin/env node
// ===========================================================================
// send-deploy.mjs - send a builder's app to the Keshet deployment service.
//
// THE implementation of the send, shared by every platform: send-deploy.sh
// and send-deploy.ps1 are thin launchers that hand straight over to this
// file. It runs on Node.js 18+ and NOTHING ELSE - no curl, no jq, no
// coreutils - because builder machines range from vanilla macOS to Windows
// to sandboxed minimal Linux, and Node is the one tool every builder
// machine already has (the apps themselves are Next.js apps).
//
// The verifying-and-sending skill runs the launcher as the one and only way an app
// reaches Keshet. It signs the builder in through the service's own device
// sign-in, assembles the deploy request from DEPLOY_REQUEST.md, the app's
// files, and the gitignored .env, sends it, and follows the deployment run
// until Keshet has an answer.
//
// Usage:
//   node send-deploy.mjs [--signoff FILE] [APP_DIR]
//
//   APP_DIR         the app's folder (default: the current directory)
//   --signoff FILE  the verifier's sign-off record, a JSON file kept OUTSIDE
//                   the app folder so it never becomes part of the sent tree
//
// Exit codes (the verifier acts on these):
//   0  accepted - the deployment run reached IT review or beyond
//   1  could not run - bad input, a missing tool, or an incomplete request
//   2  refused - Keshet turned the request down; the reason was printed
//   3  unreachable - network or service trouble; safe to run again
//   4  sign-in failed or timed out
//
// Every failure says what happened in plain language and then ends with the
// endpoint, the HTTP status and the base URL that was used - a builder pastes
// the whole message into a report, and the platform team has to be able to
// tell an outage from a send aimed at the wrong instance without being there.
//
// Secrets: values are read from .env straight into the request body held in
// memory. They are never printed, never logged, and never written to disk.
// Sign-in tokens stay in local variables and are never echoed.
// ===========================================================================

import { readFileSync, readdirSync, lstatSync, existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, relative, basename, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXIT_LOCAL = 1;
const EXIT_REFUSED = 2;
const EXIT_UNREACHABLE = 3;
const EXIT_SIGNIN = 4;

const say = (m = '') => console.log(m);
const fail = (code, msg) => { say(msg); process.exit(code); };

if (typeof fetch !== 'function') {
  fail(EXIT_LOCAL,
    'The send tooling needs Node.js 18 or newer and this one is older, so nothing was sent. That is a platform problem to report, not something the builder did.');
}

// --------------------------------------------------------------------------
// Shared configuration - deploy-config.json next to this script
//
// The same file the launchers describe. NOTHING SECRET lives in it.
// Environment variables still override, and built-in defaults cover a
// missing or unreadable file.
// --------------------------------------------------------------------------
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
let config = {};
try {
  config = JSON.parse(readFileSync(join(SCRIPT_DIR, 'deploy-config.json'), 'utf8'));
} catch { config = {}; }

const cfg = (path, fallback) => {
  let v = config;
  for (const key of path) {
    if (v == null || typeof v !== 'object') return fallback;
    v = v[key];
  }
  return v == null || v === '' ? fallback : v;
};

// The single switch point for which service instance receives the app. Set
// KST_AUTH_API_BASE_URL to the production instance to send there; nothing
// else in this script knows which instance it is talking to.
const BASE_URL = process.env.KST_AUTH_API_BASE_URL
  || cfg(['apiBaseUrl'], 'https://api-auth-stage.keshet-tv.com');

// Bounds the service enforces on the sent tree, checked here first so the
// builder hears about a problem before a long upload rather than after one.
const MAX_FILES = parseInt(process.env.KST_DEPLOY_MAX_FILES || '', 10)
  || cfg(['limits', 'maxFiles'], 2000);
const MAX_BYTES = parseInt(process.env.KST_DEPLOY_MAX_BYTES || '', 10)
  || cfg(['limits', 'maxBytes'], 10 * 1024 * 1024);

// How long the script follows a deployment run before giving up.
const POLL_COUNT = parseInt(process.env.KST_DEPLOY_POLL_COUNT || '', 10)
  || cfg(['polling', 'count'], 60);
const POLL_INTERVAL = parseInt(process.env.KST_DEPLOY_POLL_INTERVAL || '', 10)
  || cfg(['polling', 'intervalSeconds'], 5);

// The exclusion list - the same list the sign-off digest uses.
const EXCLUDE_DIRS = cfg(['exclusions', 'directories'], null)
  || ['node_modules', '.git', '.next', 'dist', 'build', '.kst-deploy'];
const EXCLUDE_FILES = cfg(['exclusions', 'files'], null) || ['.env', '.env.*'];

// --------------------------------------------------------------------------
// Arguments and preconditions
// --------------------------------------------------------------------------
let appDir = process.cwd();
let signoffFile = '';
// --check: only probe that Keshet's deployment service is reachable from
// this network, and exit. Run at the start of the deploy chain so a missing
// VPN is found before any check runs, not after all of them.
let checkOnly = false;
{
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--signoff') {
      if (i + 1 >= args.length) fail(EXIT_LOCAL, '--signoff needs a file path after it.');
      signoffFile = args[++i];
    } else if (a === '--check') {
      checkOnly = true;
    } else if (a.startsWith('--')) {
      fail(EXIT_LOCAL, `Unknown option: ${a}. Usage: send-deploy.mjs [--check] [--signoff FILE] [APP_DIR]`);
    } else {
      appDir = a;
    }
  }
}

const isDir = (p) => { try { return lstatSync(p).isDirectory(); } catch { return false; } };
const isFile = (p) => { try { return lstatSync(p).isFile(); } catch { return false; } };

if (!checkOnly && !isDir(appDir)) fail(EXIT_LOCAL, 'The app folder was not found, so nothing was sent.');
appDir = resolve(appDir);
const reqFile = join(appDir, 'DEPLOY_REQUEST.md');
if (!checkOnly && !isFile(reqFile)) {
  fail(EXIT_LOCAL,
    'The deployment request file is missing from the app folder, so nothing was sent. The deployment details need collecting before the app can go to Keshet.');
}

// --------------------------------------------------------------------------
// Read the deployment request
// --------------------------------------------------------------------------
// --------------------------------------------------------------------------
// HTTP, without curl: fetch with a timeout.
//
// Two different questions, two different fields, because conflating them is
// what made a 404 read as an outage: `reached` says the service answered at
// all, `ok` says the answer was a success (2xx). A network-level failure
// comes back with reached:false and status 0; `timedOut` separates a service
// that never answered from one this machine could not open a connection to.
// --------------------------------------------------------------------------
const http = async (method, path, body, timeoutSec, token) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body } : {}),
      signal: AbortSignal.timeout(timeoutSec * 1000),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = null; }
    return {
      reached: true,
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      json,
      empty: text.trim() === '',
      timedOut: false,
    };
  } catch (err) {
    return {
      reached: false,
      ok: false,
      status: 0,
      json: null,
      empty: true,
      timedOut: err?.name === 'TimeoutError',
    };
  }
};

// The facts a platform person needs to tell an outage from a wrong address:
// which endpoint, what it answered, and which instance was asked. Appended to
// every failure message, after the plain-language part.
const detail = (path, status, extra = '') =>
  `Details for the platform team: ${status === 0 ? 'no answer' : `HTTP ${status}`} from ${path} at ${BASE_URL}${extra !== '' ? ` (${extra})` : ''}.`;

const HEALTH_PATH = '/api/monitor/check';
const DEVICE_CODE_PATH = '/api/apps/auth/device-code';
const DEVICE_TOKEN_PATH = '/api/apps/auth/device-token';
const SEND_PATH = '/api/apps';
const REFRESH_PATH = '/api/apps/auth/refresh';

const jstr = (obj, key) => {
  const v = obj?.[key];
  return typeof v === 'string' ? v : '';
};

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

// --------------------------------------------------------------------------
// Check mode: reachability only. Everything below this point reads the app.
// --------------------------------------------------------------------------
const probeService = async () => {
  const health = await http('GET', HEALTH_PATH, undefined, 10);
  if (!health.reached) {
    fail(EXIT_UNREACHABLE,
      `Keshet's deployment service can't be reached at ${BASE_URL} from this network${health.timedOut ? ' - it did not answer in time' : ''}. Connect to the Keshet network (VPN or office) and try again. Nothing was sent and nothing is lost. ${detail(HEALTH_PATH, 0)}`);
  }
  if (!health.ok) {
    say(`The service answered, but not with a healthy reply. ${detail(HEALTH_PATH, health.status)}`);
  }
  return health;
};
if (checkOnly) {
  await probeService();
  say(`Keshet's deployment service is reachable at ${BASE_URL}.`);
  process.exit(0);
}

const reqText = readFileSync(reqFile, 'utf8');
const reqLines = reqText.split(/\r?\n/);

const reqField = (name) => {
  const line = reqLines.find((l) => l.startsWith(`${name}:`));
  if (line === undefined) return '';
  return line.slice(name.length + 1).trim();
};

const requireField = (name, value) => {
  if (value === '' || value.includes('CHANGE-ME')) {
    fail(EXIT_LOCAL,
      `The deployment details are missing '${name}', so nothing was sent. That answer needs filling in before the app can go to Keshet.`);
  }
};

const APP_NAME = reqField('app-name');
const PURPOSE = reqField('purpose');
const DESCRIPTION = reqField('description');
const TAGS = reqField('tags');
const DATA_SOURCES = reqField('data-sources');
const AUDIENCE_TYPE = reqField('audience-type');
const AUDIENCE_MEMBERS = reqField('audience-members');
const DECLARED_RAW = reqField('declared-secrets');

requireField('app-name', APP_NAME);
requireField('purpose', PURPOSE);
requireField('description', DESCRIPTION);
requireField('tags', TAGS);
requireField('data-sources', DATA_SOURCES);
requireField('audience-type', AUDIENCE_TYPE);
requireField('audience-members', AUDIENCE_MEMBERS);

// The Requester and Local agent sign-off blocks are stamped by Keshet, and
// Keshet can only rewrite a line that already exists. A request sent without
// these lines is accepted here and then refused at the platform's security
// gate, after the send, with nothing IT can approve - so it is refused before
// anything leaves the machine instead. Presence is the whole check: the
// values are placeholders until Keshet stamps them, and are never judged here.
const STAMPED_FIELDS = [
  'requested-by-upn',
  'requested-by-object-id',
  'broker-verified-at',
  'verifier-signoff',
];
{
  const missingStamped = STAMPED_FIELDS.filter((name) => !reqLines.some((l) => l.startsWith(`${name}:`)));
  if (missingStamped.length > 0) {
    fail(EXIT_LOCAL,
      `The deployment details are missing the lines Keshet stamps (${missingStamped.join(', ')}), so nothing was sent. The Requester and Local agent sign-off blocks need restoring from the deployment request template, exactly as the template has them, before the app can go to Keshet.`);
  }
}

// The IT review form asks for the audience and the kind of information the
// app handles; both are answered from the request file, in words a reviewer
// can judge. Apps on this platform are only ever opened by the named Keshet
// audience, so external sharing is always "no".
const TARGET_AUDIENCE =
  AUDIENCE_TYPE === 'individuals' ? `Named people: ${AUDIENCE_MEMBERS}`
  : AUDIENCE_TYPE === 'entra-groups' ? `Team groups: ${AUDIENCE_MEMBERS}`
  : `${AUDIENCE_TYPE}: ${AUDIENCE_MEMBERS}`;
const INFORMATION_TYPE = DATA_SOURCES === 'none'
  ? 'Internal Keshet data. The app reaches no external data sources.'
  : `Internal Keshet data. Data sources: ${DATA_SOURCES}`;

// --------------------------------------------------------------------------
// Secret values: from .env, straight into memory, only the declared names
// --------------------------------------------------------------------------
const declaredKeys = DECLARED_RAW.replace(/\s/g, '').split(',').filter((k) => k !== '');

// Names Keshet sets on the running app itself (platform/templates/steps/
// app-config.yml and configure-auth.yml). They are never secrets the builder
// holds: a builder cannot have a value for them, so an agent that declared one
// would end up asking the builder a question nobody on their side can answer.
// Refuse here, by name, before anyone is asked anything.
const PLATFORM_PROVIDED = [
  'APP_NAME',
  'PLATFORM_BUILD_ID',
  'APPLICATIONINSIGHTS_CONNECTION_STRING',
  'KEY_VAULT_URI',
  'KST_AZURE_APP_ID',
  'KST_AZURE_TENANT_ID',
  'PORT',
];
const platformDeclared = declaredKeys.filter((k) => PLATFORM_PROVIDED.includes(k));
if (platformDeclared.length > 0) {
  fail(EXIT_LOCAL,
    `These names are not secrets the builder holds - Keshet sets them on the running app itself: ${platformDeclared.join(', ')}. Remove them from the declared secrets (the app keeps reading them as ordinary environment variables) and send again. Nothing was sent, and the builder does not need to supply anything.`);
}
let envShared = {};
if (declaredKeys.length > 0) {
  const envFile = join(appDir, '.env');
  if (!isFile(envFile)) {
    fail(EXIT_LOCAL,
      'The app declares secrets but its private settings file is missing, so nothing was sent. Each declared secret needs its value in place first.');
  }
  let envText;
  try { envText = readFileSync(envFile, 'utf8'); }
  catch { fail(EXIT_LOCAL, "The app's private settings file could not be read, so nothing was sent."); }
  for (const line of envText.split(/\r?\n/)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!m || !declaredKeys.includes(m[1])) continue;
    let v = m[2];
    if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
      v = v.slice(1, -1);
    }
    envShared[m[1]] = v;
  }
  const missing = declaredKeys.filter((k) => !(k in envShared));
  if (missing.length > 0) {
    fail(EXIT_LOCAL,
      `These declared secrets have no value in the app's private settings file yet: ${missing.join(', ')}. Nothing was sent - the app would break the moment someone opened it.`);
  }
  const empty = declaredKeys.filter((k) => envShared[k] === '');
  if (empty.length > 0) {
    fail(EXIT_LOCAL,
      `These declared secrets have an empty value in the app's private settings file: ${empty.join(', ')}. Nothing was sent - they need real values first.`);
  }
}

// --------------------------------------------------------------------------
// The file tree: same exclusions as the sign-off digest, every time
// --------------------------------------------------------------------------
// A file is sent base64-encoded when it is not clean UTF-8 text: either it
// contains NUL bytes or it does not decode as UTF-8. Everything else - code,
// Hebrew text included - travels as utf-8.
const utf8Strict = new TextDecoder('utf-8', { fatal: true });
const asText = (buf) => {
  if (buf.length === 0) return '';
  if (buf.includes(0)) return null;
  try { return utf8Strict.decode(buf); } catch { return null; }
};

// The exclusion patterns are simple names with an optional '*' wildcard,
// matched against the basename - the same matching find(1) did.
const globToRegExp = (glob) => new RegExp(
  `^${glob.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`,
);
const excludeFilePatterns = EXCLUDE_FILES.map(globToRegExp);
const isExcludedFile = (name) => excludeFilePatterns.some((re) => re.test(name));

const files = [];
let totalBytes = 0;
const walk = (dir) => {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.includes(entry.name)) continue;
      walk(full);
    } else if (entry.isFile()) {
      if (isExcludedFile(entry.name)) continue;
      const buf = readFileSync(full);
      totalBytes += buf.length;
      const rel = relative(appDir, full).split(sep).join('/');
      const text = asText(buf);
      files.push(text === null
        ? { path: rel, encoding: 'base64', content: buf.toString('base64') }
        : { path: rel, encoding: 'utf-8', content: text });
    }
  }
};
walk(appDir);

if (files.length === 0) {
  fail(EXIT_LOCAL, 'The app folder has no files to send after the standard exclusions, so nothing was sent.');
}
if (files.length > MAX_FILES) {
  fail(EXIT_REFUSED,
    `The app is made up of far more files than a new app normally has (${files.length}), which usually means a folder of downloaded or generated files got swept in. Nothing was sent - find what was swept in and leave it out.`);
}
if (totalBytes > MAX_BYTES) {
  fail(EXIT_REFUSED,
    'The app is carrying more than can be sent in one go - usually that means large files like videos or images got included. Nothing was sent - leave out what the app does not need.');
}

// --------------------------------------------------------------------------
// The sign-off record
// --------------------------------------------------------------------------
let signoff = null;
if (signoffFile !== '') {
  if (!isFile(signoffFile)) fail(EXIT_LOCAL, 'The sign-off file was not found, so nothing was sent.');
  const signoffPath = resolve(signoffFile);
  const relToApp = relative(appDir, signoffPath);
  if (relToApp !== '' && !relToApp.startsWith('..') && !isAbsolute(relToApp)) {
    fail(EXIT_LOCAL,
      'The sign-off file sits inside the app folder, where it would change the very tree it signs. Move it outside the app folder and run the send again.');
  }
  try { signoff = JSON.parse(readFileSync(signoffPath, 'utf8')); }
  catch { fail(EXIT_LOCAL, 'The sign-off file is not valid JSON, so nothing was sent.'); }
}

// --------------------------------------------------------------------------
// Assemble the request body, in memory
// --------------------------------------------------------------------------
// Truncation counts codepoints, not UTF-16 units, so Hebrew and emoji are
// not cut mid-character.
const cut = (s, n) => Array.from(s).slice(0, n).join('');

const payload = {
  appName: APP_NAME,
  description: cut(DESCRIPTION, 500),
  costRoi: cut(PURPOSE, 1000),
  targetAudience: cut(TARGET_AUDIENCE, 1000),
  informationType: cut(INFORMATION_TYPE, 500),
  externalAppSharing: false,
  tags: TAGS.split(',').map((t) => t.trim()).filter((t) => t !== '').slice(0, 20),
  deployRequest: reqText,
  files,
  ...(Object.keys(envShared).length > 0 ? { env: { shared: envShared } } : {}),
  ...(signoff !== null ? { signoff } : {}),
};


// --------------------------------------------------------------------------
// Turning answers into plain language
// --------------------------------------------------------------------------
const stepLabel = (step) => ({
  validate_name: "checking the app's name",
  create_repo_from_template: "setting up the app's home at Keshet",
  apply_branch_policies: "protecting the app's home",
  push_deploy_initial: "storing the app's files",
  create_per_app_vault: "setting up the app's private settings store",
  sync_env_secrets: "storing the app's secret settings",
  raise_itcc: 'asking IT to review the app',
}[step] || 'processing the request');

const refuseStep = (step, msg, runId) => {
  if (step === 'validate_name') {
    if (msg.includes('soft-deleted')) {
      fail(EXIT_REFUSED,
        "An app with this name existed before and was removed, and Keshet keeps its stored settings for a short while, so the name isn't free yet. Pick a different name with the builder, or ask the platform team to release this one. Nothing was created.");
    }
    if (msg.includes('not available') || msg.includes('already exists') || msg.includes('taken')) {
      fail(EXIT_REFUSED,
        "There's already an app called that at Keshet. Pick a different name with the builder and send again - nothing was created, so there is nothing to undo.");
    }
    fail(EXIT_REFUSED,
      `Keshet did not accept the app's name${msg ? `: ${msg}` : ''}. Pick a new name with the builder and send again - nothing was created.`);
  }
  fail(EXIT_REFUSED,
    `Something on the Keshet side did not finish while ${stepLabel(step)}. This is not something the builder did, and it is safe to send again in a few minutes. Reference for the platform team: run ${runId || 'unknown'}.`);
};

const refuseHttp = (status, json, path) => {
  const code = jstr(json, 'code');
  const rawMsg = json?.message;
  const msg = Array.isArray(rawMsg) ? rawMsg.join('; ') : (typeof rawMsg === 'string' ? rawMsg : '');
  const d = detail(path, status, code);
  if (status === 401) {
    fail(EXIT_SIGNIN,
      `Keshet no longer accepts the sign-in - it has likely expired. Run the send again and sign in when the code appears. Nothing is lost. ${d}`);
  }
  if (status === 413) {
    fail(EXIT_REFUSED,
      `Keshet's service turned the app away as too large, even though it is under the limit the platform allows - that is a setting on Keshet's side, not anything in the app, and nothing should be left out to get past it. It needs the platform team; the builder did nothing wrong. ${d}`);
  }
  if (status === 403) {
    fail(EXIT_REFUSED,
      `This account isn't approved to send apps to Keshet yet. Someone from the platform team needs to add it - there is nothing the builder needs to do. ${d}`);
  }
  if (status === 404) {
    fail(EXIT_REFUSED,
      `Keshet has nothing at the address this request went to, so the app was not taken. That usually means the send is aimed at the wrong service, or at one too old to know this request. It needs the platform team; the builder did nothing wrong. ${d}`);
  }
  if (status === 429) {
    fail(EXIT_REFUSED,
      `Keshet asked us to slow down because many requests arrived in a short time. Wait a few minutes and send again - nothing is lost. ${d}`);
  }
  if (status >= 500) {
    fail(EXIT_UNREACHABLE,
      `Something on the Keshet side isn't responding right now. This is not something the builder did. It is safe to send again in a few minutes. ${d}`);
  }
  if (code === 'REQUESTER_REQUIRED') {
    fail(EXIT_SIGNIN,
      `The sign-in Keshet received wasn't a personal one, so it can't record who owns the app. Run the send again and sign in when the code appears. ${d}`);
  }
  if (code === 'NAME_INVALID') {
    fail(EXIT_REFUSED,
      `Keshet did not accept the app's name${msg ? `: ${msg}` : ''}. Pick a new name with the builder and send again - nothing was created. ${d}`);
  }
  if (code === 'NAME_TAKEN' || code === 'DOMAIN_ALREADY_EXISTS') {
    fail(EXIT_REFUSED,
      `There's already an app called that at Keshet. Pick a different name with the builder and send again - nothing was created, so there is nothing to undo. ${d}`);
  }
  if (code === 'VAULT_NAME_SOFT_DELETED') {
    fail(EXIT_REFUSED,
      `An app with this name existed before and was removed, and Keshet keeps its stored settings for a short while, so the name isn't free yet. Pick a different name, or ask the platform team to release this one. ${d}`);
  }
  fail(EXIT_REFUSED,
    `Keshet did not accept the request${msg ? `: ${msg}` : ''}. If that doesn't say what to change, it is one for the platform team - the builder did nothing wrong. ${d}`);
};

// The IT review case the run raised, when the answer carries one. Printed at
// the end of a send so the builder and the approver look at the same case.
let itccId = '';
const noteItcc = (json) => {
  const id = jstr(json, 'itccId');
  if (id !== '' && id !== 'null') itccId = id;
};

const accepted = () => {
  say('Accepted. The app is with Keshet now: it runs the automatic security checks, and someone from IT reviews what the app does and who can use it before it goes live. There is nothing more for the builder to do.');
  if (itccId !== '') say(`ITCC case: ${itccId}`);
  process.exit(0);
};

// --------------------------------------------------------------------------
// The send itself, from reachability to Keshet's final answer
// --------------------------------------------------------------------------
// --------------------------------------------------------------------------
// The sign-in cache: ~/.kst-auth/deploy-tokens-<host>.json, owner-only.
// Holds the access token, its expiry, and the renewal token. Never printed.
// --------------------------------------------------------------------------
const CACHE_DIR = process.env.KST_AUTH_TOKEN_CACHE_DIR || join(homedir(), '.kst-auth');
const CACHE_FILE = join(CACHE_DIR, `deploy-tokens-${new URL(BASE_URL).host.replace(/[^a-z0-9.-]/gi, '_')}.json`);

const readCache = () => {
  try { return JSON.parse(readFileSync(CACHE_FILE, 'utf8')); } catch { return null; }
};

const saveSignIn = (json, displayName) => {
  const prev = readCache();
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = Number(json?.expiresIn) || 3600;
  const record = {
    accessToken: jstr(json, 'accessToken'),
    refreshToken: jstr(json, 'refreshToken') || (prev?.refreshToken ?? ''),
    expiresAt: now + expiresIn,
    displayName: displayName || (prev?.displayName ?? ''),
  };
  try {
    mkdirSync(CACHE_DIR, { recursive: true, mode: 0o700 });
    writeFileSync(CACHE_FILE, JSON.stringify(record), { mode: 0o600 });
  } catch {
    // A cache that cannot be written only means the next attempt signs in again.
  }
};

const forgetSignIn = () => { try { unlinkSync(CACHE_FILE); } catch { /* already gone */ } };

// Returns { accessToken, displayName } or null. Silent renewal is attempted
// once; any failure falls through to a fresh device sign-in.
const loadSignIn = async () => {
  const c = readCache();
  if (c === null || typeof c.accessToken !== 'string') return null;
  const now = Math.floor(Date.now() / 1000);
  if (c.accessToken !== '' && Number(c.expiresAt) - now > 60) {
    return { accessToken: c.accessToken, displayName: c.displayName || '' };
  }
  if (typeof c.refreshToken === 'string' && c.refreshToken !== '') {
    const r = await http('POST', REFRESH_PATH, JSON.stringify({ refreshToken: c.refreshToken }), 30);
    if (r.ok && jstr(r.json, 'accessToken') !== '') {
      saveSignIn(r.json, c.displayName || '');
      return { accessToken: jstr(r.json, 'accessToken'), displayName: c.displayName || '' };
    }
  }
  forgetSignIn();
  return null;
};

const main = async () => {
  say(`Checking that Keshet's deployment service is reachable at ${BASE_URL}...`);
  // A service that answers anything is reachable; an unhealthy answer is
  // said out loud and the sign-in that follows explains itself properly.
  await probeService();

  // ------------------------------------------------------------------------
  // Sign the builder in (device sign-in via the service's own endpoints).
  // IIS (http.sys) rejects body-less POSTs with HTTP 411, so send an empty
  // JSON body even though the endpoint takes no input.
  // ------------------------------------------------------------------------
  let token = '';
  let builderName = 'the builder';
  // A sign-in from a previous attempt is reused while it lasts, and renewed
  // silently while the renewal token lasts - a failed send must not cost the
  // builder another code. Same file layout as scripts/device-login.sh.
  const cached = await loadSignIn();
  if (cached !== null) {
    token = cached.accessToken;
    builderName = cached.displayName || builderName;
    say(`Still signed in as ${builderName} from the previous attempt.`);
  }
  if (token === '') {
  say('Keshet needs the builder to sign in before the app can be sent.');
  const start = await http('POST', DEVICE_CODE_PATH, '{}', 30);
  if (!start.reached) {
    fail(EXIT_UNREACHABLE,
      `The connection to Keshet ${start.timedOut ? 'timed out' : 'dropped'} while starting the sign-in. It is safe to run the send again. ${detail(DEVICE_CODE_PATH, 0)}`);
  }
  if (start.status >= 400 && start.status < 500) {
    // 404/405/410 is the wrong-instance signature: something is listening and
    // it is not this API, or it is a build from before device sign-in existed.
    const noEndpoint = [404, 405, 410].includes(start.status);
    fail(EXIT_SIGNIN, noEndpoint
      ? `Keshet answered, but there is no sign-in at the address the send is using, so the sign-in never started. Either the send is pointed at the wrong service or that service is too old to have it. Nothing was sent. ${detail(DEVICE_CODE_PATH, start.status)}`
      : `Keshet turned down the request to start the sign-in, so no code was issued. This is not something the builder did - it needs the platform team. Nothing was sent. ${detail(DEVICE_CODE_PATH, start.status, jstr(start.json, 'code'))}`);
  }
  if (!start.ok) {
    fail(EXIT_UNREACHABLE,
      `Keshet's deployment service answered but could not start the sign-in - the trouble is on the service's side, not the network's and not the builder's. It is safe to run the send again in a few minutes. ${detail(DEVICE_CODE_PATH, start.status)}`);
  }
  if (start.json === null) {
    fail(EXIT_UNREACHABLE,
      `Keshet's deployment service accepted the sign-in request and then answered with ${start.empty ? 'nothing at all' : 'something that was not its usual answer'}, which is what a service restarting mid-request looks like. It is safe to run the send again in a few minutes. ${detail(DEVICE_CODE_PATH, start.status)}`);
  }
  const deviceCode = jstr(start.json, 'deviceCode');
  if (deviceCode === '') {
    fail(EXIT_SIGNIN,
      `Keshet answered the sign-in request, but its answer carried no sign-in code, so there is nothing for the builder to enter. This is not something the builder did - it needs the platform team. ${detail(DEVICE_CODE_PATH, start.status)}`);
  }
  const userCode = jstr(start.json, 'userCode');
  const verificationUri = jstr(start.json, 'verificationUri');
  const interval = Number(start.json?.interval) || 5;
  const expiresIn = Number(start.json?.expiresIn) || 900;

  say('');
  say(`To sign in, open this address in a browser:  ${verificationUri}`);
  say(`and enter this code:  ${userCode}`);
  say('It is the same Keshet account used for everything else. Approve the Authenticator prompt if one appears.');
  say('Waiting for the sign-in to finish...');

  // The wait must never fall silent: a heartbeat shows the sign-in window is
  // still open, and a run of failed polls is said out loud instead of being
  // indistinguishable from a builder who has not signed in yet.
  const deadline = Date.now() + expiresIn * 1000;
  let lastHeartbeat = Date.now();
  let pollErrors = 0;
  while (Date.now() < deadline) {
    await sleep(interval);
    const now = Date.now();
    if (now - lastHeartbeat >= 30000) {
      const minutesLeft = Math.ceil((deadline - now) / 60000);
      say(`Still waiting for the sign-in - about ${minutesLeft} minute(s) left on this code.`);
      lastHeartbeat = now;
    }
    const poll = await http('POST', DEVICE_TOKEN_PATH, JSON.stringify({ deviceCode }), 30);
    // The service reports both waiting and refusal in the body, so a non-2xx
    // that still carries a body is an answer to read, not a failure to retry.
    if (!poll.reached || (!poll.ok && poll.json === null)) {
      pollErrors += 1;
      if (pollErrors === 6) {
        say(`Having trouble getting an answer from Keshet while waiting for the sign-in - still trying. If this keeps up, the problem is the connection or the service, not the sign-in. ${detail(DEVICE_TOKEN_PATH, poll.status)}`);
      }
      continue;
    }
    pollErrors = 0;
    const status = jstr(poll.json, 'status');
    if (status === 'authenticated') {
      token = jstr(poll.json, 'accessToken');
      builderName = jstr(poll.json, 'displayName') || jstr(poll.json, 'username') || 'the builder';
      saveSignIn(poll.json, builderName);
      break;
    }
    if (status === 'pending') continue;
    if (jstr(poll.json, 'code') !== '') {
      fail(EXIT_SIGNIN,
        `The sign-in did not complete. Nothing is lost - run the send again for a fresh code. ${detail(DEVICE_TOKEN_PATH, poll.status, jstr(poll.json, 'code'))}`);
    }
    if (!poll.ok) {
      fail(EXIT_SIGNIN,
        `Keshet turned down the check on the sign-in, so it cannot finish. Nothing is lost - run the send again for a fresh code. ${detail(DEVICE_TOKEN_PATH, poll.status)}`);
    }
  }
  if (token === '') {
    fail(EXIT_SIGNIN,
      'The sign-in code expired before it was used. Nothing is lost - run the send again for a fresh code.');
  }
  say(`Signed in as ${builderName}.`);
  }

  // ------------------------------------------------------------------------
  // Send, then follow the run until Keshet has an answer
  // ------------------------------------------------------------------------
  say('Sending the app to Keshet now. This can take a few minutes...');
  const sent = await http('POST', SEND_PATH, JSON.stringify(payload), 900, token);
  if (!sent.reached) {
    fail(EXIT_UNREACHABLE,
      `The connection to Keshet ${sent.timedOut ? 'timed out' : 'dropped'} while sending. It is safe to run the send again - the identical app sent twice is recognised as the same request. ${detail(SEND_PATH, 0)}`);
  }
  if (sent.status === 401) forgetSignIn();
  if (!sent.ok) refuseHttp(sent.status, sent.json, SEND_PATH);
  if (sent.json === null) {
    fail(EXIT_UNREACHABLE,
      `Keshet took the app and then answered with ${sent.empty ? 'nothing at all' : 'something that could not be read'}, so there is no way to tell here what became of it. It is safe to run the send again in a few minutes - the identical app sent twice is recognised as the same request. ${detail(SEND_PATH, sent.status)}`);
  }

  let runStatus = jstr(sent.json, 'status');
  const runId = jstr(sent.json, 'runId');
  const sentApp = jstr(sent.json, 'appName');
  noteItcc(sent.json);

  if (['pending_approval', 'approving', 'completed'].includes(runStatus)) accepted();
  if (runStatus === 'failed') {
    refuseStep(jstr(sent.json, 'failedStep'), jstr(sent.json, 'lastErrorMessage'), runId);
  }
  if (runStatus !== 'running') {
    fail(EXIT_REFUSED,
      `Keshet's answer did not say whether the app was accepted. It is safe to send again in a few minutes. Reference for the platform team: run ${runId || 'unknown'}.`);
  }

  say('Keshet accepted the request and is working on it...');
  let lastStep = '';
  for (let i = 0; i < POLL_COUNT; i++) {
    await sleep(POLL_INTERVAL);
    const runPath = `${SEND_PATH}/${sentApp}/runs/${runId}`;
    const r = await http('GET', runPath, undefined, 60, token);
    if (!r.reached) continue;
    if (!r.ok) refuseHttp(r.status, r.json, runPath);
    runStatus = jstr(r.json, 'status');
    noteItcc(r.json);
    const started = (Array.isArray(r.json?.steps) ? r.json.steps : [])
      .filter((s) => s?.status === 'started');
    const step = started.length > 0 ? jstr(started[started.length - 1], 'name') : '';
    if (step !== '' && step !== lastStep) {
      say(`Keshet is ${stepLabel(step)}...`);
      lastStep = step;
    }
    if (['pending_approval', 'approving', 'completed'].includes(runStatus)) accepted();
    if (runStatus === 'failed') {
      refuseStep(jstr(r.json, 'failedStep'), jstr(r.json, 'lastErrorMessage'), runId);
    }
    if (runStatus === 'rejected' || runStatus === 'abandoned') {
      fail(EXIT_REFUSED,
        `Keshet closed this request without taking the app. It is safe to send again. Reference for the platform team: run ${runId}.`);
    }
  }

  fail(EXIT_UNREACHABLE,
    'Keshet is still working on the request and has not given a final answer yet. Nothing is wrong - run the send again in a few minutes; the identical app sent twice is recognised as the same request.');
};

main();
