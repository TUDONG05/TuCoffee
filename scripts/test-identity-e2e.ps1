[CmdletBinding()]
param()

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
$taskKeys = @('MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_PWD', 'SERVER_PORT', 'SERVER_ADDRESS', 'SPRING_PROFILES_ACTIVE', 'AUTH_JWT_SECRET', 'AUTH_ALLOWED_ORIGINS', 'BOOTSTRAP_ADMIN_PASSWORD', 'E2E_ADMIN_EMAIL', 'E2E_ADMIN_PASSWORD', 'E2E_API_TARGET', 'DEBUG')
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
  & java -jar $taskJar --spring.profiles.active=bootstrap --spring.main.web-application-type=none --bootstrap.admin.name=E2EAdmin --bootstrap.admin.email=admin-e2e@example.test --debug=false
  if ($LASTEXITCODE -ne 0) {
    throw 'Bootstrap ADMIN E2E that bai.'
  }
  $taskBackend = Start-Process java -ArgumentList @('-jar', $taskJar, '--debug=false') -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskTemp 'identity-e2e-backend.log') -RedirectStandardError (Join-Path $taskTemp 'identity-e2e-backend.err.log')
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
  Push-Location (Join-Path $taskRoot 'frontend')
  try {
    & npm.cmd run e2e
    if ($LASTEXITCODE -ne 0) {
      throw 'Playwright E2E that bai.'
    }
  } finally {
    Pop-Location
  }
} finally {
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
