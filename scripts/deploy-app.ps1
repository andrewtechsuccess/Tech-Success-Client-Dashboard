<#
.SYNOPSIS
  Redeploy the app code to the existing Azure App Service. Nothing else.

.DESCRIPTION
  The everyday "ship it" script: builds the SPA, stages a minimal package
  (server + client/dist + production deps), zip-deploys it, and verifies the
  live site afterwards. It does NOT touch the Entra registration, app settings,
  or client data — use scripts/deploy-azure.ps1 for first-time infrastructure.

  Run only after changes have been reviewed and approved locally.

.EXAMPLE
  ./scripts/deploy-app.ps1
  ./scripts/deploy-app.ps1 -WhatIf     # build + stage, but don't deploy
#>
param(
  [string]$AppName = 'tsuccess-client-dashboard',
  [string]$ResourceGroup = 'rg-client-dashboard',
  [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$npm = 'C:\Program Files\nodejs\npm.cmd'

$az = (Get-Command az -ErrorAction SilentlyContinue).Source
if (-not $az) {
  $candidate = 'C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd'
  if (Test-Path $candidate) { $az = $candidate } else { throw 'Azure CLI not found.' }
}

function Step($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }

Step 'Building the SPA'
& $npm --prefix $repo run build
if ($LASTEXITCODE -ne 0) { throw 'client build failed' }

Step 'Staging package'
$stage = Join-Path ([IO.Path]::GetTempPath()) ("tscd-" + (Get-Date -Format 'yyyyMMddHHmmss'))
New-Item -ItemType Directory -Force "$stage\client" | Out-Null
Copy-Item "$repo\server" "$stage\server" -Recurse
Copy-Item "$repo\client\dist" "$stage\client\dist" -Recurse
# Server-only package.json: no workspaces/build step, so Oryx installs fast.
$rootPkg = Get-Content "$repo\package.json" | ConvertFrom-Json
@{ name = 'tech-success-client-dashboard'; private = $true; type = 'module'
   engines = @{ node = '>=18' }; dependencies = $rootPkg.dependencies } |
  ConvertTo-Json -Depth 4 | Set-Content "$stage\package.json" -Encoding utf8
$zip = "$stage.zip"
Compress-Archive -Path "$stage\*" -DestinationPath $zip
Write-Host ("package: {0:N0} KB" -f ((Get-Item $zip).Length / 1KB))

if ($WhatIf) { Write-Host "`n-WhatIf: stopping before deploy. Package at $zip" -ForegroundColor Yellow; return }

Step 'Deploying'
# Fresh-app SCM DNS can sit in the local resolver's negative cache.
Clear-DnsClientCache -ErrorAction SilentlyContinue
& $az webapp deploy --name $AppName --resource-group $ResourceGroup --src-path $zip --type zip --output none
if ($LASTEXITCODE -ne 0) { throw 'deployment failed' }

Step 'Verifying'
Start-Sleep -Seconds 12
$base = "https://$AppName.azurewebsites.net"
$health = Invoke-RestMethod -Uri "$base/api/health" -TimeoutSec 90
$auth = Invoke-RestMethod -Uri "$base/api/auth/config" -TimeoutSec 60
Write-Host "health ok      : $($health.ok)"
Write-Host "Microsoft SSO  : $($auth.entra)"
Write-Host "password login : $($auth.passwordLogin)"
Write-Host "`nLive: $base" -ForegroundColor Green
