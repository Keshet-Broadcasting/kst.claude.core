#!/usr/bin/env bash
# ===========================================================================
# send-deploy.sh - send a builder's app to the Keshet deployment service.
#
# The verifier agent runs this script as the one and only way an app reaches
# Keshet. It signs the builder in through the service's own device sign-in,
# assembles the deploy request from DEPLOY_REQUEST.md, the app's files, and
# the gitignored .env, sends it, and follows the deployment run until Keshet
# has an answer.
#
# Usage:
#   send-deploy.sh [--signoff FILE] [APP_DIR]
#
#   APP_DIR         the app's folder (default: the current directory)
#   --signoff FILE  the verifier's sign-off record, a JSON file kept OUTSIDE
#                   the app folder so it never becomes part of the sent tree
#
# Exit codes (the verifier acts on these):
#   0  accepted - the deployment run reached IT review or beyond
#   1  could not run - bad input, a missing tool, or an incomplete request
#   2  refused - Keshet turned the request down; the reason was printed
#   3  unreachable - network or service trouble; safe to run again
#   4  sign-in failed or timed out
#
# Secrets: values are read from .env straight into the request body held in
# memory. They are never printed, never logged, and never written to disk.
# Sign-in tokens stay in shell variables and are never echoed.
# ===========================================================================
set -euo pipefail

readonly EXIT_LOCAL=1
readonly EXIT_REFUSED=2
readonly EXIT_UNREACHABLE=3
readonly EXIT_SIGNIN=4

say()  { printf '%s\n' "$*"; }
fail() { local rc="$1"; shift; say "$*"; exit "$rc"; }

# --------------------------------------------------------------------------
# Shared configuration - deploy-config.json next to this script
#
# The same file feeds send-deploy.ps1, so the two implementations agree on
# the service address, the tree ceilings, the polling cadence, and the
# exclusion list. NOTHING SECRET lives in it. Environment variables still
# override, and built-in defaults cover a missing or unreadable file.
# --------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/deploy-config.json"

cfg() { # cfg <jq-path> <default> - config value or default, never fails
  local v=""
  if [[ -f "$CONFIG_FILE" ]] && command -v jq >/dev/null 2>&1; then
    v="$(jq -r "$1 // empty" "$CONFIG_FILE" 2>/dev/null || true)"
  fi
  printf '%s' "${v:-$2}"
}

# The single switch point for which service instance receives the app. Set
# KST_AUTH_API_BASE_URL to the production instance to send there; nothing
# else in this script knows which instance it is talking to.
BASE_URL="${KST_AUTH_API_BASE_URL:-$(cfg '.apiBaseUrl' 'https://api-auth-stage.keshet-tv.com')}"

# Bounds the service enforces on the sent tree, checked here first so the
# builder hears about a problem before a long upload rather than after one.
MAX_FILES="${KST_DEPLOY_MAX_FILES:-$(cfg '.limits.maxFiles' 2000)}"
MAX_BYTES="${KST_DEPLOY_MAX_BYTES:-$(cfg '.limits.maxBytes' $((10 * 1024 * 1024)))}"

# How long the script follows a deployment run before giving up.
POLL_COUNT="${KST_DEPLOY_POLL_COUNT:-$(cfg '.polling.count' 60)}"
POLL_INTERVAL="${KST_DEPLOY_POLL_INTERVAL:-$(cfg '.polling.intervalSeconds' 5)}"

# The exclusion list - the same list the sign-off digest uses.
EXCLUDE_DIRS=()
if [[ -f "$CONFIG_FILE" ]] && command -v jq >/dev/null 2>&1; then
  while IFS= read -r d; do
    [[ -n "$d" ]] && EXCLUDE_DIRS+=("$d")
  done < <(jq -r '.exclusions.directories[]?' "$CONFIG_FILE" 2>/dev/null || true)
fi
((${#EXCLUDE_DIRS[@]})) || EXCLUDE_DIRS=(node_modules .git .next dist build)
EXCLUDE_FILES=()
if [[ -f "$CONFIG_FILE" ]] && command -v jq >/dev/null 2>&1; then
  while IFS= read -r p; do
    [[ -n "$p" ]] && EXCLUDE_FILES+=("$p")
  done < <(jq -r '.exclusions.files[]?' "$CONFIG_FILE" 2>/dev/null || true)
fi
((${#EXCLUDE_FILES[@]})) || EXCLUDE_FILES=('.env' '.env.*')


# --------------------------------------------------------------------------
# Arguments and preconditions
# --------------------------------------------------------------------------
APP_DIR="$PWD"
SIGNOFF_FILE=""
while (($#)); do
  case "$1" in
    --signoff)
      [[ $# -ge 2 ]] || fail "$EXIT_LOCAL" "--signoff needs a file path after it."
      SIGNOFF_FILE="$2"; shift 2 ;;
    --*)
      fail "$EXIT_LOCAL" "Unknown option: $1. Usage: send-deploy.sh [--signoff FILE] [APP_DIR]" ;;
    *)
      APP_DIR="$1"; shift ;;
  esac
done

for cmd in curl jq; do
  command -v "$cmd" >/dev/null 2>&1 \
    || fail "$EXIT_LOCAL" "The send tooling needs '$cmd' on this machine and could not find it, so nothing was sent."
done

[[ -d "$APP_DIR" ]] || fail "$EXIT_LOCAL" "The app folder was not found, so nothing was sent."
APP_DIR="$(cd "$APP_DIR" && pwd)"
REQ_FILE="$APP_DIR/DEPLOY_REQUEST.md"
[[ -f "$REQ_FILE" ]] \
  || fail "$EXIT_LOCAL" "The deployment request file is missing from the app folder, so nothing was sent. The deployment details need collecting before the app can go to Keshet."

# --------------------------------------------------------------------------
# Read the deployment request
# --------------------------------------------------------------------------
req_field() {
  grep -E "^$1:" "$REQ_FILE" | head -1 | cut -d: -f2- \
    | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

require_field() {
  local name="$1" value="$2"
  if [[ -z "$value" || "$value" == *CHANGE-ME* ]]; then
    fail "$EXIT_LOCAL" "The deployment details are missing '$name', so nothing was sent. That answer needs filling in before the app can go to Keshet."
  fi
}

APP_NAME="$(req_field 'app-name')"
PURPOSE="$(req_field 'purpose')"
DESCRIPTION="$(req_field 'description')"
TAGS="$(req_field 'tags')"
DATA_SOURCES="$(req_field 'data-sources')"
AUDIENCE_TYPE="$(req_field 'audience-type')"
AUDIENCE_MEMBERS="$(req_field 'audience-members')"
DECLARED_RAW="$(req_field 'declared-secrets')"

require_field 'app-name' "$APP_NAME"
require_field 'purpose' "$PURPOSE"
require_field 'description' "$DESCRIPTION"
require_field 'tags' "$TAGS"
require_field 'data-sources' "$DATA_SOURCES"
require_field 'audience-type' "$AUDIENCE_TYPE"
require_field 'audience-members' "$AUDIENCE_MEMBERS"

# The IT review form asks for the audience and the kind of information the
# app handles; both are answered from the request file, in words a reviewer
# can judge. Apps on this platform are only ever opened by the named Keshet
# audience, so external sharing is always "no".
case "$AUDIENCE_TYPE" in
  individuals)  TARGET_AUDIENCE="Named people: ${AUDIENCE_MEMBERS}" ;;
  entra-groups) TARGET_AUDIENCE="Team groups: ${AUDIENCE_MEMBERS}" ;;
  *)            TARGET_AUDIENCE="${AUDIENCE_TYPE}: ${AUDIENCE_MEMBERS}" ;;
esac
if [[ "$DATA_SOURCES" == "none" ]]; then
  INFORMATION_TYPE="Internal Keshet data. The app reaches no external data sources."
else
  INFORMATION_TYPE="Internal Keshet data. Data sources: ${DATA_SOURCES}"
fi

# --------------------------------------------------------------------------
# Secret values: from .env, straight into memory, only the declared names
# --------------------------------------------------------------------------
DECLARED_CSV="$(printf '%s' "$DECLARED_RAW" | tr -d '[:space:]')"
ENV_SHARED='{}'
if [[ -n "$DECLARED_CSV" ]]; then
  ENV_FILE="$APP_DIR/.env"
  [[ -f "$ENV_FILE" ]] \
    || fail "$EXIT_LOCAL" "The app declares secrets but its private settings file is missing, so nothing was sent. Each declared secret needs its value in place first."

  read -r -d '' JQ_ENV <<'JQ' || true
($keys | split(",")) as $want
| [inputs]
| map(select(test("^[A-Za-z_][A-Za-z0-9_]*=")))
| map(capture("^(?<k>[A-Za-z_][A-Za-z0-9_]*)=(?<v>.*)$"))
| map(select(.k as $k | $want | index($k) != null))
| map(.v |= (if (length >= 2 and startswith("\"") and endswith("\"")) then .[1:-1]
             elif (length >= 2 and startswith("'") and endswith("'")) then .[1:-1]
             else . end))
| map({(.k): .v})
| add // {}
JQ
  ENV_SHARED="$(jq -cRn --arg keys "$DECLARED_CSV" "$JQ_ENV" < "$ENV_FILE")" \
    || fail "$EXIT_LOCAL" "The app's private settings file could not be read, so nothing was sent."

  MISSING="$(printf '%s' "$ENV_SHARED" \
    | jq -r --arg keys "$DECLARED_CSV" '(($keys | split(",")) - keys_unsorted) | join(", ")')"
  [[ -z "$MISSING" ]] \
    || fail "$EXIT_LOCAL" "These declared secrets have no value in the app's private settings file yet: ${MISSING}. Nothing was sent - the app would break the moment someone opened it."
  EMPTY="$(printf '%s' "$ENV_SHARED" \
    | jq -r '[to_entries[] | select(.value == "") | .key] | join(", ")')"
  [[ -z "$EMPTY" ]] \
    || fail "$EXIT_LOCAL" "These declared secrets have an empty value in the app's private settings file: ${EMPTY}. Nothing was sent - they need real values first."
fi

# --------------------------------------------------------------------------
# The file tree: same exclusions as the sign-off digest, every time
# --------------------------------------------------------------------------
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
FILES_NDJSON="$WORK_DIR/files.ndjson"
: > "$FILES_NDJSON"

# A file is sent base64-encoded when it is not clean UTF-8 text: either it
# contains NUL bytes or it does not decode as UTF-8. Everything else - code,
# Hebrew text included - travels as utf-8.
is_binary() {
  [[ -s "$1" ]] || return 1
  if ! LC_ALL=C tr -d '\0' < "$1" | cmp -s - "$1"; then
    return 0
  fi
  ! iconv -f UTF-8 -t UTF-8 < "$1" > /dev/null 2>&1
}

file_count=0
total_bytes=0
while IFS= read -r -d '' path; do
  rel="${path#"$APP_DIR"/}"
  size="$(wc -c < "$path" | tr -d '[:space:]')"
  file_count=$((file_count + 1))
  total_bytes=$((total_bytes + size))
  if is_binary "$path"; then
    base64 < "$path" | tr -d '\n' \
      | jq -cRs --arg p "$rel" '{path: $p, encoding: "base64", content: .}' >> "$FILES_NDJSON"
  else
    jq -cn --arg p "$rel" --rawfile c "$path" \
      '{path: $p, encoding: "utf-8", content: $c}' >> "$FILES_NDJSON"
  fi
done < <(
  prune_expr=()
  for d in "${EXCLUDE_DIRS[@]}"; do prune_expr+=(-name "$d" -o); done
  prune_expr=("${prune_expr[@]:0:$((${#prune_expr[@]} - 1))}")
  file_expr=()
  for p in "${EXCLUDE_FILES[@]}"; do file_expr+=(! -name "$p"); done
  find "$APP_DIR" \
    \( -type d \( "${prune_expr[@]}" \) -prune \) \
    -o \( -type f "${file_expr[@]}" -print0 \)
)

(( file_count > 0 )) \
  || fail "$EXIT_LOCAL" "The app folder has no files to send after the standard exclusions, so nothing was sent."
(( file_count <= MAX_FILES )) \
  || fail "$EXIT_REFUSED" "The app is made up of far more files than a new app normally has (${file_count}), which usually means a folder of downloaded or generated files got swept in. Nothing was sent - find what was swept in and leave it out."
(( total_bytes <= MAX_BYTES )) \
  || fail "$EXIT_REFUSED" "The app is carrying more than can be sent in one go - usually that means large files like videos or images got included. Nothing was sent - leave out what the app does not need."

# --------------------------------------------------------------------------
# The sign-off record
# --------------------------------------------------------------------------
SIGNOFF_JSON="null"
if [[ -n "$SIGNOFF_FILE" ]]; then
  [[ -f "$SIGNOFF_FILE" ]] \
    || fail "$EXIT_LOCAL" "The sign-off file was not found, so nothing was sent."
  SIGNOFF_FILE="$(cd "$(dirname "$SIGNOFF_FILE")" && pwd)/$(basename "$SIGNOFF_FILE")"
  case "$SIGNOFF_FILE" in
    "$APP_DIR"/*)
      fail "$EXIT_LOCAL" "The sign-off file sits inside the app folder, where it would change the very tree it signs. Move it outside the app folder and run the send again." ;;
  esac
  SIGNOFF_JSON="$(jq -c . "$SIGNOFF_FILE")" \
    || fail "$EXIT_LOCAL" "The sign-off file is not valid JSON, so nothing was sent."
fi

# --------------------------------------------------------------------------
# Assemble the request body, in memory
# --------------------------------------------------------------------------
read -r -d '' JQ_PAYLOAD <<'JQ' || true
. as $env
| {
    appName: $appName,
    description: ($description | .[0:500]),
    costRoi: ($costRoi | .[0:1000]),
    targetAudience: ($targetAudience | .[0:1000]),
    informationType: ($informationType | .[0:500]),
    externalAppSharing: false,
    tags: ($tags | split(",")
                 | map(gsub("^\\s+"; "") | gsub("\\s+$"; ""))
                 | map(select(length > 0)) | .[0:20]),
    deployRequest: $deployRequest,
    files: $files
  }
+ (if $env == {} then {} else { env: { shared: $env } } end)
+ (if $signoff == null then {} else { signoff: $signoff } end)
JQ

PAYLOAD="$(printf '%s' "$ENV_SHARED" | jq -c \
  --arg appName "$APP_NAME" \
  --arg description "$DESCRIPTION" \
  --arg costRoi "$PURPOSE" \
  --arg targetAudience "$TARGET_AUDIENCE" \
  --arg informationType "$INFORMATION_TYPE" \
  --arg tags "$TAGS" \
  --rawfile deployRequest "$REQ_FILE" \
  --slurpfile files "$FILES_NDJSON" \
  --argjson signoff "$SIGNOFF_JSON" \
  "$JQ_PAYLOAD")" \
  || fail "$EXIT_LOCAL" "The request could not be assembled, so nothing was sent."

# --------------------------------------------------------------------------
# Reach the service
# --------------------------------------------------------------------------
say "Checking that Keshet's deployment service is reachable..."
curl -sS --max-time 10 -o /dev/null "$BASE_URL/api/monitor/check" 2>/dev/null \
  || fail "$EXIT_UNREACHABLE" "Keshet's deployment service can't be reached from this network. Connecting to the Keshet network (VPN or office) and sending again usually fixes this. Nothing was sent and nothing is lost."

# --------------------------------------------------------------------------
# Sign the builder in (device sign-in via the service's own endpoints)
# --------------------------------------------------------------------------
say "Keshet needs the builder to sign in before the app can be sent."
START="$(curl -sS --max-time 30 -X POST "$BASE_URL/api/apps/auth/device-code")" \
  || fail "$EXIT_UNREACHABLE" "The connection to Keshet dropped while starting the sign-in. It is safe to run the send again."
DEVICE_CODE="$(jq -r '.deviceCode // empty' <<<"$START" 2>/dev/null || true)"
[[ -n "$DEVICE_CODE" ]] \
  || fail "$EXIT_SIGNIN" "The sign-in could not start on the Keshet side. This is not something the builder did - it needs the platform team. It is safe to try again later."
USER_CODE="$(jq -r '.userCode' <<<"$START")"
VERIFICATION_URI="$(jq -r '.verificationUri' <<<"$START")"
INTERVAL="$(jq -r '.interval // 5' <<<"$START")"
EXPIRES_IN="$(jq -r '.expiresIn // 900' <<<"$START")"

say ""
say "To sign in, open this address in a browser:  ${VERIFICATION_URI}"
say "and enter this code:  ${USER_CODE}"
say "It is the same Keshet account used for everything else. Approve the Authenticator prompt if one appears."
say "Waiting for the sign-in to finish..."

TOKEN=""
BUILDER_NAME="the builder"
deadline=$(( $(date +%s) + EXPIRES_IN ))
while (( $(date +%s) < deadline )); do
  sleep "$INTERVAL"
  POLL="$(printf '%s' "$DEVICE_CODE" | jq -cRs '{deviceCode: .}' \
    | curl -sS --max-time 30 -X POST -H 'Content-Type: application/json' \
        --data-binary @- "$BASE_URL/api/apps/auth/device-token")" || continue
  STATUS="$(jq -r '.status // empty' <<<"$POLL" 2>/dev/null || true)"
  if [[ "$STATUS" == "authenticated" ]]; then
    TOKEN="$(jq -r '.accessToken' <<<"$POLL")"
    BUILDER_NAME="$(jq -r '.displayName // .username // "the builder"' <<<"$POLL")"
    break
  fi
  [[ "$STATUS" == "pending" ]] && continue
  ERR_CODE="$(jq -r '.code // empty' <<<"$POLL" 2>/dev/null || true)"
  [[ -z "$ERR_CODE" ]] \
    || fail "$EXIT_SIGNIN" "The sign-in did not complete. Nothing is lost - run the send again for a fresh code."
done
[[ -n "$TOKEN" ]] \
  || fail "$EXIT_SIGNIN" "The sign-in code expired before it was used. Nothing is lost - run the send again for a fresh code."
say "Signed in as ${BUILDER_NAME}."

# Authenticated call helper. The token travels in a curl config read through
# a file descriptor, so it never appears in a process listing or on disk.
api() {
  # $1 method, $2 path, $3 body (empty for none), $4 timeout seconds
  local method="$1" path="$2" body="${3:-}" timeout="${4:-60}"
  local args=(-sS --max-time "$timeout" -X "$method"
              -H 'Content-Type: application/json' -w $'\n%{http_code}')
  if [[ -n "$body" ]]; then
    printf '%s' "$body" | curl "${args[@]}" --data-binary @- \
      -K <(printf 'header = "Authorization: Bearer %s"\n' "$TOKEN") \
      "${BASE_URL}${path}"
  else
    curl "${args[@]}" \
      -K <(printf 'header = "Authorization: Bearer %s"\n' "$TOKEN") \
      "${BASE_URL}${path}"
  fi
}

# --------------------------------------------------------------------------
# Turning answers into plain language
# --------------------------------------------------------------------------
step_label() {
  case "$1" in
    validate_name)              say "checking the app's name" ;;
    create_repo_from_template)  say "setting up the app's home at Keshet" ;;
    apply_branch_policies)      say "protecting the app's home" ;;
    push_deploy_initial)        say "storing the app's files" ;;
    create_per_app_vault)       say "setting up the app's private settings store" ;;
    sync_env_secrets)           say "storing the app's secret settings" ;;
    raise_itcc)                 say "asking IT to review the app" ;;
    *)                          say "processing the request" ;;
  esac
}

refuse_step() {
  local step="$1" msg="$2" run_id="$3"
  if [[ "$step" == "validate_name" ]]; then
    case "$msg" in
      *soft-deleted*)
        fail "$EXIT_REFUSED" "An app with this name existed before and was removed, and Keshet keeps its stored settings for a short while, so the name isn't free yet. Pick a different name with the builder, or ask the platform team to release this one. Nothing was created." ;;
      *"not available"*|*"already exists"*|*taken*)
        fail "$EXIT_REFUSED" "There's already an app called that at Keshet. Pick a different name with the builder and send again - nothing was created, so there is nothing to undo." ;;
      *)
        fail "$EXIT_REFUSED" "Keshet did not accept the app's name${msg:+: $msg}. Pick a new name with the builder and send again - nothing was created." ;;
    esac
  fi
  fail "$EXIT_REFUSED" "Something on the Keshet side did not finish while $(step_label "$step"). This is not something the builder did, and it is safe to send again in a few minutes. Reference for the platform team: run ${run_id:-unknown}."
}

refuse_http() {
  local http="$1" body="$2" code msg
  code="$(jq -r '.code // empty' <<<"$body" 2>/dev/null || true)"
  msg="$(jq -r 'if (.message | type) == "array" then (.message | join("; "))
                else (.message // empty) end' <<<"$body" 2>/dev/null || true)"
  case "$http" in
    401) fail "$EXIT_SIGNIN" "Keshet no longer accepts the sign-in - it has likely expired. Run the send again and sign in when the code appears. Nothing is lost." ;;
    403) fail "$EXIT_REFUSED" "This account isn't approved to send apps to Keshet yet. Someone from the platform team needs to add it - there is nothing the builder needs to do." ;;
    429) fail "$EXIT_REFUSED" "Keshet asked us to slow down because many requests arrived in a short time. Wait a few minutes and send again - nothing is lost." ;;
    5*)  fail "$EXIT_UNREACHABLE" "Something on the Keshet side isn't responding right now. This is not something the builder did. It is safe to send again in a few minutes." ;;
  esac
  case "$code" in
    REQUESTER_REQUIRED)
      fail "$EXIT_SIGNIN" "The sign-in Keshet received wasn't a personal one, so it can't record who owns the app. Run the send again and sign in when the code appears." ;;
    NAME_INVALID)
      fail "$EXIT_REFUSED" "Keshet did not accept the app's name${msg:+: $msg}. Pick a new name with the builder and send again - nothing was created." ;;
    NAME_TAKEN|DOMAIN_ALREADY_EXISTS)
      fail "$EXIT_REFUSED" "There's already an app called that at Keshet. Pick a different name with the builder and send again - nothing was created, so there is nothing to undo." ;;
    VAULT_NAME_SOFT_DELETED)
      fail "$EXIT_REFUSED" "An app with this name existed before and was removed, and Keshet keeps its stored settings for a short while, so the name isn't free yet. Pick a different name, or ask the platform team to release this one." ;;
  esac
  fail "$EXIT_REFUSED" "Keshet did not accept the request${msg:+: $msg}. If that doesn't say what to change, it is one for the platform team - the builder did nothing wrong."
}

accepted() {
  say "Accepted. The app is with Keshet now: it runs the automatic security checks, and someone from IT reviews what the app does and who can use it before it goes live. There is nothing more for the builder to do."
  if [[ -n "${ITCC_ID:-}" ]]; then
    say "ITCC case: ${ITCC_ID}"
  fi
  exit 0
}

# The IT review case the run raised, when the answer carries one. Printed at
# the end of a send so the builder and the approver look at the same case.
ITCC_ID=""
note_itcc() {
  local id
  id="$(jq -r '.itccId // empty' <<<"$1" 2>/dev/null || true)"
  if [[ -n "$id" && "$id" != "null" ]]; then
    ITCC_ID="$id"
  fi
  return 0
}

# --------------------------------------------------------------------------
# Send, then follow the run until Keshet has an answer
# --------------------------------------------------------------------------
say "Sending the app to Keshet now. This can take a few minutes..."
RAW="$(api POST "/api/apps" "$PAYLOAD" 900)" \
  || fail "$EXIT_UNREACHABLE" "The connection to Keshet dropped while sending. It is safe to run the send again - the identical app sent twice is recognised as the same request."
HTTP="${RAW##*$'\n'}"
BODY="${RAW%$'\n'*}"
[[ "$HTTP" == 2* ]] || refuse_http "$HTTP" "$BODY"

RUN_STATUS="$(jq -r '.status // empty' <<<"$BODY" 2>/dev/null || true)"
RUN_ID="$(jq -r '.runId // empty' <<<"$BODY" 2>/dev/null || true)"
SENT_APP="$(jq -r '.appName // empty' <<<"$BODY" 2>/dev/null || true)"
FAILED_STEP="$(jq -r '.failedStep // empty' <<<"$BODY" 2>/dev/null || true)"
LAST_ERR="$(jq -r '.lastErrorMessage // empty' <<<"$BODY" 2>/dev/null || true)"
note_itcc "$BODY"

case "$RUN_STATUS" in
  pending_approval|approving|completed) accepted ;;
  failed) refuse_step "$FAILED_STEP" "$LAST_ERR" "$RUN_ID" ;;
  running) : ;;
  *) fail "$EXIT_REFUSED" "Keshet's answer did not say whether the app was accepted. It is safe to send again in a few minutes. Reference for the platform team: run ${RUN_ID:-unknown}." ;;
esac

say "Keshet accepted the request and is working on it..."
last_step=""
for _ in $(seq 1 "$POLL_COUNT"); do
  sleep "$POLL_INTERVAL"
  RAW="$(api GET "/api/apps/${SENT_APP}/runs/${RUN_ID}" "" 60)" || continue
  HTTP="${RAW##*$'\n'}"
  BODY="${RAW%$'\n'*}"
  [[ "$HTTP" == 2* ]] || refuse_http "$HTTP" "$BODY"
  RUN_STATUS="$(jq -r '.status // empty' <<<"$BODY" 2>/dev/null || true)"
  note_itcc "$BODY"
  step="$(jq -r '[.steps[]? | select(.status == "started")] | last | .name // empty' <<<"$BODY" 2>/dev/null || true)"
  if [[ -n "$step" && "$step" != "$last_step" ]]; then
    say "Keshet is $(step_label "$step")..."
    last_step="$step"
  fi
  case "$RUN_STATUS" in
    pending_approval|approving|completed) accepted ;;
    failed)
      FAILED_STEP="$(jq -r '.failedStep // empty' <<<"$BODY" 2>/dev/null || true)"
      LAST_ERR="$(jq -r '.lastErrorMessage // empty' <<<"$BODY" 2>/dev/null || true)"
      refuse_step "$FAILED_STEP" "$LAST_ERR" "$RUN_ID" ;;
    rejected|abandoned)
      fail "$EXIT_REFUSED" "Keshet closed this request without taking the app. It is safe to send again. Reference for the platform team: run ${RUN_ID}." ;;
  esac
done

fail "$EXIT_UNREACHABLE" "Keshet is still working on the request and has not given a final answer yet. Nothing is wrong - run the send again in a few minutes; the identical app sent twice is recognised as the same request."
