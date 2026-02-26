param(
    [string]$ServerIP = ""
)

if ([string]::IsNullOrWhiteSpace($ServerIP)) {
    Write-Host "UNETI Schedule Widget - Local Update Server" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Enter update server IP address:" -ForegroundColor Yellow
    Write-Host "  - For localhost: press Enter (default)" -ForegroundColor Gray
    Write-Host "  - For remote server: enter IP (e.g., 192.168.2.100)" -ForegroundColor Gray
    Write-Host ""
    $input = Read-Host "Server IP"
    
    if ([string]::IsNullOrWhiteSpace($input)) {
        $ServerIP = "localhost"
    }
    else {
        $ServerIP = $input.Trim()
    }
}

Write-Host ""
Write-Host "UNETI Schedule Widget - Local Update Server" -ForegroundColor Cyan
Write-Host "Update server: http://${ServerIP}:8080" -ForegroundColor Green
Write-Host ""

function Find-AppExecutable {
    $regPaths = @(
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )
    
    foreach ($regPath in $regPaths) {
        try {
            $apps = Get-ItemProperty $regPath -ErrorAction SilentlyContinue | Where-Object { 
                $_.DisplayName -like "*UNETI*" -or 
                $_.DisplayName -like "*Widget*" -or
                $_.DisplayName -like "*Schedule*"
            }
            
            foreach ($app in $apps) {
                if ($app.InstallLocation) {
                    $exeFiles = Get-ChildItem -Path $app.InstallLocation -Filter "*.exe" -ErrorAction SilentlyContinue
                    foreach ($exe in $exeFiles) {
                        if ($exe.Name -notlike "*uninstall*") {
                            return $exe.FullName
                        }
                    }
                }
            }
        }
        catch {}
    }
    
    $localAppData = $env:LOCALAPPDATA
    $programFiles = ${env:ProgramFiles}
    $programFilesX86 = ${env:ProgramFiles(x86)}
    
    $searchDirs = @(
        "$PSScriptRoot",
        "$localAppData\Programs\uneti-schedule-widget",
        "$programFiles\uneti-schedule-widget",
        "$programFilesX86\uneti-schedule-widget"
    )
    
    foreach ($dir in $searchDirs) {
        if (Test-Path $dir) {
            $exeFiles = Get-ChildItem -Path $dir -Filter "*.exe" -ErrorAction SilentlyContinue
            foreach ($exe in $exeFiles) {
                if ($exe.Name -notlike "*uninstall*" -and $exe.Name -notlike "*setup*") {
                    return $exe.FullName
                }
            }
        }
    }
    
    return $null
}

Write-Host "Searching for installed app..." -ForegroundColor Yellow
$appPath = Find-AppExecutable

if (-not $appPath) {
    Write-Error "UNETI Schedule Widget not found!"
    Write-Host ""
    Write-Host "Please install app first or specify path manually:" -ForegroundColor Yellow
    Write-Host '  .\run-with-server.ps1 -ServerIP "192.168.x.x"' -ForegroundColor Gray
    Write-Host ""
    Write-Host "Searched locations:" -ForegroundColor Gray
    Write-Host "  - Windows Registry (HKCU/HKLM)" -ForegroundColor Gray
    Write-Host "  - $env:LOCALAPPDATA\Programs\uneti-schedule-widget" -ForegroundColor Gray
    Write-Host "  - $env:ProgramFiles\uneti-schedule-widget" -ForegroundColor Gray
    exit 1
}

Write-Host "Found: $appPath" -ForegroundColor Green
Write-Host ""

try {
    $processInfo = New-Object System.Diagnostics.ProcessStartInfo
    $processInfo.FileName = $appPath
    $processInfo.UseShellExecute = $false
    $processInfo.EnvironmentVariables["USE_LOCAL_UPDATE_SERVER"] = "true"
    $processInfo.EnvironmentVariables["LOCAL_UPDATE_SERVER_URL"] = "http://${ServerIP}:8080"
    
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $processInfo
    $process.Start() | Out-Null
    
    Write-Host "App started successfully!" -ForegroundColor Green
    Write-Host "Update server: http://${ServerIP}:8080" -ForegroundColor Cyan
}
catch {
    Write-Error "Error starting app: $_"
    exit 1
}
