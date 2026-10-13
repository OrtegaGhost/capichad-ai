# CapiChad - (c) 2026 Capibara Software (OrtegaGhost) - AGPL-3.0-or-later - https://github.com/OrtegaGhost/capichad-ai
# Aviso de autoria: conserva este encabezado y el archivo NOTICE en copias y derivados.
# Arranca el enrutador de CapiChad en segundo plano (http://127.0.0.1:11500/v1)
# Solo lo necesita OpenCode; el chat y el modo Programar de la app hablan directo con Ollama.
$py = Join-Path $env:LOCALAPPDATA 'Programs\CapiChad\resources\tools\python\python.exe'
if (-not (Test-Path $py)) { $py = (Get-Command python.exe -ErrorAction Stop).Source }
$script = Join-Path $PSScriptRoot 'capichad_router.py'
$log = 'C:\ProgramData\CapiChad\router.log'
if (Get-CimInstance Win32_Process -Filter "Name='python.exe'" | ? { $_.CommandLine -like '*capichad_router.py*' }) { 'El enrutador ya esta corriendo.'; return }
Start-Process $py -ArgumentList '-u', "`"$script`"" -WindowStyle Hidden -RedirectStandardError $log
Start-Sleep 2
try { (Invoke-RestMethod http://127.0.0.1:11500/status -TimeoutSec 5) | ConvertTo-Json -Depth 3 } catch { "No respondio: $_" }
