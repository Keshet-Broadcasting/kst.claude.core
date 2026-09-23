#!/usr/bin/env node
// ===========================================================================
// tree-digest.mjs - one digest of an app's files, in one command.
//
// The deploy chain records a digest before and after every step, and the
// verifier signs one. Worked out by hand, each costs several shell turns, and
// a recipe that mixes in the git HEAD voids every check on a checkpoint
// commit that changed no file. This script digests file CONTENTS only.
//
// Usage:
//   node tree-digest.mjs [--sent] [APP_DIR]
//
//   (default)  the run-record digest: the files git sees as the app's code -
//              tracked plus untracked, minus anything .gitignore excludes -
//              leaving out DEPLOY_REQUEST.md, .kst-deploy/ and every .env*,
//              which the chain's own steps write as part of their job.
//              Needs a git repo; the chain never runs without one.
//   --sent     the sign-off digest: exactly the files the send tooling
//              sends, walked from disk with the exclusions in
//              deploy-config.json, DEPLOY_REQUEST.md included.
//
// Both hash the sorted list of (path, sha256 of the file's bytes) pairs and
// print "sha256:<64 hex>" on stdout.
//
// Exit codes:
//   0  the digest was printed
//   2  it could not be worked out (no such folder, not a git repo); the
//      reason is printed instead - a chain that cannot digest fails closed
// ===========================================================================

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, readlinkSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXIT_COULD_NOT_RUN = 2;

const fail = (msg) => { console.log(msg); process.exit(EXIT_COULD_NOT_RUN); };

let sent = false;
let appDir = process.cwd();
for (const a of process.argv.slice(2)) {
  if (a === '--sent') sent = true;
  else if (a.startsWith('--')) fail(`Unknown option: ${a}. Usage: tree-digest.mjs [--sent] [APP_DIR]`);
  else appDir = a;
}
appDir = resolve(appDir);
try {
  if (!lstatSync(appDir).isDirectory()) fail('The app folder was not found.');
} catch { fail('The app folder was not found.'); }

// The exclusions the send uses, from the same file the send reads.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
let exclusions = {};
try {
  exclusions = JSON.parse(readFileSync(join(SCRIPT_DIR, 'deploy-config.json'), 'utf8')).exclusions ?? {};
} catch { exclusions = {}; }
const EXCLUDE_DIRS = exclusions.directories
  || ['node_modules', '.git', '.next', 'dist', 'build', '.kst-deploy'];
const EXCLUDE_FILES = exclusions.files || ['.env', '.env.*'];
const globToRegExp = (glob) => new RegExp(
  `^${glob.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`,
);
const excludedFile = EXCLUDE_FILES.map(globToRegExp);
const isExcludedFile = (name) => excludedFile.some((re) => re.test(name));

// A file's bytes, or null when it is gone (a tracked file deleted in the
// working tree). A symbolic link is digested as where it points.
const bytesOf = (path) => {
  try {
    const st = lstatSync(path);
    if (st.isSymbolicLink()) return Buffer.from(`link:${readlinkSync(path)}`);
    if (!st.isFile()) return null;
    return readFileSync(path);
  } catch { return null; }
};

const sentFiles = () => {
  const out = [];
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDE_DIRS.includes(entry.name)) walk(full);
      } else if (entry.isFile() && !isExcludedFile(entry.name)) {
        out.push(relative(appDir, full).split(sep).join('/'));
      }
    }
  };
  walk(appDir);
  return out;
};

const codeFiles = () => {
  const r = spawnSync('git', ['-C', appDir, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error || r.status !== 0) {
    fail('The app folder is not a git repo (or git is not installed), so its code cannot be digested. Set up version history first.');
  }
  const paths = r.stdout.split('\0').filter((p) => p !== '');
  return [...new Set(paths)].filter((p) => {
    const parts = p.split('/');
    if (p === 'DEPLOY_REQUEST.md') return false;
    if (parts.some((part) => part === '.kst-deploy')) return false;
    return !isExcludedFile(parts[parts.length - 1]);
  });
};

const paths = (sent ? sentFiles() : codeFiles()).sort();
const hash = createHash('sha256');
for (const p of paths) {
  const bytes = bytesOf(join(appDir, p));
  if (bytes === null) continue;
  hash.update(`${p}\0${createHash('sha256').update(bytes).digest('hex')}\n`);
}
console.log(`sha256:${hash.digest('hex')}`);
