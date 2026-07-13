<#
.SYNOPSIS
  One-shot deployment of the Tech Success Client Dashboard to Azure App Service
  with Microsoft Entra ID SSO and a ready-to-upload Teams app package.

.DESCRIPTION
  Run AFTER `az login` (sign in with an account that can create Azure resources
  and app registrations; admin consent needs a directory admin).

  What it does:
    1. Creates/updates the Entra app registration (SPA redirects, App ID URI,
       access_as_user scope, pre-authorized Teams clients, v2 tokens, Graph
       openid/profile/email/User.Read) and attempts admin consent.
    2. Creates the resource group, Linux App Service plan (B1), and web app.
    3. Builds the SPA locally, stages a minimal package, zip-deploys it.
    4. Sets app settings (ENTRA_*, DATA_DIR=/home/data) and startup command.
    5. Uploads local data/*.json to /home/data (first run only, unless -ForceData).
    6. Fills teams/manifest.json placeholders and zips the Teams app package.

.EXAMPLE
  ./scripts/deploy-azure.ps1 -AppName tsuccess-client-dashboard
#>
param(
  [Parameter(Mandatory = $true)][string]$AppName,   # globally unique; becomes <AppName>.azurewebsites.net
  [string]$ResourceGroup = 'rg-client-dashboard',
  [string]$Location = 'australiaeast',
  [string]$Sku = 'B1',
  [switch]$SkipEntra,   # skip app-registration step (reuse existing settings)
  [switch]$ForceData    # overwrite server data with local data/ even if present
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$npm = 'C:\Program Files\nodejs\npm.cmd'

# Locate az (fresh winget installs aren't on PATH in existing shells).
$az = (Get-Command az -ErrorAction SilentlyContinue).Source
if (-not $az) {
  $candidate = 'C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd'
  if (Test-Path $candidate) { $az = $candidate } else { throw 'Azure CLI not found. Install it, then re-run.' }
}

function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }

Step 'Checking Azure sign-in'
$account = & $az account show 2>$null | ConvertFrom-Json
if (-not $account) { throw "Not signed in. Run:  & `"$az`" login   then re-run this script." }
$tenantId = $account.tenantId
Write-Host "Tenant: $tenantId  Subscription: $($account.name)"

$domain = "$AppName.azurewebsites.net"
$displayName = 'Tech Success Client Dashboard'

# ---------------------------------------------------------------- Entra app
if (-not $SkipEntra) {
  Step 'Entra ID app registration'
  $existing = & $az ad app list --display-name $displayName --query '[0]' | ConvertFrom-Json
  if ($existing) {
    Write-Host "Reusing existing registration $($existing.appId)"
    $appId = $existing.appId; $objectId = $existing.id
  } else {
    $created = & $az ad app create --display-name $displayName --sign-in-audience AzureADMyOrg | ConvertFrom-Json
    if (-not $created -or -not $created.appId) {
      throw ("Could not create the app registration — the signed-in account lacks directory rights. " +
             "Sign in (az login) with an account that has the Global Administrator, Application Administrator, " +
             "or Cloud Application Administrator role, then re-run.")
    }
    $appId = $created.appId; $objectId = $created.id
    Write-Host "Created registration $appId"
  }

  $appIdUri = "api://$domain/$appId"
  $scopeId = [guid]::NewGuid().ToString()
  # Preserve an existing scope id if one is already defined (PATCHing a new id
  # over a consented scope breaks consent).
  $currentApi = & $az rest --method GET --url "https://graph.microsoft.com/v1.0/applications/$objectId" | ConvertFrom-Json
  $existingScope = $currentApi.api.oauth2PermissionScopes | Where-Object { $_.value -eq 'access_as_user' } | Select-Object -First 1
  if ($existingScope) { $scopeId = $existingScope.id }

  $patch = @{
    identifierUris = @($appIdUri)
    spa = @{ redirectUris = @("https://$domain/", 'http://localhost:5273/', 'http://localhost:4100/') }
    api = @{
      requestedAccessTokenVersion = 2
      oauth2PermissionScopes = @(@{
        id = $scopeId
        value = 'access_as_user'
        type = 'User'
        isEnabled = $true
        adminConsentDisplayName = 'Access the Client Dashboard as the user'
        adminConsentDescription = 'Allows the app to call the Client Dashboard API as the signed-in user.'
        userConsentDisplayName = 'Access the Client Dashboard'
        userConsentDescription = 'Allows the app to call the Client Dashboard API on your behalf.'
      })
      preAuthorizedApplications = @(
        @{ appId = '1fec8e78-bce4-4aaf-ab1b-5451cc387264'; delegatedPermissionIds = @($scopeId) }, # Teams desktop/mobile
        @{ appId = '5e3ce6c0-2b1f-4285-8d4b-75ee78787346'; delegatedPermissionIds = @($scopeId) }  # Teams web
      )
    }
    requiredResourceAccess = @(@{
      resourceAppId = '00000003-0000-0000-c000-000000000000' # Microsoft Graph
      resourceAccess = @(
        @{ id = '37f7f235-527c-4136-accd-4a02d197296e'; type = 'Scope' }, # openid
        @{ id = '14dad69e-099b-42c9-810b-d002981feec1'; type = 'Scope' }, # profile
        @{ id = '64a6cdd6-aab1-4aaf-94b8-3cc8405e90d0'; type = 'Scope' }, # email
        @{ id = 'e1fe6dd8-ba31-4d61-89e7-88639da4683d'; type = 'Scope' }  # User.Read
      )
    })
  } | ConvertTo-Json -Depth 8

  $patchFile = Join-Path $env:TEMP 'tscd-app-patch.json'
  Set-Content -Path $patchFile -Value $patch -Encoding utf8
  & $az rest --method PATCH --url "https://graph.microsoft.com/v1.0/applications/$objectId" --headers 'Content-Type=application/json' --body "@$patchFile" | Out-Null
  Write-Host "App ID URI: $appIdUri"

  # Service principal + admin consent (consent needs a directory admin).
  $sp = & $az ad sp show --id $appId 2>$null
  if (-not $sp) { & $az ad sp create --id $appId | Out-Null; Write-Host 'Service principal created.' }
  try {
    & $az ad app permission admin-consent --id $appId 2>$null | Out-Null
    Write-Host 'Admin consent granted.'
  } catch {
    Write-Warning 'Could not grant admin consent automatically — grant it in Entra portal > App registrations > API permissions.'
  }
} else {
  Step 'Skipping Entra registration (-SkipEntra)'
  $existing = & $az ad app list --display-name $displayName --query '[0]' | ConvertFrom-Json
  if (-not $existing) { throw 'No existing registration found; run without -SkipEntra.' }
  $appId = $existing.appId
  $appIdUri = "api://$domain/$appId"
}

# ------------------------------------------------------------ Azure resources
Step 'Resource group / plan / web app'
& $az group create --name $ResourceGroup --location $Location --output none
if (-not (& $az appservice plan show --name "$AppName-plan" --resource-group $ResourceGroup 2>$null)) {
  & $az appservice plan create --name "$AppName-plan" --resource-group $ResourceGroup --location $Location --is-linux --sku $Sku --output none
}
if (-not (& $az webapp show --name $AppName --resource-group $ResourceGroup 2>$null)) {
  & $az webapp create --name $AppName --resource-group $ResourceGroup --plan "$AppName-plan" --runtime 'NODE:20-lts' --output none
}
& $az webapp config set --name $AppName --resource-group $ResourceGroup --startup-file 'node server/index.js' --output none

Step 'App settings'
& $az webapp config appsettings set --name $AppName --resource-group $ResourceGroup --output none --settings `
  ENTRA_TENANT_ID=$tenantId `
  ENTRA_CLIENT_ID=$appId `
  ENTRA_APP_ID_URI=$appIdUri `
  DATA_DIR=/home/data `
  SCM_DO_BUILD_DURING_DEPLOYMENT=true

# ------------------------------------------------------------- build & deploy
Step 'Building the SPA'
& $npm --prefix $repo run build
if ($LASTEXITCODE -ne 0) { throw 'client build failed' }

Step 'Staging deployment package'
$stage = Join-Path $env:TEMP 'tscd-deploy'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force "$stage\client" | Out-Null
Copy-Item "$repo\server" "$stage\server" -Recurse
Copy-Item "$repo\client\dist" "$stage\client\dist" -Recurse
# Minimal package.json: server deps only — no workspaces, no build script, so
# Oryx just installs four packages and starts fast.
$rootPkg = Get-Content "$repo\package.json" | ConvertFrom-Json
@{ name = 'tech-success-client-dashboard'; private = $true; type = 'module'
   engines = @{ node = '>=18' }
   dependencies = $rootPkg.dependencies } | ConvertTo-Json -Depth 4 | Set-Content "$stage\package.json" -Encoding utf8
$zip = Join-Path $env:TEMP 'tscd-deploy.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path "$stage\*" -DestinationPath $zip

Step 'Deploying to App Service (this can take a few minutes)'
& $az webapp deploy --name $AppName --resource-group $ResourceGroup --src-path $zip --type zip --async false --output none

# ------------------------------------------------------------------ data copy
Step 'Uploading client data to /home/data'
$dataDir = Join-Path $repo 'data'
if (Test-Path $dataDir) {
  $creds = & $az webapp deployment list-publishing-credentials --name $AppName --resource-group $ResourceGroup | ConvertFrom-Json
  $pair = "$($creds.publishingUserName):$($creds.publishingPassword)"
  $auth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
  $kudu = "https://$AppName.scm.azurewebsites.net/api/vfs"
  try { Invoke-RestMethod -Method PUT -Uri "$kudu/data/" -Headers @{ Authorization = $auth } | Out-Null } catch {} # ensure dir
  foreach ($f in Get-ChildItem $dataDir -Filter *.json) {
    $exists = $true
    try { Invoke-RestMethod -Method HEAD -Uri "$kudu/data/$($f.Name)" -Headers @{ Authorization = $auth } | Out-Null } catch { $exists = $false }
    if ($exists -and -not $ForceData) { Write-Host "  $($f.Name) already on server — skipped (use -ForceData to overwrite)"; continue }
    Invoke-RestMethod -Method PUT -Uri "$kudu/data/$($f.Name)" -Headers @{ Authorization = $auth; 'If-Match' = '*' } -InFile $f.FullName | Out-Null
    Write-Host "  uploaded $($f.Name)"
  }
} else {
  Write-Host '  no local data/ folder — the app will start empty.'
}

# --------------------------------------------------------------- Teams package
Step 'Building the Teams app package'
$teamsDir = Join-Path $repo 'teams'
$manifest = Get-Content "$teamsDir\manifest.json" -Raw
$manifest = $manifest.Replace('${ENTRA_CLIENT_ID}', $appId).Replace('${APP_DOMAIN}', $domain).Replace('${APP_ID_URI}', $appIdUri)
$pkgDir = Join-Path $env:TEMP 'tscd-teams-pkg'
if (Test-Path $pkgDir) { Remove-Item $pkgDir -Recurse -Force }
New-Item -ItemType Directory -Force $pkgDir | Out-Null
Set-Content "$pkgDir\manifest.json" $manifest -Encoding utf8
Copy-Item "$teamsDir\color.png", "$teamsDir\outline.png" $pkgDir
$teamsZip = "$teamsDir\client-dashboard-teams.zip"
if (Test-Path $teamsZip) { Remove-Item $teamsZip -Force }
Compress-Archive -Path "$pkgDir\*" -DestinationPath $teamsZip

# -------------------------------------------------------------------- summary
Step 'DONE'
Write-Host @"

  App URL:        https://$domain
  Entra client:   $appId
  App ID URI:     $appIdUri
  Teams package:  $teamsZip

  Remaining manual steps:
   1. Open https://$domain and sign in (Microsoft 365 button, or the admin password).
   2. Teams Admin Center > Teams apps > Manage apps > Upload new app > pick the
      Teams package zip above, then approve/publish it for your org.
   3. Once everyone is signing in with 365, run:
      az webapp config appsettings set -n $AppName -g $ResourceGroup --settings DISABLE_PASSWORD_LOGIN=1
"@
