[CmdletBinding()]
param([string[]]$PlaywrightArgs = @())

$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskTemp = Join-Path $taskRoot '.tmp'
$taskJar = Join-Path $taskRoot 'backend/target/tu-coffee-api-0.0.1-SNAPSHOT.jar'
if (-not (Test-Path -LiteralPath $taskJar)) {
  throw 'Chay Maven verify truoc khi chay E2E.'
}
[void][System.IO.Directory]::CreateDirectory($taskTemp)
$taskId = [Guid]::NewGuid().ToString('N').Substring(0, 10)
$taskDatabase = 'tu_coffee_test_e2e_' + $taskId
$taskDatabaseCreated = $false
$taskTestUser = $env:TEST_MYSQL_USER
$taskTestPassword = $env:TEST_MYSQL_PASSWORD
if (-not $taskTestUser -or -not $taskTestPassword) {
  throw 'Dat TEST_MYSQL_USER va TEST_MYSQL_PASSWORD cho MySQL native truoc khi chay E2E.'
}
$taskTestHost = if ($env:TEST_MYSQL_HOST) {
  $env:TEST_MYSQL_HOST
} else {
  '127.0.0.1'
}
$taskTestPort = if ($env:TEST_MYSQL_PORT) {
  $env:TEST_MYSQL_PORT
} else {
  '3306'
}
$taskMysqlArgs = @('--protocol=TCP', "--host=$taskTestHost", "--port=$taskTestPort", "--user=$taskTestUser", '--connect-timeout=3')
$taskBackend = $null
$taskFrontend = $null
$taskKeys = @('MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_PWD', 'SERVER_PORT', 'SERVER_ADDRESS', 'SPRING_PROFILES_ACTIVE', 'AUTH_JWT_SECRET', 'AUTH_ALLOWED_ORIGINS', 'BOOTSTRAP_ADMIN_PASSWORD', 'E2E_ADMIN_EMAIL', 'E2E_ADMIN_PASSWORD', 'E2E_API_TARGET', 'E2E_MANAGED_FRONTEND', 'DEBUG')
$taskPrevious = @{}
foreach ($taskKey in $taskKeys) {
  $taskPrevious[$taskKey] = [Environment]::GetEnvironmentVariable($taskKey, 'Process')
}
function New-TestSecret([int]$length) {
  $taskBytes = New-Object byte[] $length
  $taskRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $taskRng.GetBytes($taskBytes)
  } finally {
    $taskRng.Dispose()
  }
  return [Convert]::ToBase64String($taskBytes)
}
try {
  $env:MYSQL_PWD = $taskTestPassword
  & mysql @taskMysqlArgs "--execute=CREATE DATABASE $taskDatabase CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
  if ($LASTEXITCODE -ne 0) {
    throw 'Khong tao duoc schema E2E rieng tren MySQL native.'
  }
  $taskDatabaseCreated = $true
  $env:MYSQL_HOST = $taskTestHost
  $env:MYSQL_PORT = $taskTestPort
  $env:MYSQL_DATABASE = $taskDatabase
  $env:MYSQL_USER = $taskTestUser
  $env:MYSQL_PASSWORD = $taskTestPassword
  $env:SERVER_PORT = '8081'
  $env:SERVER_ADDRESS = '127.0.0.1'
  $env:SPRING_PROFILES_ACTIVE = 'local'
  $env:AUTH_JWT_SECRET = New-TestSecret 48
  $env:AUTH_ALLOWED_ORIGINS = 'http://localhost:4201'
  $env:BOOTSTRAP_ADMIN_PASSWORD = New-TestSecret 24
  $env:E2E_ADMIN_EMAIL = 'admin-e2e@example.test'
  $env:E2E_ADMIN_PASSWORD = $env:BOOTSTRAP_ADMIN_PASSWORD
  $env:E2E_API_TARGET = 'http://127.0.0.1:8081'
  $env:DEBUG = 'false'
  & java -jar $taskJar --spring.config.import= --spring.profiles.active=bootstrap --spring.main.web-application-type=none --bootstrap.admin.name=E2EAdmin --bootstrap.admin.email=admin-e2e@example.test --debug=false
  if ($LASTEXITCODE -ne 0) {
    throw 'Bootstrap ADMIN E2E that bai.'
  }
  $taskUploads = Join-Path $taskTemp ('e2e-catalog-assets-' + $taskId)
  # Real authentication tests run without an external CAPTCHA challenge. The
  # dedicated Turnstile UI test covers token gating separately.
  $taskBackendArguments = @('-jar', $taskJar, '--spring.config.import=', '--debug=false', '--turnstile.enabled=false', '--catalog.seed.enabled=true', "--catalog.upload-dir=$taskUploads")
  $taskBackend = Start-Process java -ArgumentList $taskBackendArguments -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskTemp 'identity-e2e-backend.log') -RedirectStandardError (Join-Path $taskTemp 'identity-e2e-backend.err.log')
  $taskReady = $false
  for ($taskAttempt = 0; $taskAttempt -lt 60; $taskAttempt++) {
    if ($taskBackend.HasExited) {
      throw 'Backend E2E da dung; xem .tmp/identity-e2e-backend*.log.'
    }
    try {
      $taskHealth = Invoke-RestMethod http://127.0.0.1:8081/api/v1/health -TimeoutSec 2
      if ($taskHealth.status -eq 'UP') {
        $taskReady = $true; break
      }
    } catch {
    }
    Start-Sleep -Seconds 1
  }
  if (-not $taskReady) {
    throw 'Backend E2E chua san sang.'
  }
  $taskTurnstile = Invoke-RestMethod http://127.0.0.1:8081/api/v1/auth/turnstile/config -TimeoutSec 5
  if ($taskTurnstile.enabled -ne $false) {
    throw 'Backend E2E phai tat CAPTCHA ben ngoai.'
  }
  # Own the frontend process directly so Windows cleanup does not depend on
  # terminating a nested npm/cmd process tree inside Playwright.
  $env:E2E_MANAGED_FRONTEND = 'true'
  $taskFrontendRoot = Join-Path $taskRoot 'frontend'
  $taskFrontend = Start-Process node -ArgumentList @('node_modules/@angular/cli/bin/ng.js', 'serve', '--host', 'localhost', '--port', '4201', '--proxy-config', 'src/proxy.e2e.cjs') -WorkingDirectory $taskFrontendRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskTemp 'catalog-e2e-frontend.log') -RedirectStandardError (Join-Path $taskTemp 'catalog-e2e-frontend.err.log')
  $taskFrontendReady = $false
  for ($taskAttempt = 0; $taskAttempt -lt 120; $taskAttempt++) {
    if ($taskFrontend.HasExited) { throw 'Frontend E2E da dung.' }
    try {
      $taskPage = Invoke-WebRequest http://localhost:4201 -UseBasicParsing -TimeoutSec 2
      if ($taskPage.StatusCode -eq 200) { $taskFrontendReady = $true; break }
    } catch {
    }
    Start-Sleep -Seconds 1
  }
  if (-not $taskFrontendReady) { throw 'Frontend E2E chua san sang.' }
  Push-Location (Join-Path $taskRoot 'frontend')
  try {
    & npm.cmd run e2e -- @PlaywrightArgs
    if ($LASTEXITCODE -ne 0) {
      throw 'Playwright E2E that bai.'
    }
  } finally {
    Pop-Location
  }
  # Restart against the same generated schema and upload directory: seed must
  # preserve admin edits and images must remain available after a fresh JVM.
  $taskBeforeRestart = Invoke-RestMethod 'http://127.0.0.1:8081/api/v1/products?size=100' -TimeoutSec 5
  Stop-Process -Id $taskBackend.Id
  $taskBackend.WaitForExit()
  $taskBackend = Start-Process java -ArgumentList $taskBackendArguments -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskTemp 'catalog-e2e-restart.log') -RedirectStandardError (Join-Path $taskTemp 'catalog-e2e-restart.err.log')
  $taskReady = $false
  for ($taskAttempt = 0; $taskAttempt -lt 60; $taskAttempt++) {
    if ($taskBackend.HasExited) { throw 'Backend restart that bai.' }
    try {
      $taskHealth = Invoke-RestMethod http://127.0.0.1:8081/api/v1/health -TimeoutSec 2
      if ($taskHealth.status -eq 'UP') {
        $taskAfterRestart = Invoke-RestMethod 'http://127.0.0.1:8081/api/v1/products?size=100' -TimeoutSec 5
        $taskSeedLog = Get-Content -Raw (Join-Path $taskTemp 'catalog-e2e-restart.log')
        if ($taskSeedLog -match 'Local reference catalog: 0 created, 18 existing products preserved\.') {
          $taskReady = $true; break
        }
      }
    } catch {
    }
    Start-Sleep -Seconds 1
  }
  if (-not $taskReady) { throw 'Backend restart/seed chua san sang.' }
  if (($taskBeforeRestart | ConvertTo-Json -Depth 10 -Compress) -ne ($taskAfterRestart | ConvertTo-Json -Depth 10 -Compress)) {
    throw 'Catalog thay doi sau restart/seed lap.'
  }
  $taskImageCount = 0
  foreach ($taskProduct in $taskAfterRestart.items) {
    if ($taskProduct.imageUrl) {
      $taskImage = Invoke-WebRequest ('http://127.0.0.1:8081' + $taskProduct.imageUrl) -UseBasicParsing -TimeoutSec 5
      if ($taskImage.StatusCode -ne 200 -or $taskImage.RawContentLength -le 0) { throw 'Anh mat sau restart.' }
      $taskImageCount++
    }
  }
  Write-Host "Catalog restart verified: $($taskAfterRestart.totalItems) public products unchanged, $taskImageCount images available; repeated seed preserved existing data."
} finally {
  if ($taskFrontend -and -not $taskFrontend.HasExited) {
    Stop-Process -Id $taskFrontend.Id
  }
  if ($taskBackend -and -not $taskBackend.HasExited) {
    Stop-Process -Id $taskBackend.Id
  }
  # Remove only the generated schema that this invocation successfully created.
  if ($taskDatabaseCreated -and $taskDatabase -match '^tu_coffee_test_e2e_[a-f0-9]{10}$') {
    $env:MYSQL_PWD = $taskTestPassword
    & mysql @taskMysqlArgs "--execute=DROP DATABASE $taskDatabase"
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "Khong don duoc schema test: $taskDatabase"
    }
  }
  foreach ($taskKey in $taskKeys) {
    [Environment]::SetEnvironmentVariable($taskKey, $taskPrevious[$taskKey], 'Process')
  }
}
