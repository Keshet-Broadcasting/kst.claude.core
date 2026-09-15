#!/usr/bin/env bash
# ===========================================================================
# send-deploy.sh - send a builder's app to the Keshet deployment service.
#
# Thin launcher: the whole send lives in send-deploy.mjs, one implementation
# for every platform, running on Node.js alone - no curl, no jq, no
# coreutils - because builder machines range from vanilla macOS to sandboxed
# minimal Linux, and Node is the one tool every builder machine already has
# (the apps themselves are Next.js apps). This file only finds Node and
# hands over; send-deploy.ps1 is its Windows twin.
#
# Usage:
#   send-deploy.sh [--check] [--signoff FILE] [APP_DIR]
#
# Exit codes (the verifier acts on these; the .mjs owns them):
#   0  accepted - the deployment run reached IT review or beyond
#   1  could not run - bad input, a missing tool, or an incomplete request
#   2  refused - Keshet turned the request down; the reason was printed
#   3  unreachable - network or service trouble; safe to run again
#   4  sign-in failed or timed out
# ===========================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v node >/dev/null 2>&1 || {
  printf '%s\n' "The send tooling needs Node.js and could not find it, so nothing was sent. Building the app needs Node too, so on a builder machine this is a platform problem to report, not something the builder did."
  exit 1
}

exec node "${SCRIPT_DIR}/send-deploy.mjs" "$@"
