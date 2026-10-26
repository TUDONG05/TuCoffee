[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskEnvPath = Join-Path $taskRoot '.env'
$taskTemplatePath = Join-Path $taskRoot '.env.example'
$taskEncoding = New-Object System.Text.UTF8Encoding($false)

if (-not (Test-Path -LiteralPath $taskEnvPath)) {
    [System.IO.File]::Copy($taskTemplatePath, $taskEnvPath, $false)
    $taskNewEnvironment = $true
} else {
    $taskNewEnvironment = $false
}

$taskContents = [System.IO.File]::ReadAllText($taskEnvPath, [System.Text.Encoding]::UTF8)

function New-LocalSecret {
    $taskBytes = New-Object byte[] 48
    $taskRandom = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $taskRandom.GetBytes($taskBytes) } finally { $taskRandom.Dispose() }
    return [Convert]::ToBase64String($taskBytes)
}

if ($taskNewEnvironment) {
    $taskContents = $taskContents.Replace('MYSQL_PASSWORD=change-me-local-app', ('MYSQL_PASSWORD=' + (New-LocalSecret)))
    $taskContents = $taskContents.Replace('MYSQL_ROOT_PASSWORD=change-me-local-root', ('MYSQL_ROOT_PASSWORD=' + (New-LocalSecret)))
}

if ($taskContents -match '(?m)^AUTH_JWT_SECRET=\s*$') {
    $taskContents = [regex]::Replace($taskContents, '(?m)^AUTH_JWT_SECRET=[ \t]*\r?$', ('AUTH_JWT_SECRET=' + (New-LocalSecret)))
} elseif ($taskContents -notmatch '(?m)^AUTH_JWT_SECRET=') {
    $taskContents = $taskContents.TrimEnd() + [Environment]::NewLine + 'AUTH_JWT_SECRET=' + (New-LocalSecret) + [Environment]::NewLine
}

if ($taskContents -notmatch '(?m)^SPRING_PROFILES_ACTIVE=') {
    $taskContents = $taskContents.TrimEnd() + [Environment]::NewLine + 'SPRING_PROFILES_ACTIVE=local' + [Environment]::NewLine
}

[System.IO.File]::WriteAllText($taskEnvPath, $taskContents, $taskEncoding)
Write-Output 'Da chuan bi .env local. Giu nguyen mat khau/secret da co; khong in gia tri bi mat.'
