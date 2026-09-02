# ===========================================================================
# send-deploy.ps1 - send a builder's app to the Keshet deployment service.
#
# The Windows twin of send-deploy.sh: same behaviour, same messages, and
# above all the SAME EXIT CODES, because the verifier acts on the exit code
# and nothing else. The two read the same deploy-config.json, and
# scripts/validate-parity.sh fails the build if they drift.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File send-deploy.ps1 [--signoff FILE] [APP_DIR]
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
# The sign-in token lives in a variable and travels only as an in-memory
# Authorization header - it is never placed in a command line, so it never
# appears in a process listing.
# ===========================================================================
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$EXIT_LOCAL = 1
$EXIT_REFUSED = 2
$EXIT_UNREACHABLE = 3
$EXIT_SIGNIN = 4

function Say([string]$msg) { [Console]::Out.WriteLine($msg) }
function Fail([int]$rc, [string]$msg) { Say $msg; exit $rc }

# --------------------------------------------------------------------------
# Shared configuration - deploy-config.json next to this script
#
# The same file feeds send-deploy.sh, so the two implementations agree on
# the service address, the tree ceilings, the polling cadence, and the
# exclusion list. NOTHING SECRET lives in it. Environment variables still
# override, and built-in defaults cover a missing or unreadable file.
# --------------------------------------------------------------------------
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigFile = Join-Path $ScriptDir 'deploy-config.json'
$Config = $null
if (Test-Path -LiteralPath $ConfigFile) {
  try { $Config = Get-Content -Raw -LiteralPath $ConfigFile | ConvertFrom-Json } catch { $Config = $null }
}

function Get-ConfigValue([string[]]$path, $default) {
  $node = $script:Config
  foreach ($key in $path) {
    if ($null -eq $node) { return $default }
    $prop = $node.PSObject.Properties[$key]
    if ($null -eq $prop) { return $default }
    $node = $prop.Value
  }
  if ($null -eq $node -or ([string]"$node") -eq '') { return $default }
  return $node
}

# The single switch point for which service instance receives the app. Set
# KST_AUTH_API_BASE_URL to the production instance to send there; nothing
# else in this script knows which instance it is talking to.
$BaseUrl = if ($env:KST_AUTH_API_BASE_URL) { $env:KST_AUTH_API_BASE_URL }
           else { [string](Get-ConfigValue @('apiBaseUrl') 'https://api-auth-stage.keshet-tv.com') }

# Bounds the service enforces on the sent tree, checked here first so the
# builder hears about a problem before a long upload rather than after one.
$MaxFiles = if ($env:KST_DEPLOY_MAX_FILES) { [int]$env:KST_DEPLOY_MAX_FILES }
            else { [int](Get-ConfigValue @('limits', 'maxFiles') 2000) }
$MaxBytes = if ($env:KST_DEPLOY_MAX_BYTES) { [long]$env:KST_DEPLOY_MAX_BYTES }
            else { [long](Get-ConfigValue @('limits', 'maxBytes') (10 * 1024 * 1024)) }

# How long the script follows a deployment run before giving up.
$PollCount = if ($env:KST_DEPLOY_POLL_COUNT) { [int]$env:KST_DEPLOY_POLL_COUNT }
             else { [int](Get-ConfigValue @('polling', 'count') 60) }
$PollInterval = if ($env:KST_DEPLOY_POLL_INTERVAL) { [int]$env:KST_DEPLOY_POLL_INTERVAL }
                else { [int](Get-ConfigValue @('polling', 'intervalSeconds') 5) }

# The exclusion list - the same list the sign-off digest uses.
$ExcludeDirs = @(Get-ConfigValue @('exclusions', 'directories') @())
if ($ExcludeDirs.Count -eq 0) { $ExcludeDirs = @('node_modules', '.git', '.next', 'dist', 'build') }
$ExcludeFiles = @(Get-ConfigValue @('exclusions', 'files') @())
if ($ExcludeFiles.Count -eq 0) { $ExcludeFiles = @('.env', '.env.*') }

# --------------------------------------------------------------------------
# Arguments and preconditions
# --------------------------------------------------------------------------
$AppDir = (Get-Location).Path
$SignoffFile = ''
$argv = @($args)
$i = 0
while ($i -lt $argv.Count) {
  $a = [string]$argv[$i]
  if ($a -eq '--signoff') {
    if ($i + 1 -ge $argv.Count) { Fail $EXIT_LOCAL '--signoff needs a file path after it.' }
    $SignoffFile = [string]$argv[$i + 1]
    $i += 2
  }
  elseif ($a -like '--*') {
    Fail $EXIT_LOCAL "Unknown option: $a. Usage: send-deploy.ps1 [--signoff FILE] [APP_DIR]"
  }
  else {
    $AppDir = $a
    $i += 1
  }
}

if (-not (Test-Path -LiteralPath $AppDir -PathType Container)) {
  Fail $EXIT_LOCAL 'The app folder was not found, so nothing was sent.'
}
$AppDir = (Resolve-Path -LiteralPath $AppDir).Path.TrimEnd([char[]]@('\', '/'))
$ReqFile = Join-Path $AppDir 'DEPLOY_REQUEST.md'
if (-not (Test-Path -LiteralPath $ReqFile -PathType Leaf)) {
  Fail $EXIT_LOCAL 'The deployment request file is missing from the app folder, so nothing was sent. The deployment details need collecting before the app can go to Keshet.'
}

# --------------------------------------------------------------------------
# Read the deployment request
# --------------------------------------------------------------------------
$ReqLines = @(Get-Content -LiteralPath $ReqFile -Encoding UTF8)

function Get-ReqField([string]$name) {
  foreach ($line in $script:ReqLines) {
    if ($line -match ('^' + [regex]::Escape($name) + ':')) {
      $idx = $line.IndexOf(':')
      return $line.Substring($idx + 1).Trim()
    }
  }
  return ''
}

function Assert-ReqField([string]$name, [string]$value) {
  if ($value -eq '' -or $value -like '*CHANGE-ME*') {
    Fail $EXIT_LOCAL "The deployment details are missing '$name', so nothing was sent. That answer needs filling in before the app can go to Keshet."
  }
}

$AppName = Get-ReqField 'app-name'
$Purpose = Get-ReqField 'purpose'
$Description = Get-ReqField 'description'
$Tags = Get-ReqField 'tags'
$DataSources = Get-ReqField 'data-sources'
$AudienceType = Get-ReqField 'audience-type'
$AudienceMembers = Get-ReqField 'audience-members'
$DeclaredRaw = Get-ReqField 'declared-secrets'

Assert-ReqField 'app-name' $AppName
Assert-ReqField 'purpose' $Purpose
Assert-ReqField 'description' $Description
Assert-ReqField 'tags' $Tags
Assert-ReqField 'data-sources' $DataSources
Assert-ReqField 'audience-type' $AudienceType
Assert-ReqField 'audience-members' $AudienceMembers

# The IT review form asks for the audience and the kind of information the
# app handles; both are answered from the request file, in words a reviewer
# can judge. Apps on this platform are only ever opened by the named Keshet
# audience, so external sharing is always "no".
switch ($AudienceType) {
  'individuals'  { $TargetAudience = "Named people: $AudienceMembers" }
  'entra-groups' { $TargetAudience = "Team groups: $AudienceMembers" }
  default        { $TargetAudience = "${AudienceType}: $AudienceMembers" }
}
if ($DataSources -eq 'none') {
  $InformationType = 'Internal Keshet data. The app reaches no external data sources.'
}
else {
  $InformationType = "Internal Keshet data. Data sources: $DataSources"
}

# --------------------------------------------------------------------------
# Secret values: from .env, straight into memory, only the declared names
# --------------------------------------------------------------------------
$DeclaredCsv = ($DeclaredRaw -replace '\s', '')
$EnvShared = [ordered]@{}
if ($DeclaredCsv -ne '') {
  $EnvFile = Join-Path $AppDir '.env'
  if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
    Fail $EXIT_LOCAL 'The app declares secrets but its private settings file is missing, so nothing was sent. Each declared secret needs its value in place first.'
  }
  $want = @($DeclaredCsv -split ',' | Where-Object { $_ -ne '' })
  $envLines = @()
  try { $envLines = @(Get-Content -LiteralPath $EnvFile -Encoding UTF8) }
  catch { Fail $EXIT_LOCAL "The app's private settings file could not be read, so nothing was sent." }
  foreach ($line in $envLines) {
    if ($line -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
      $k = $Matches[1]
      $v = $Matches[2]
      if ($want -ccontains $k) {
        if ($v.Length -ge 2 -and (
            ($v.StartsWith('"') -and $v.EndsWith('"')) -or
            ($v.StartsWith("'") -and $v.EndsWith("'")))) {
          $v = $v.Substring(1, $v.Length - 2)
        }
        $EnvShared[$k] = $v
      }
    }
  }
  $missing = @($want | Where-Object { -not $EnvShared.Contains($_) })
  if ($missing.Count -gt 0) {
    Fail $EXIT_LOCAL "These declared secrets have no value in the app's private settings file yet: $($missing -join ', '). Nothing was sent - the app would break the moment someone opened it."
  }
  $empty = @($EnvShared.Keys | Where-Object { $EnvShared[$_] -eq '' })
  if ($empty.Count -gt 0) {
    Fail $EXIT_LOCAL "These declared secrets have an empty value in the app's private settings file: $($empty -join ', '). Nothing was sent - they need real values first."
  }
}

# --------------------------------------------------------------------------
# The file tree: same exclusions as the sign-off digest, every time
# --------------------------------------------------------------------------

# A file is sent base64-encoded when it is not clean UTF-8 text: either it
# contains NUL bytes or it does not decode as UTF-8. Everything else - code,
# Hebrew text included - travels as utf-8.
$StrictUtf8 = New-Object System.Text.UTF8Encoding($false, $true)
function Test-IsBinary([byte[]]$bytes) {
  if ($bytes.Length -eq 0) { return $false }
  if ([System.Array]::IndexOf($bytes, [byte]0) -ge 0) { return $true }
  try { [void]$script:StrictUtf8.GetString($bytes); return $false } catch { return $true }
}

$FileEntries = New-Object System.Collections.Generic.List[object]
$fileCount = 0
$totalBytes = [long]0

$stack = New-Object System.Collections.Generic.Stack[string]
$stack.Push($AppDir)
while ($stack.Count -gt 0) {
  $dir = $stack.Pop()
  foreach ($entry in [System.IO.Directory]::GetFileSystemEntries($dir)) {
    $name = [System.IO.Path]::GetFileName($entry)
    if ([System.IO.Directory]::Exists($entry)) {
      if ($ExcludeDirs -notcontains $name) { $stack.Push($entry) }
      continue
    }
    $skip = $false
    foreach ($pat in $ExcludeFiles) {
      if ($name -like $pat) { $skip = $true; break }
    }
    if ($skip) { continue }

    $bytes = [System.IO.File]::ReadAllBytes($entry)
    $rel = $entry.Substring($AppDir.Length + 1) -replace '\\', '/'
    $fileCount += 1
    $totalBytes += [long]$bytes.Length
    if (Test-IsBinary $bytes) {
      $FileEntries.Add([ordered]@{
        path = $rel; encoding = 'base64'; content = [Convert]::ToBase64String($bytes)
      })
    }
    else {
      $FileEntries.Add([ordered]@{
        path = $rel; encoding = 'utf-8'; content = [System.Text.Encoding]::UTF8.GetString($bytes)
      })
    }
  }
}

if ($fileCount -le 0) {
  Fail $EXIT_LOCAL 'The app folder has no files to send after the standard exclusions, so nothing was sent.'
}
if ($fileCount -gt $MaxFiles) {
  Fail $EXIT_REFUSED "The app is made up of far more files than a new app normally has ($fileCount), which usually means a folder of downloaded or generated files got swept in. Nothing was sent - find what was swept in and leave it out."
}
if ($totalBytes -gt $MaxBytes) {
  Fail $EXIT_REFUSED 'The app is carrying more than can be sent in one go - usually that means large files like videos or images got included. Nothing was sent - leave out what the app does not need.'
}

# --------------------------------------------------------------------------
# The sign-off record
# --------------------------------------------------------------------------
$SignoffObj = $null
if ($SignoffFile -ne '') {
  if (-not (Test-Path -LiteralPath $SignoffFile -PathType Leaf)) {
    Fail $EXIT_LOCAL 'The sign-off file was not found, so nothing was sent.'
  }
  $SignoffFile = (Resolve-Path -LiteralPath $SignoffFile).Path
  $cmp = if ($env:OS -eq 'Windows_NT') { [System.StringComparison]::OrdinalIgnoreCase }
         else { [System.StringComparison]::Ordinal }
  $sepChar = [string][System.IO.Path]::DirectorySeparatorChar
  if ($SignoffFile.StartsWith($AppDir + $sepChar, $cmp) -or $SignoffFile.StartsWith($AppDir + '/', $cmp)) {
    Fail $EXIT_LOCAL 'The sign-off file sits inside the app folder, where it would change the very tree it signs. Move it outside the app folder and run the send again.'
  }
  try { $SignoffObj = Get-Content -Raw -LiteralPath $SignoffFile | ConvertFrom-Json }
  catch { Fail $EXIT_LOCAL 'The sign-off file is not valid JSON, so nothing was sent.' }
  if ($null -eq $SignoffObj) {
    Fail $EXIT_LOCAL 'The sign-off file is not valid JSON, so nothing was sent.'
  }
}

# --------------------------------------------------------------------------
# Assemble the request body, in memory
# --------------------------------------------------------------------------
function Limit-Text([string]$s, [int]$n) {
  if ($s.Length -gt $n) { return $s.Substring(0, $n) }
  return $s
}

$tagList = @($Tags -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_.Length -gt 0 } | Select-Object -First 20)

$Payload = [ordered]@{
  appName            = $AppName
  description        = Limit-Text $Description 500
  costRoi            = Limit-Text $Purpose 1000
  targetAudience     = Limit-Text $TargetAudience 1000
  informationType    = Limit-Text $InformationType 500
  externalAppSharing = $false
  tags               = $tagList
  deployRequest      = (Get-Content -Raw -LiteralPath $ReqFile -Encoding UTF8)
  files              = $FileEntries.ToArray()
}
if ($EnvShared.Count -gt 0) { $Payload['env'] = @{ shared = $EnvShared } }
if ($null -ne $SignoffObj) { $Payload['signoff'] = $SignoffObj }

try { $PayloadJson = $Payload | ConvertTo-Json -Depth 64 -Compress }
catch { Fail $EXIT_LOCAL 'The request could not be assembled, so nothing was sent.' }

# --------------------------------------------------------------------------
# Talking to the service
#
# Invoke-Api returns @{ Status = <int http code, 0 when the service was not
# reached at all>; Body = <string> }. HTTP errors are answers, not
# exceptions, to match what curl reports to send-deploy.sh. The token, when
# present, travels only as an in-memory header - never on a command line.
# --------------------------------------------------------------------------
function Invoke-Api {
  param(
    [string]$Method,
    [string]$Path,
    [string]$Body = '',
    [int]$TimeoutSec = 60,
    [hashtable]$Headers = $null
  )
  $params = @{
    Method          = $Method
    Uri             = ($script:BaseUrl + $Path)
    TimeoutSec      = $TimeoutSec
    UseBasicParsing = $true
  }
  if ($null -ne $Headers -and $Headers.Count -gt 0) { $params['Headers'] = $Headers }
  if ($Body -ne '') {
    $params['Body'] = [System.Text.Encoding]::UTF8.GetBytes($Body)
    $params['ContentType'] = 'application/json'
  }
  try {
    $resp = Invoke-WebRequest @params
    return @{ Status = [int]$resp.StatusCode; Body = [string]$resp.Content }
  }
  catch {
    $status = 0
    $body = ''
    $respObj = $null
    try { $respObj = $_.Exception.Response } catch { $respObj = $null }
    if ($null -ne $respObj) {
      try { $status = [int]$respObj.StatusCode } catch { $status = 0 }
      if ($null -ne $_.ErrorDetails -and $_.ErrorDetails.Message) {
        $body = [string]$_.ErrorDetails.Message
      }
      elseif ($respObj -is [System.Net.HttpWebResponse]) {
        try {
          $reader = New-Object System.IO.StreamReader($respObj.GetResponseStream())
          $body = $reader.ReadToEnd()
        }
        catch { $body = '' }
      }
    }
    return @{ Status = $status; Body = $body }
  }
}

function ConvertFrom-JsonSafe([string]$text) {
  if ($null -eq $text -or $text -eq '') { return $null }
  try { return ($text | ConvertFrom-Json) } catch { return $null }
}

function Get-JsonField($obj, [string]$name) {
  if ($null -eq $obj) { return '' }
  $prop = $null
  try { $prop = $obj.PSObject.Properties[$name] } catch { return '' }
  if ($null -eq $prop -or $null -eq $prop.Value) { return '' }
  return [string]$prop.Value
}

# --------------------------------------------------------------------------
# Reach the service
# --------------------------------------------------------------------------
Say "Checking that Keshet's deployment service is reachable..."
$r = Invoke-Api -Method GET -Path '/api/monitor/check' -TimeoutSec 10
if ($r.Status -eq 0) {
  Fail $EXIT_UNREACHABLE "Keshet's deployment service can't be reached from this network. Connecting to the Keshet network (VPN or office) and sending again usually fixes this. Nothing was sent and nothing is lost."
}

# --------------------------------------------------------------------------
# Sign the builder in (device sign-in via the service's own endpoints)
# --------------------------------------------------------------------------
Say 'Keshet needs the builder to sign in before the app can be sent.'
# IIS (http.sys) rejects body-less POSTs with HTTP 411, so send an empty
# JSON body even though the endpoint takes no input (parity with send-deploy.sh).
$r = Invoke-Api -Method POST -Path '/api/apps/auth/device-code' -Body '{}' -TimeoutSec 30
if ($r.Status -eq 0) {
  Fail $EXIT_UNREACHABLE 'The connection to Keshet dropped while starting the sign-in. It is safe to run the send again.'
}
$start = ConvertFrom-JsonSafe $r.Body
$DeviceCode = Get-JsonField $start 'deviceCode'
if ($DeviceCode -eq '') {
  Fail $EXIT_SIGNIN 'The sign-in could not start on the Keshet side. This is not something the builder did - it needs the platform team. It is safe to try again later.'
}
$UserCode = Get-JsonField $start 'userCode'
$VerificationUri = Get-JsonField $start 'verificationUri'
$Interval = 5
$iv = Get-JsonField $start 'interval'
if ($iv -ne '') { $Interval = [int]$iv }
$ExpiresIn = 900
$ei = Get-JsonField $start 'expiresIn'
if ($ei -ne '') { $ExpiresIn = [int]$ei }

Say ''
Say "To sign in, open this address in a browser:  $VerificationUri"
Say "and enter this code:  $UserCode"
Say 'It is the same Keshet account used for everything else. Approve the Authenticator prompt if one appears.'
Say 'Waiting for the sign-in to finish...'

$Token = ''
$BuilderName = 'the builder'
$deadline = [DateTimeOffset]::UtcNow.AddSeconds($ExpiresIn)
while ([DateTimeOffset]::UtcNow -lt $deadline) {
  Start-Sleep -Seconds $Interval
  $pollBody = @{ deviceCode = $DeviceCode } | ConvertTo-Json -Compress
  $r = Invoke-Api -Method POST -Path '/api/apps/auth/device-token' -Body $pollBody -TimeoutSec 30
  if ($r.Status -eq 0) { continue }
  $poll = ConvertFrom-JsonSafe $r.Body
  $status = Get-JsonField $poll 'status'
  if ($status -eq 'authenticated') {
    $Token = Get-JsonField $poll 'accessToken'
    $BuilderName = Get-JsonField $poll 'displayName'
    if ($BuilderName -eq '') { $BuilderName = Get-JsonField $poll 'username' }
    if ($BuilderName -eq '') { $BuilderName = 'the builder' }
    break
  }
  if ($status -eq 'pending') { continue }
  $errCode = Get-JsonField $poll 'code'
  if ($errCode -ne '') {
    Fail $EXIT_SIGNIN 'The sign-in did not complete. Nothing is lost - run the send again for a fresh code.'
  }
}
if ($Token -eq '') {
  Fail $EXIT_SIGNIN 'The sign-in code expired before it was used. Nothing is lost - run the send again for a fresh code.'
}
Say "Signed in as $BuilderName."

# The bearer token lives in this in-memory table and nowhere else: it is
# handed to Invoke-WebRequest as a header, so it never appears on a command
# line, in a process listing, or on disk.
$AuthHeaders = @{ Authorization = "Bearer $Token" }

# --------------------------------------------------------------------------
# Turning answers into plain language
# --------------------------------------------------------------------------
function Get-StepLabel([string]$step) {
  switch ($step) {
    'validate_name'             { return "checking the app's name" }
    'create_repo_from_template' { return "setting up the app's home at Keshet" }
    'apply_branch_policies'     { return "protecting the app's home" }
    'push_deploy_initial'       { return "storing the app's files" }
    'create_per_app_vault'      { return "setting up the app's private settings store" }
    'sync_env_secrets'          { return "storing the app's secret settings" }
    'raise_itcc'                { return 'asking IT to review the app' }
    default                     { return 'processing the request' }
  }
}

function Deny-Step([string]$step, [string]$msg, [string]$runId) {
  if ($step -eq 'validate_name') {
    if ($msg -like '*soft-deleted*') {
      Fail $EXIT_REFUSED "An app with this name existed before and was removed, and Keshet keeps its stored settings for a short while, so the name isn't free yet. Pick a different name with the builder, or ask the platform team to release this one. Nothing was created."
    }
    if ($msg -like '*not available*' -or $msg -like '*already exists*' -or $msg -like '*taken*') {
      Fail $EXIT_REFUSED "There's already an app called that at Keshet. Pick a different name with the builder and send again - nothing was created, so there is nothing to undo."
    }
    $detail = if ($msg -ne '') { ": $msg" } else { '' }
    Fail $EXIT_REFUSED "Keshet did not accept the app's name$detail. Pick a new name with the builder and send again - nothing was created."
  }
  $runRef = if ($runId -ne '') { $runId } else { 'unknown' }
  Fail $EXIT_REFUSED "Something on the Keshet side did not finish while $(Get-StepLabel $step). This is not something the builder did, and it is safe to send again in a few minutes. Reference for the platform team: run $runRef."
}

function Deny-Http([int]$http, [string]$bodyText) {
  $body = ConvertFrom-JsonSafe $bodyText
  $code = Get-JsonField $body 'code'
  $msg = ''
  if ($null -ne $body) {
    $prop = $body.PSObject.Properties['message']
    if ($null -ne $prop -and $null -ne $prop.Value) {
      if ($prop.Value -is [System.Array]) { $msg = ($prop.Value -join '; ') }
      else { $msg = [string]$prop.Value }
    }
  }
  if ($http -eq 401) {
    Fail $EXIT_SIGNIN 'Keshet no longer accepts the sign-in - it has likely expired. Run the send again and sign in when the code appears. Nothing is lost.'
  }
  if ($http -eq 403) {
    Fail $EXIT_REFUSED "This account isn't approved to send apps to Keshet yet. Someone from the platform team needs to add it - there is nothing the builder needs to do."
  }
  if ($http -eq 429) {
    Fail $EXIT_REFUSED 'Keshet asked us to slow down because many requests arrived in a short time. Wait a few minutes and send again - nothing is lost.'
  }
  if ($http -ge 500 -and $http -le 599) {
    Fail $EXIT_UNREACHABLE "Something on the Keshet side isn't responding right now. This is not something the builder did. It is safe to send again in a few minutes."
  }
  switch ($code) {
    'REQUESTER_REQUIRED' {
      Fail $EXIT_SIGNIN "The sign-in Keshet received wasn't a personal one, so it can't record who owns the app. Run the send again and sign in when the code appears."
    }
    'NAME_INVALID' {
      $detail = if ($msg -ne '') { ": $msg" } else { '' }
      Fail $EXIT_REFUSED "Keshet did not accept the app's name$detail. Pick a new name with the builder and send again - nothing was created."
    }
    { $_ -eq 'NAME_TAKEN' -or $_ -eq 'DOMAIN_ALREADY_EXISTS' } {
      Fail $EXIT_REFUSED "There's already an app called that at Keshet. Pick a different name with the builder and send again - nothing was created, so there is nothing to undo."
    }
    'VAULT_NAME_SOFT_DELETED' {
      Fail $EXIT_REFUSED "An app with this name existed before and was removed, and Keshet keeps its stored settings for a short while, so the name isn't free yet. Pick a different name, or ask the platform team to release this one."
    }
  }
  $detail = if ($msg -ne '') { ": $msg" } else { '' }
  Fail $EXIT_REFUSED "Keshet did not accept the request$detail. If that doesn't say what to change, it is one for the platform team - the builder did nothing wrong."
}

# The IT review case the run raised, when the answer carries one. Printed at
# the end of a send so the builder and the approver look at the same case.
$ItccId = ''
function Save-ItccId($body) {
  $id = Get-JsonField $body 'itccId'
  if ($id -ne '' -and $id -ne 'null') { $script:ItccId = $id }
}

function Complete-Send {
  Say 'Accepted. The app is with Keshet now: it runs the automatic security checks, and someone from IT reviews what the app does and who can use it before it goes live. There is nothing more for the builder to do.'
  if ($script:ItccId -ne '') {
    Say "ITCC case: $($script:ItccId)"
  }
  exit 0
}

# --------------------------------------------------------------------------
# Send, then follow the run until Keshet has an answer
# --------------------------------------------------------------------------
Say 'Sending the app to Keshet now. This can take a few minutes...'
$r = Invoke-Api -Method POST -Path '/api/apps' -Body $PayloadJson -TimeoutSec 900 -Headers $AuthHeaders
if ($r.Status -eq 0) {
  Fail $EXIT_UNREACHABLE 'The connection to Keshet dropped while sending. It is safe to run the send again - the identical app sent twice is recognised as the same request.'
}
if ($r.Status -lt 200 -or $r.Status -gt 299) { Deny-Http $r.Status $r.Body }

$body = ConvertFrom-JsonSafe $r.Body
$RunStatus = Get-JsonField $body 'status'
$RunId = Get-JsonField $body 'runId'
$SentApp = Get-JsonField $body 'appName'
$FailedStep = Get-JsonField $body 'failedStep'
$LastErr = Get-JsonField $body 'lastErrorMessage'
Save-ItccId $body

switch ($RunStatus) {
  { $_ -eq 'pending_approval' -or $_ -eq 'approving' -or $_ -eq 'completed' } { Complete-Send }
  'failed' { Deny-Step $FailedStep $LastErr $RunId }
  'running' { }
  default {
    $runRef = if ($RunId -ne '') { $RunId } else { 'unknown' }
    Fail $EXIT_REFUSED "Keshet's answer did not say whether the app was accepted. It is safe to send again in a few minutes. Reference for the platform team: run $runRef."
  }
}

Say 'Keshet accepted the request and is working on it...'
$lastStep = ''
for ($n = 1; $n -le $PollCount; $n++) {
  Start-Sleep -Seconds $PollInterval
  $r = Invoke-Api -Method GET -Path "/api/apps/$SentApp/runs/$RunId" -TimeoutSec 60 -Headers $AuthHeaders
  if ($r.Status -eq 0) { continue }
  if ($r.Status -lt 200 -or $r.Status -gt 299) { Deny-Http $r.Status $r.Body }
  $body = ConvertFrom-JsonSafe $r.Body
  $RunStatus = Get-JsonField $body 'status'
  Save-ItccId $body
  $step = ''
  if ($null -ne $body) {
    $stepsProp = $body.PSObject.Properties['steps']
    if ($null -ne $stepsProp -and $null -ne $stepsProp.Value) {
      $started = @($stepsProp.Value | Where-Object { (Get-JsonField $_ 'status') -eq 'started' })
      if ($started.Count -gt 0) { $step = Get-JsonField $started[-1] 'name' }
    }
  }
  if ($step -ne '' -and $step -ne $lastStep) {
    Say "Keshet is $(Get-StepLabel $step)..."
    $lastStep = $step
  }
  switch ($RunStatus) {
    { $_ -eq 'pending_approval' -or $_ -eq 'approving' -or $_ -eq 'completed' } { Complete-Send }
    'failed' {
      $FailedStep = Get-JsonField $body 'failedStep'
      $LastErr = Get-JsonField $body 'lastErrorMessage'
      Deny-Step $FailedStep $LastErr $RunId
    }
    { $_ -eq 'rejected' -or $_ -eq 'abandoned' } {
      Fail $EXIT_REFUSED "Keshet closed this request without taking the app. It is safe to send again. Reference for the platform team: run $RunId."
    }
  }
}

Fail $EXIT_UNREACHABLE 'Keshet is still working on the request and has not given a final answer yet. Nothing is wrong - run the send again in a few minutes; the identical app sent twice is recognised as the same request.'
