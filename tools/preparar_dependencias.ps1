# CapiChad - (c) 2026 Capibara Software (OrtegaGhost) - AGPL-3.0-or-later - https://github.com/OrtegaGhost/capichad-ai
# Aviso de autoria: conserva este encabezado y el archivo NOTICE en copias y derivados.
#
# Arma las carpetas pesadas que NO estan en git y que el instalador empaqueta:
#   tools\python        Python 3.13 embebido + paquetes fijados (tools\requirements-embedded.txt)
#   tools\tesseract     Tesseract 5.4 + datos de idioma (spa, eng, osd) verificados con SHA-256
#   tools\modelos       u2net.onnx (quitar fondo), verificado con SHA-256
# Es la misma receta que usa la compilacion automatica (GitHub Actions), asi el instalador se puede reconstruir
# desde cero y su origen es verificable.
#
# Uso:  powershell -File tools\preparar_dependencias.ps1 [-Forzar] [-OmitirTesseract] [-TesseractOrigen <carpeta>]
[CmdletBinding()]
param(
  [string]$Raiz = (Split-Path -Parent $PSScriptRoot),
  [switch]$Forzar,
  [switch]$OmitirTesseract,
  [string]$TesseractOrigen = $env:TESSERACT_SRC
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

$tools = Join-Path $Raiz 'tools'
$PY_VERSION = '3.13.1'
$PY_URL = "https://www.python.org/ftp/python/$PY_VERSION/python-$PY_VERSION-embed-amd64.zip"
$PY_SHA = '7b7923ff0183a8b8fca90f6047184b419b108cb437f75fc1c002f9d2f8bcec16'
$GETPIP_URL = 'https://bootstrap.pypa.io/get-pip.py'
$TESS_VERSION = '5.4.0.20240606'
$TESSDATA = @(
  @{ n = 'spa.traineddata'; sha = '6f2e04d02774a18f01bed44b1111f2cd7f3ba7ac9dc4373cd3f898a40ea6b464' },
  @{ n = 'eng.traineddata'; sha = '7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2' },
  @{ n = 'osd.traineddata'; sha = '9cf5d576fcc47564f11265841e5ca839001e7e6f38ff7f7aacf46d15a96b00ff' })
$TESSDATA_BASE = 'https://github.com/tesseract-ocr/tessdata_fast/raw/main/'
$U2NET_URL = 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx'
$U2NET_SHA = '8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491'

function Paso($m) { Write-Host ""; Write-Host "=== $m" -ForegroundColor Cyan }
function Bajar($url, $dest, $sha) {
  New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
  for ($i = 1; $i -le 3; $i++) {
    try {
      Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing -UserAgent 'CapiChad-build/1.0'
      if ($sha) {
        $got = (Get-FileHash $dest -Algorithm SHA256).Hash.ToLower()
        if ($got -ne $sha.ToLower()) { Remove-Item $dest -Force; throw "SHA-256 distinto en $url (esperado $sha, obtenido $got)" }
      }
      return
    } catch { if ($i -eq 3) { throw } ; Start-Sleep 3 }
  }
}

# ---------- 1) Python embebido ----------
$pyDir = Join-Path $tools 'python'; $pyExe = Join-Path $pyDir 'python.exe'
if ((Test-Path $pyExe) -and -not $Forzar) { Paso "Python embebido: ya existe (usa -Forzar para rehacerlo)" }
else {
  Paso "Python $PY_VERSION embebido + paquetes fijados"
  if (Test-Path $pyDir) { Remove-Item $pyDir -Recurse -Force }
  $zip = Join-Path $env:TEMP "py-embed-$PY_VERSION.zip"
  Bajar $PY_URL $zip $PY_SHA
  Expand-Archive -Path $zip -DestinationPath $pyDir -Force
  Remove-Item $zip -Force
  $pth = Get-ChildItem $pyDir -Filter 'python3*._pth' | Select-Object -First 1
  Set-Content -Path $pth.FullName -Encoding ascii -Value @("python313.zip", ".", "Lib\site-packages", "", "import site")
  $gp = Join-Path $env:TEMP 'get-pip.py'; Bajar $GETPIP_URL $gp $null
  # Aislamiento: sin esto pip da por "ya instalado" lo que haya en el sitio de usuario (AppData\Roaming\Python) y el
  # Python embebido quedaria incompleto en equipos con otros Python instalados.
  $env:PYTHONNOUSERSITE = '1'
  & $pyExe $gp --no-warn-script-location --disable-pip-version-check
  if ($LASTEXITCODE) { throw "get-pip fallo ($LASTEXITCODE)" }
  & $pyExe -m pip install --no-warn-script-location --disable-pip-version-check -r (Join-Path $tools 'requirements-embedded.txt')
  if ($LASTEXITCODE) { throw "pip install fallo ($LASTEXITCODE)" }
  & $pyExe -m pip uninstall -y pip | Out-Null
  foreach ($d in 'Scripts', 'Lib\site-packages\__pycache__') { $p = Join-Path $pyDir $d; if (Test-Path $p) { Remove-Item $p -Recurse -Force } }
  Remove-Item $gp -Force -ErrorAction SilentlyContinue
  & $pyExe -I -c "import pymupdf, libzim, onnxruntime, numpy, PIL; print('Python embebido OK:', pymupdf.__doc__.split(chr(10))[0][:40], '| numpy', numpy.__version__, '| onnxruntime', onnxruntime.__version__)"
  if ($LASTEXITCODE) { throw "las bibliotecas del Python embebido no cargan" }
}

# ---------- 2) Tesseract ----------
$tessDir = Join-Path $tools 'tesseract'
if ($OmitirTesseract) { Paso "Tesseract: omitido por -OmitirTesseract" }
elseif ((Test-Path (Join-Path $tessDir 'tesseract.exe')) -and -not $Forzar) { Paso "Tesseract: ya existe (usa -Forzar para rehacerlo)" }
else {
  Paso "Tesseract $TESS_VERSION + datos de idioma"
  $cands = @($TesseractOrigen, 'C:\Program Files\Tesseract-OCR', (Join-Path $env:LOCALAPPDATA 'Programs\Tesseract-OCR')) | Where-Object { $_ }
  $src = $cands | Where-Object { Test-Path (Join-Path $_ 'tesseract.exe') } | Select-Object -First 1
  if (-not $src) {
    if (Get-Command choco -ErrorAction SilentlyContinue) {
      Write-Host "Instalando Tesseract con Chocolatey..."
      choco install tesseract --version=$TESS_VERSION -y --no-progress | Out-Host
      $src = 'C:\Program Files\Tesseract-OCR'
    }
  }
  if (-not $src -or -not (Test-Path (Join-Path $src 'tesseract.exe'))) {
    throw "No se encontro Tesseract. Instalalo (https://github.com/UB-Mannheim/tesseract/wiki) o pasa -TesseractOrigen <carpeta>."
  }
  if (Test-Path $tessDir) { Remove-Item $tessDir -Recurse -Force }
  New-Item -ItemType Directory -Force $tessDir | Out-Null
  Copy-Item -Path (Join-Path $src '*') -Destination $tessDir -Recurse -Force
  Get-ChildItem $tessDir -Filter 'unins*' -ErrorAction SilentlyContinue | Remove-Item -Force
  foreach ($t in $TESSDATA) { Bajar ($TESSDATA_BASE + $t.n) (Join-Path $tessDir ('tessdata\' + $t.n)) $t.sha }
  & (Join-Path $tessDir 'tesseract.exe') --version 2>&1 | Select-Object -First 1 | Out-Host
  $langs = & (Join-Path $tessDir 'tesseract.exe') --list-langs --tessdata-dir (Join-Path $tessDir 'tessdata') 2>&1 | Out-String
  if ($langs -notmatch 'spa' -or $langs -notmatch 'eng') { throw "Tesseract sin los idiomas spa/eng" }
}

# ---------- 3) Modelo de quitar fondo ----------
$u2 = Join-Path $tools 'modelos\u2net.onnx'
if ((Test-Path $u2) -and -not $Forzar -and ((Get-FileHash $u2 -Algorithm SHA256).Hash.ToLower() -eq $U2NET_SHA)) { Paso "u2net.onnx: ya existe y coincide" }
else { Paso "u2net.onnx (176 MB)"; Bajar $U2NET_URL $u2 $U2NET_SHA }

Paso "Listo: herramientas preparadas en $tools"
