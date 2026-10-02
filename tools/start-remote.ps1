# リモート確認用：ゲームのサーバーと Cloudflare の一時URL（トンネル）をまとめて起動する
#   powershell -ExecutionPolicy Bypass -File tools\start-remote.ps1
# 表示された https://〜.trycloudflare.com を Quest のブラウザで開く。
# URL は起動するたびに変わり、この画面を閉じる（Ctrl+C）と使えなくなる。
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$port = 8080

# cloudflared を探す（PATH → ユーザーフォルダ）
$cf = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cf) {
  $local = Join-Path $env:LOCALAPPDATA 'Programs\cloudflared\cloudflared.exe'
  if (Test-Path $local) { $cf = $local }
}
if (-not $cf) {
  Write-Host 'cloudflared が見つかりません。次のどちらかで入れてください:' -ForegroundColor Yellow
  Write-Host '  winget install --id Cloudflare.cloudflared'
  Write-Host '  または https://github.com/cloudflare/cloudflared/releases から cloudflared-windows-amd64.exe を'
  Write-Host "  $env:LOCALAPPDATA\Programs\cloudflared\cloudflared.exe に置く"
  exit 1
}

# サーバーがまだ動いていなければ起動
$running = $false
try { Invoke-WebRequest -Uri "http://localhost:$port/" -UseBasicParsing -TimeoutSec 2 | Out-Null; $running = $true } catch { }
$server = $null
if (-not $running) {
  $server = Start-Process -FilePath node -ArgumentList 'server.js', "$port", '--https' -WorkingDirectory $root -PassThru -WindowStyle Minimized
  Start-Sleep -Seconds 1
}

Write-Host 'Cloudflare の一時URLを作っています…（数秒かかります）' -ForegroundColor Cyan
# cloudflared はログを標準エラーに出すため、ここではエラーで止めない（Windows PowerShell 5.1 対策）
$ErrorActionPreference = 'Continue'
try {
  & $cf tunnel --url "http://localhost:$port" --no-autoupdate 2>&1 | ForEach-Object {
    $line = "$_"
    if ($line -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
      Write-Host ''
      Write-Host "  Quest のブラウザで開く:  $($Matches[0])" -ForegroundColor Green
      Write-Host '  （終了するときはこの画面で Ctrl+C）'
      Write-Host ''
    }
  }
} finally {
  if ($server) { Stop-Process -Id $server.Id -ErrorAction SilentlyContinue }
}
