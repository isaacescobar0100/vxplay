# Publica una version en GitHub Releases y sube el instalador.
#
# Uso, despues de correr `npm run dist`:
#   .\scripts\publicar-release.ps1 -Version 1.1.9 -Notas "que cambio en esta version"
#
# Usa la credencial de GitHub que ya tiene guardada git en este equipo (la misma
# de `git push`): no pide token ni la muestra en pantalla.
#
# Es idempotente: si el release ya existe no lo duplica, y omite los archivos que
# ya estaban subidos. Si se corta a mitad, se vuelve a correr y sigue donde iba.
param(
  [Parameter(Mandatory = $true)][string]$Version,
  [string]$Notas = '',
  [string]$Rel = (Join-Path $PSScriptRoot '..\release')
)
$ErrorActionPreference = 'Stop'

$owner = 'isaacescobar0100'
$repo  = 'vxplay'
$tag   = "v$Version"

# --- credencial de GitHub ---
$tmp = Join-Path $env:TEMP 'credin.txt'
"protocol=https`nhost=github.com`n" | Set-Content -Path $tmp -Encoding ascii -NoNewline
Add-Content -Path $tmp -Value "" -Encoding ascii
$cred = & cmd /c "git credential fill < `"$tmp`""
Remove-Item $tmp -Force -ErrorAction SilentlyContinue
$token = ($cred | Where-Object { $_ -like 'password=*' }) -replace '^password=', ''
if (-not $token) { throw 'No se pudo leer la credencial de GitHub. Haz un `git push` primero para que quede guardada.' }

$headers = @{
  Authorization          = "Bearer $token"
  'User-Agent'           = 'vxplay-release'
  Accept                 = 'application/vnd.github+json'
  'X-GitHub-Api-Version' = '2022-11-28'
}

# --- crear el release (o reusarlo si ya existe) ---
try {
  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/releases/tags/$tag" -Headers $headers
  Write-Output "El release $tag YA existe (id $($release.id)). No se crea de nuevo."
} catch {
  $body = @{
    tag_name         = $tag
    target_commitish = 'main'
    name             = $tag
    body             = $Notas
    draft            = $false
    prerelease       = $false
    make_latest      = 'true'
  } | ConvertTo-Json -Depth 3
  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/releases" `
    -Headers $headers -Method Post -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) -ContentType 'application/json'
  Write-Output "Release creado: $($release.tag_name) (id $($release.id))"
}

# --- subir los 3 archivos que lee el actualizador ---
# latest.yml es el que hace que los POS instalados detecten la version nueva:
# sin el, nadie se actualiza aunque el .exe este publicado.
$uploadBase = ($release.upload_url -replace '\{\?name,label\}$', '')
$archivos = @("VxPlay-Setup-$Version.exe", "VxPlay-Setup-$Version.exe.blockmap", 'latest.yml')
$yaSubidos = @($release.assets | ForEach-Object { $_.name })

foreach ($f in $archivos) {
  if ($yaSubidos -contains $f) { Write-Output "  $f ya estaba subido, se omite"; continue }
  $ruta = Join-Path $Rel $f
  if (-not (Test-Path $ruta)) { throw "No existe $ruta. Corre `npm run dist` antes." }
  $mb = [math]::Round((Get-Item $ruta).Length / 1MB, 2)
  Write-Output "  subiendo $f ($mb MB)..."
  $r = Invoke-RestMethod -Uri "$uploadBase`?name=$f" -Headers $headers -Method Post `
    -InFile $ruta -ContentType 'application/octet-stream' -TimeoutSec 900
  Write-Output "    ok: $($r.name) -> $($r.state)"
}

Write-Output "LISTO: https://github.com/$owner/$repo/releases/tag/$tag"
