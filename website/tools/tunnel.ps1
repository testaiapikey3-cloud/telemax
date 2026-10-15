# TeleMAX Web - public tunnel via ssh + localhost.run (ASCII only)
# Run: TUNNEL.bat (or: powershell -ExecutionPolicy Bypass -File tools\tunnel.ps1)
$ErrorActionPreference = 'Continue'
$log = Join-Path $PSScriptRoot 'tunnel-out.txt'
Remove-Item $log -ErrorAction SilentlyContinue

Write-Host '================================================'
Write-Host '  TeleMAX public tunnel (localhost.run)'
Write-Host ''
Write-Host '  KEEP THIS WINDOW OPEN while the link is used.'
Write-Host '  Close this window to stop public access.'
Write-Host '================================================'
Write-Host ''

& cmd /c "ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -o ServerAliveInterval=20 -o ServerAliveCountMax=3 -R 80:127.0.0.1:8080 nokey@localhost.run 2>&1" | Tee-Object -FilePath $log

Write-Host ''
Write-Host 'Tunnel stopped.'
Read-Host 'Press Enter to close'
