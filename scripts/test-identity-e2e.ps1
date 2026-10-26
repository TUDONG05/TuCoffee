[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskTemp = Join-Path $taskRoot '.tmp'
$taskJar = Join-Path $taskRoot 'backend/target/tu-coffee-api-0.0.1-SNAPSHOT.jar'
if (-not (Test-Path -LiteralPath $taskJar)) { throw 'Chay Maven verify truoc khi chay E2E.' }
[void][System.IO.Directory]::CreateDirectory($taskTemp)
$taskId = [Guid]::NewGuid().ToString('N').Substring(0, 10)
$taskEnvFile = Join-Path $taskTemp ('identity-e2e-' + $taskId + '.env')
$taskContainer = $null
$taskBackend = $null
$taskKeys = @('MYSQL_HOST','MYSQL_PORT','MYSQL_DATABASE','MYSQL_USER','MYSQL_PASSWORD','SERVER_PORT','SERVER_ADDRESS','SPRING_PROFILES_ACTIVE','AUTH_JWT_SECRET','AUTH_ALLOWED_ORIGINS','BOOTSTRAP_ADMIN_PASSWORD','E2E_ADMIN_EMAIL','E2E_ADMIN_PASSWORD','E2E_API_TARGET','DEBUG')
$taskPrevious = @{}
foreach ($taskKey in $taskKeys) { $taskPrevious[$taskKey] = [Environment]::GetEnvironmentVariable($taskKey, 'Process') }
function New-TestSecret([int]$length) {
    $taskBytes = New-Object byte[] $length
    $taskRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $taskRng.GetBytes($taskBytes) } finally { $taskRng.Dispose() }
    return [Convert]::ToBase64String($taskBytes)
}
try {
    $env:MYSQL_HOST = '127.0.0.1'
    $env:MYSQL_PORT = '3308'
    $env:MYSQL_DATABASE = 'tu_coffee_identity_e2e'
    $env:MYSQL_USER = 'coffee_e2e'
    $env:MYSQL_PASSWORD = New-TestSecret 24
    $taskDockerEnv = "MYSQL_DATABASE=$env:MYSQL_DATABASE`nMYSQL_USER=$env:MYSQL_USER`nMYSQL_PASSWORD=$env:MYSQL_PASSWORD`nMYSQL_ROOT_PASSWORD=$(New-TestSecret 24)`n"
    [System.IO.File]::WriteAllText($taskEnvFile, $taskDockerEnv, (New-Object System.Text.UTF8Encoding($false)))
    $taskContainer = (& docker run -d --name "tu-coffee-identity-e2e-$taskId" --env-file $taskEnvFile -p 127.0.0.1:3308:3306 mysql:8.4.13).Trim()
    if ($LASTEXITCODE -ne 0 -or $taskContainer -notmatch '^[a-f0-9]{64}$') { throw 'Khong tao duoc MySQL E2E rieng.' }
    $taskReady = $false
    for ($taskAttempt = 0; $taskAttempt -lt 90; $taskAttempt++) {
        & docker exec $taskContainer mysqladmin ping -h 127.0.0.1 --silent 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $taskReady = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $taskReady) { throw 'MySQL E2E chua san sang.' }
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
    if ($LASTEXITCODE -ne 0) { throw 'Bootstrap ADMIN E2E that bai.' }
    $taskBackend = Start-Process java -ArgumentList @('-jar', $taskJar, '--debug=false') -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskTemp 'identity-e2e-backend.log') -RedirectStandardError (Join-Path $taskTemp 'identity-e2e-backend.err.log')
    $taskReady = $false
    for ($taskAttempt = 0; $taskAttempt -lt 60; $taskAttempt++) {
        if ($taskBackend.HasExited) { throw 'Backend E2E da dung; xem .tmp/identity-e2e-backend*.log.' }
        try {
            $taskHealth = Invoke-RestMethod http://127.0.0.1:8081/api/v1/health -TimeoutSec 2
            if ($taskHealth.status -eq 'UP') { $taskReady = $true; break }
        } catch { }
        Start-Sleep -Seconds 1
    }
    if (-not $taskReady) { throw 'Backend E2E chua san sang.' }
    Push-Location (Join-Path $taskRoot 'frontend')
    try {
        & npm.cmd run e2e
        if ($LASTEXITCODE -ne 0) { throw 'Playwright E2E that bai.' }
    } finally { Pop-Location }
} finally {
    if ($taskBackend -and -not $taskBackend.HasExited) { Stop-Process -Id $taskBackend.Id }
    # Only the exact disposable container ID created by this invocation is removed.
    if ($taskContainer -match '^[a-f0-9]{64}$') { & docker rm -fv $taskContainer | Out-Null }
    if (Test-Path -LiteralPath $taskEnvFile) { Remove-Item -LiteralPath $taskEnvFile }
    foreach ($taskKey in $taskKeys) { [Environment]::SetEnvironmentVariable($taskKey, $taskPrevious[$taskKey], 'Process') }
}
