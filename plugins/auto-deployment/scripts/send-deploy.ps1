<#
  send-deploy.ps1 - send a builder's app to the Keshet deployment service.

  Thin launcher: the whole send lives in send-deploy.mjs, one implementation
  for every platform, running on Node.js alone - no curl, no jq, nothing
  else - because builder machines range from vanilla Windows to macOS to
  sandboxed minimal Linux, and Node is the one tool every builder machine
  already has (the apps themselves are Next.js apps). This file only finds
  Node and hands over, forwarding its arguments untouched so the command
  line is identical to send-deploy.sh, its macOS/Linux twin.

  Usage:
    powershell -NoProfile -ExecutionPolicy Bypass -File .\send-deploy.ps1 [--check] [--signoff FILE] [APP_DIR]

  Exit codes (the verifier acts on these; the .mjs owns them):
    0  accepted - the deployment run reached IT review or beyond
    1  could not run - bad input, a missing tool, or an incomplete request
    2  refused - Keshet turned the request down; the reason was printed
    3  unreachable - network or service trouble; safe to run again
    4  sign-in failed or timed out
#>

$node = Get-Command node -ErrorAction SilentlyContinue
if ($null -eq $node) {
  Write-Output 'The send tooling needs Node.js and could not find it, so nothing was sent. Building the app needs Node too, so on a builder machine this is a platform problem to report, not something the builder did.'
  exit 1
}

$mjs = Join-Path $PSScriptRoot 'send-deploy.mjs'
& $node.Source $mjs @args
exit $LASTEXITCODE
