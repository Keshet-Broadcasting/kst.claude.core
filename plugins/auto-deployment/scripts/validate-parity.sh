#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# validate-parity.sh - assert that the bash and PowerShell twins of the
# builder-side tooling have not drifted on the behaviours that matter.
#
# The plugin ships every builder-facing script twice - send-deploy.sh with
# send-deploy.ps1, and each hook with its .ps1 twin - because builder
# machines run macOS or Windows. Two copies of the same logic will diverge
# unless something fails when they do. This script is that something, in the
# spirit of platform/scripts/validate-templates.sh: each assertion pins a
# behaviour the verifier or the hooks depend on.
#
# What it checks:
#   1. deploy-config.json parses, and carries the agreed keys and ceilings.
#   2. Both send scripts define the same exit codes - the verifier acts on
#      the exit code and nothing else.
#   3. Both send scripts read the same config keys and honour the same
#      environment overrides.
#   4. Both send scripts print the ITCC case id.
#   5. Both twins of each hook name the same signals, and hooks.json routes
#      through the OS dispatcher whose twins actually exist.
#   6. Behavioural probes: the same payloads produce the same hook decision
#      from the .sh (always) and the .ps1 (when pwsh or powershell is
#      installed; skipped with a note otherwise).
#
# Run it from the repository root:
#     bash plugins/auto-deployment/scripts/validate-parity.sh
# or via the package script:
#     pnpm run validate:parity
# Requires bash and jq; PowerShell is optional (probes are skipped without
# it). Exits non-zero on any drift.
# ---------------------------------------------------------------------------
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

CONFIG="${SCRIPT_DIR}/deploy-config.json"
SEND_SH="${SCRIPT_DIR}/send-deploy.sh"
SEND_PS1="${SCRIPT_DIR}/send-deploy.ps1"
HOOKS_DIR="${PLUGIN_DIR}/hooks"
HOOKS_JSON="${HOOKS_DIR}/hooks.json"
DISPATCHER="${HOOKS_DIR}/run-hook.mjs"

ERRORS=0

fail() {
  echo "  FAIL: $1"
  ERRORS=$((ERRORS + 1))
}

pass() {
  echo "  ok:   $1"
}

note() {
  echo "  note: $1"
}

command -v jq >/dev/null 2>&1 || { echo "FAIL: jq is required to run this validator."; exit 1; }

# The PowerShell interpreter, when one is installed on this machine.
PWSH=""
if command -v pwsh >/dev/null 2>&1; then
  PWSH="pwsh"
elif command -v powershell >/dev/null 2>&1; then
  PWSH="powershell"
fi

# ---------------------------------------------------------------------------
echo "=== 1. deploy-config.json ==="
# ---------------------------------------------------------------------------
if ! jq -e . "$CONFIG" >/dev/null 2>&1; then
  fail "deploy-config.json is missing or not valid JSON"
else
  pass "deploy-config.json parses"

  check_cfg() { # check_cfg <jq-expr> <expected> <label>
    local got
    got="$(jq -r "$1" "$CONFIG" 2>/dev/null)"
    if [[ "$got" == "$2" ]]; then
      pass "$3"
    else
      fail "$3 - expected '$2', got '$got'"
    fi
  }

  check_cfg '.apiBaseUrl | type' 'string' "apiBaseUrl is present"
  check_cfg '.limits.maxFiles' '2000' "limits.maxFiles is 2000"
  check_cfg '.limits.maxBytes' '10485760' "limits.maxBytes is 10485760 (10 MB)"
  check_cfg '.polling.count' '60' "polling.count is 60"
  check_cfg '.polling.intervalSeconds' '5' "polling.intervalSeconds is 5"
  check_cfg '.exclusions.directories | sort | join(",")' '.git,.kst-deploy,.next,build,dist,node_modules' \
    "exclusions.directories is the sign-off digest's list"
  check_cfg '.exclusions.files | sort | join(",")' '.env,.env.*' \
    "exclusions.files is .env and .env.*"

  if jq -r 'paths(scalars) | join(".")' "$CONFIG" | grep -qiE 'secret|token|password|key$'; then
    fail "deploy-config.json has a key that looks secret-shaped; nothing secret goes in it"
  else
    pass "no secret-shaped keys in deploy-config.json"
  fi
fi

# ---------------------------------------------------------------------------
echo ""
echo "=== 2. Send tooling: one implementation, two launchers ==="
# ---------------------------------------------------------------------------
SEND_MJS="${SCRIPT_DIR}/send-deploy.mjs"

if ! command -v node >/dev/null 2>&1; then
  fail "node is required (the hooks dispatcher and the send both run on it)"
elif node --check "$SEND_MJS" >/dev/null 2>&1; then
  pass "send-deploy.mjs parses (node --check)"
else
  fail "send-deploy.mjs does not parse"
fi

# The verifier acts on the exit code and nothing else; the .mjs owns them.
for pair in "EXIT_LOCAL 1" "EXIT_REFUSED 2" "EXIT_UNREACHABLE 3" "EXIT_SIGNIN 4"; do
  name="${pair% *}"
  value="${pair#* }"
  if grep -qE "^const ${name} = ${value};\$" "$SEND_MJS"; then
    pass "send-deploy.mjs: ${name} = ${value}"
  else
    fail "send-deploy.mjs does not define ${name} = ${value}"
  fi
done

# The launchers must hand over to the one implementation and carry none of
# their own send logic - duplicated logic is what drifts.
for f in "$SEND_SH" "$SEND_PS1"; do
  ok=1
  grep -q 'send-deploy\.mjs' "$f" || { fail "$(basename "$f") does not launch send-deploy.mjs"; ok=0; }
  grep -qE 'device-code|/api/apps' "$f" && { fail "$(basename "$f") carries send logic of its own instead of launching the .mjs"; ok=0; }
  [[ $ok -eq 1 ]] && pass "$(basename "$f") is a thin launcher for send-deploy.mjs"
done
if bash -n "$SEND_SH" 2>/dev/null; then
  pass "send-deploy.sh parses (bash -n)"
else
  fail "send-deploy.sh does not parse"
fi

# ---------------------------------------------------------------------------
echo ""
echo "=== 3. Send tooling: config keys and environment overrides ==="
# ---------------------------------------------------------------------------
for key in apiBaseUrl maxFiles maxBytes count intervalSeconds directories files; do
  if grep -q "$key" "$SEND_MJS"; then
    pass "send-deploy.mjs reads config key '$key'"
  else
    fail "send-deploy.mjs never reads config key '$key'"
  fi
done

for var in KST_AUTH_API_BASE_URL KST_DEPLOY_MAX_FILES KST_DEPLOY_MAX_BYTES \
           KST_DEPLOY_POLL_COUNT KST_DEPLOY_POLL_INTERVAL; do
  if grep -q "$var" "$SEND_MJS"; then
    pass "send-deploy.mjs honours the $var override"
  else
    fail "send-deploy.mjs does not honour the $var override"
  fi
done

# The built-in fallbacks (used when the config file is absent) must match the
# config file's own values, or the two "defaults" drift apart.
grep -q "'maxFiles'], 2000" "$SEND_MJS" \
  && pass "send-deploy.mjs falls back to 2000 files" \
  || fail "the 2000-file fallback is not present in send-deploy.mjs"
grep -qE "10 \* 1024 \* 1024" "$SEND_MJS" \
  && pass "send-deploy.mjs falls back to the 10 MB ceiling" \
  || fail "the 10 MB fallback is not present in send-deploy.mjs"
grep -q "'count'], 60" "$SEND_MJS" \
  && pass "send-deploy.mjs falls back to 60 polls" \
  || fail "the 60-poll fallback is not present in send-deploy.mjs"
grep -q "'intervalSeconds'], 5" "$SEND_MJS" \
  && pass "send-deploy.mjs falls back to a 5s poll interval" \
  || fail "the 5s poll interval fallback is not present in send-deploy.mjs"

# ---------------------------------------------------------------------------
echo ""
echo "=== 4. Send tooling: behaviour probes and the ITCC case id ==="
# ---------------------------------------------------------------------------
# The exit-code contract, exercised rather than grepped: local-input problems
# must exit 1 before anything is sent.
if command -v node >/dev/null 2>&1; then
  node "$SEND_MJS" /nonexistent-app-folder >/dev/null 2>&1
  [[ $? -eq 1 ]] && pass "missing app folder exits 1" || fail "missing app folder does not exit 1"
  node "$SEND_MJS" --bogus-option >/dev/null 2>&1
  [[ $? -eq 1 ]] && pass "unknown option exits 1" || fail "unknown option does not exit 1"
  PROBE_DIR="$(mktemp -d)"
  node "$SEND_MJS" "$PROBE_DIR" >/dev/null 2>&1
  [[ $? -eq 1 ]] && pass "missing DEPLOY_REQUEST.md exits 1" || fail "missing DEPLOY_REQUEST.md does not exit 1"
  rm -rf "$PROBE_DIR"

  # The stamped blocks: Keshet rewrites the Requester and sign-off lines and
  # can only rewrite a line that exists, so the send refuses a request that
  # lacks them before anything leaves the machine.
  TEMPLATE="${PLUGIN_DIR}/templates/DEPLOY_REQUEST.md"
  if [[ -f "$TEMPLATE" ]]; then
    pass "templates/DEPLOY_REQUEST.md ships with the plugin"
    for field in app-name purpose description tags data-sources audience-type \
                 audience-members declared-secrets requested-by-upn \
                 requested-by-object-id broker-verified-at verifier-signoff; do
      grep -qE "^${field}:" "$TEMPLATE" \
        && pass "template carries '${field}'" \
        || fail "template lacks the gate-required field '${field}'"
    done
    PROBE_DIR="$(mktemp -d)"
    sed -e 's/^app-name: CHANGE-ME/app-name: probe-app/' \
        -e 's/^purpose: CHANGE-ME/purpose: probe/' \
        -e 's/^description: CHANGE-ME/description: probe/' \
        -e 's/^tags: CHANGE-ME/tags: probe/' \
        -e 's/^data-sources: CHANGE-ME/data-sources: none/' \
        -e 's/^audience-type: CHANGE-ME/audience-type: individuals/' \
        -e 's/^audience-members: CHANGE-ME/audience-members: probe@example.com/' \
        "$TEMPLATE" | grep -vE '^(requested-by-upn|requested-by-object-id|broker-verified-at|verifier-signoff):' \
        > "${PROBE_DIR}/DEPLOY_REQUEST.md"
    out="$(node "$SEND_MJS" "$PROBE_DIR" 2>&1)"
    rc=$?
    if [[ $rc -eq 1 ]] && grep -q 'requested-by-upn' <<<"$out"; then
      pass "request without the stamped blocks exits 1 and names the missing lines"
    else
      fail "request without the stamped blocks: exit ${rc}, output: ${out:-<none>}"
    fi
    rm -rf "$PROBE_DIR"
  else
    fail "templates/DEPLOY_REQUEST.md is missing from the plugin"
  fi
fi

if grep -q 'itccId' "$SEND_MJS" && grep -q 'ITCC case:' "$SEND_MJS"; then
  pass "send-deploy.mjs reads itccId and prints 'ITCC case:'"
else
  fail "send-deploy.mjs never surfaces the ITCC case id"
fi

# ---------------------------------------------------------------------------
echo ""
echo "=== 5. Hooks: twins, signals, and registration ==="
# ---------------------------------------------------------------------------
for hook in sharing-intent-check block-external-hosting; do
  sh_file="${HOOKS_DIR}/${hook}.sh"
  ps_file="${HOOKS_DIR}/${hook}.ps1"
  [[ -f "$sh_file" ]] && pass "${hook}.sh exists" || fail "${hook}.sh is missing"
  [[ -f "$ps_file" ]] && pass "${hook}.ps1 exists" || fail "${hook}.ps1 is missing"
  if jq -r '.. | .command? // empty' "$HOOKS_JSON" 2>/dev/null | grep -q "run-hook.mjs\" ${hook}\$"; then
    pass "hooks.json routes ${hook} through the dispatcher"
  else
    fail "hooks.json does not route ${hook} through run-hook.mjs"
  fi
done
[[ -f "$DISPATCHER" ]] && pass "run-hook.mjs exists" || fail "run-hook.mjs is missing"

# The signals each hook fires on, named as literal tokens (grep -F, so the
# escaped regex forms match as written in the sources). A twin that loses one
# of these has lost a decision the other still makes.
for tok in ngrok cloudflared localtunnel surge vercel netlify wrangler '--host' '0\.0\.0\.0'; do
  ok=1
  grep -qF -- "$tok" "${HOOKS_DIR}/block-external-hosting.sh" \
    || { fail "block-external-hosting.sh lost the '$tok' signal"; ok=0; }
  grep -qF -- "$tok" "${HOOKS_DIR}/block-external-hosting.ps1" \
    || { fail "block-external-hosting.ps1 lost the '$tok' signal"; ok=0; }
  [[ $ok -eq 1 ]] && pass "block-external-hosting twins both carry '$tok'"
done

for tok in localhost '127\.0\.0\.1' 'on my machine' ngrok vercel '--host'; do
  ok=1
  grep -qF -- "$tok" "${HOOKS_DIR}/sharing-intent-check.sh" \
    || { fail "sharing-intent-check.sh lost the '$tok' signal"; ok=0; }
  grep -qF -- "$tok" "${HOOKS_DIR}/sharing-intent-check.ps1" \
    || { fail "sharing-intent-check.ps1 lost the '$tok' signal"; ok=0; }
  [[ $ok -eq 1 ]] && pass "sharing-intent-check twins both carry '$tok'"
done

# Both hooks must deny/inject the same way: the block hook with a deny
# decision, the intent hook with additionalContext.
for f in "${HOOKS_DIR}/block-external-hosting.sh" "${HOOKS_DIR}/block-external-hosting.ps1"; do
  grep -q 'permissionDecision' "$f" && grep -q 'deny' "$f" \
    && pass "$(basename "$f") emits a deny decision" \
    || fail "$(basename "$f") no longer emits a deny decision"
done
for f in "${HOOKS_DIR}/sharing-intent-check.sh" "${HOOKS_DIR}/sharing-intent-check.ps1"; do
  grep -q 'additionalContext' "$f" \
    && pass "$(basename "$f") emits additionalContext" \
    || fail "$(basename "$f") no longer emits additionalContext"
done

# ---------------------------------------------------------------------------
echo ""
echo "=== 6. Hooks: behavioural probes ==="
# ---------------------------------------------------------------------------
# The same payload goes to both twins; both must reach the same decision.
# The .sh side always runs. The .ps1 side runs when PowerShell is installed.

probe_session() { printf 'parity-%s-%s' "$$" "$RANDOM"; }

run_sh_hook() { # run_sh_hook <hook> <payload>
  printf '%s' "$2" | bash "${HOOKS_DIR}/$1.sh" 2>/dev/null
}

run_ps_hook() { # run_ps_hook <hook> <payload>
  printf '%s' "$2" | "$PWSH" -NoProfile -NonInteractive -File "${HOOKS_DIR}/$1.ps1" 2>/dev/null
}

# probe <hook> <expect-marker|-> <label> <payload> [payload-for-ps1]
# expect-marker is a string the output must contain for a "fires" decision,
# or '-' when the hook must stay silent. The optional fifth argument gives
# the .ps1 side its own payload - needed for once-per-session signals, where
# both twins share the same session marker and the second run would
# otherwise (correctly) stay quiet.
probe() {
  local hook="$1" marker="$2" label="$3" payload="$4" payload_ps="${5:-$4}"
  local out_sh decision_sh out_ps decision_ps

  out_sh="$(run_sh_hook "$hook" "$payload")"
  if [[ "$marker" == "-" ]]; then
    [[ -z "$out_sh" ]] && decision_sh=ok || decision_sh=bad
  else
    grep -q "$marker" <<<"$out_sh" && decision_sh=ok || decision_sh=bad
  fi
  [[ "$decision_sh" == ok ]] \
    && pass "sh: $label" \
    || fail "sh: $label - got: ${out_sh:-<no output>}"

  if [[ -n "$PWSH" ]]; then
    out_ps="$(run_ps_hook "$hook" "$payload_ps")"
    if [[ "$marker" == "-" ]]; then
      [[ -z "$out_ps" ]] && decision_ps=ok || decision_ps=bad
    else
      grep -q "$marker" <<<"$out_ps" && decision_ps=ok || decision_ps=bad
    fi
    [[ "$decision_ps" == ok ]] \
      && pass "ps1: $label" \
      || fail "ps1: $label - got: ${out_ps:-<no output>}"
  fi
}

[[ -n "$PWSH" ]] || note "PowerShell not installed here - .ps1 probes skipped; run this on a machine with pwsh before shipping a .ps1 change"

bh=block-external-hosting
probe "$bh" 'deny' "denies 'ngrok http 3000'" \
  "$(jq -cn '{tool_input:{command:"ngrok http 3000"}}')"
probe "$bh" 'deny' "denies 'npm run dev -- --host 0.0.0.0'" \
  "$(jq -cn '{tool_input:{command:"npm run dev -- --host 0.0.0.0"}}')"
probe "$bh" 'deny' "denies 'vercel deploy'" \
  "$(jq -cn '{tool_input:{command:"vercel deploy"}}')"
probe "$bh" 'deny' "denies 'npx localtunnel --port 3000'" \
  "$(jq -cn '{tool_input:{command:"npx localtunnel --port 3000"}}')"
probe "$bh" '-' "allows 'grep -r ngrok docs/'" \
  "$(jq -cn '{tool_input:{command:"grep -r ngrok docs/"}}')"
probe "$bh" '-' "allows 'cat notes-about-vercel.md'" \
  "$(jq -cn '{tool_input:{command:"cat notes-about-vercel.md"}}')"
probe "$bh" '-' "allows 'ls -la'" \
  "$(jq -cn '{tool_input:{command:"ls -la"}}')"

sic=sharing-intent-check
probe "$sic" 'additionalContext' "fires on a localhost sharing symptom" \
  "$(jq -cn --arg s "$(probe_session)" '{session_id:$s, prompt:"my manager cant open the app at localhost:3000"}')" \
  "$(jq -cn --arg s "$(probe_session)" '{session_id:$s, prompt:"my manager cant open the app at localhost:3000"}')"
probe "$sic" 'additionalContext' "fires on an escape signal (ngrok)" \
  "$(jq -cn --arg s "$(probe_session)" '{session_id:$s, prompt:"can you use ngrok so I can send it to him"}')"
probe "$sic" '-' "stays quiet on an ordinary prompt" \
  "$(jq -cn --arg s "$(probe_session)" '{session_id:$s, prompt:"please add a nicer header to the page"}')"

# ---------------------------------------------------------------------------
echo ""
if (( ERRORS > 0 )); then
  echo "validate-parity: ${ERRORS} failure(s) - the .sh/.ps1 twins have drifted."
  exit 1
fi
echo "validate-parity: all checks passed."
exit 0
