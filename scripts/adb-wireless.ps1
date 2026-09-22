<#
  阴盘奇门遁甲 · 无线调试连接(固定端口)
  ------------------------------------------------------------------
  Android 11+ 设置里的「无线调试」端口是随机的、无法固定; 这里改用经典 TCP/IP 模式,
  把手机 adbd 固定在 5555 端口。手机无 root, 故 persist.adb.tcp.port 改不了 ——
  **手机重启后 TCP 模式失效**, 需 USB 连一次并加 -Setup 重设。

  用法:
    npm run adb:wifi                 # 自动发现手机 IP 并连接
    npm run adb:wifi -- -Setup       # 通过 USB 重设 5555 后再连(手机重启后用这个)
    npm run adb:wifi -- -Ip 192.168.1.4
    npm run adb:wifi -- -Port 5556

  之后装包:
    <ANDROID_HOME>\platform-tools\adb.exe -s <手机IP>:5555 install -r android\app\build\outputs\apk\release\app-release.apk
#>
[CmdletBinding()]
param(
  [string]$Ip = '',
  [int]$Port = 5555,
  [switch]$Setup
)

$ErrorActionPreference = 'Continue'

function Step($t) { Write-Host ''; Write-Host "== $t" -ForegroundColor Cyan }
function Ok($m)   { Write-Host ("   [完成] " + $m) -ForegroundColor Green }
function Info($m) { Write-Host ("   " + $m) -ForegroundColor Gray }
function Bad($m)  { Write-Host ("   [失败] " + $m) -ForegroundColor Red }

# adb 位置: 优先环境变量, 退回 PATH
$sdk = [System.Environment]::GetEnvironmentVariable('ANDROID_HOME', 'User')
$adb = if ($sdk -and (Test-Path (Join-Path $sdk 'platform-tools\adb.exe'))) {
  Join-Path $sdk 'platform-tools\adb.exe'
} else {
  (Get-Command adb -ErrorAction SilentlyContinue).Source
}
if (-not $adb) { Bad 'adbd 未找到 —— 先跑 npm run setup:android'; exit 1 }
Info ("adb: " + $adb)

# 找 USB 设备(序列号不含 ":")
function Get-UsbSerial {
  $lines = & $adb devices 2>$null
  foreach ($l in $lines) {
    if ($l -match '^(\S+)\s+device') {
      $serial = $Matches[1]
      if ($serial -notmatch ':') { return $serial }
    }
  }
  return ''
}

Step '设备发现'
$usb = Get-UsbSerial
if ($usb) { Ok "USB 设备: $usb" } else { Info '没有 USB 连接的设备' }

# 地址来源优先级: -Ip 参数 > USB 探测 > 上次成功的记录
# (日常场景是手机只连 WiFi、不插 USB, 所以缓存这一路必须留)
$cacheFile = Join-Path $env:LOCALAPPDATA 'qimen-adb-wireless.txt'

if (-not $Ip -and $usb) {
  $route = & $adb -s $usb shell "ip route 2>/dev/null | grep wlan0" 2>$null
  if ("$route" -match 'src\s+(\d+\.\d+\.\d+\.\d+)') {
    $Ip = $Matches[1]
    Ok "手机 WiFi 地址(USB 探测): $Ip"
  } else {
    Info 'USB 设备在, 但读不到 wlan0 地址(手机可能没连 WiFi)'
  }
}

if (-not $Ip -and (Test-Path $cacheFile)) {
  $cached = ((Get-Content $cacheFile -Raw) -replace '\s','') -replace ':\d+$',''
  if ($cached -match '^\d+\.\d+\.\d+\.\d+$') {
    $Ip = $cached
    Info "使用上次记录的地址: $Ip"
  }
}

if (-not $Ip) {
  Bad '无法确定手机地址'
  Write-Host '   手机重启后首次需要 USB 连接并加 -Setup; 之后可只用 WiFi' -ForegroundColor Yellow
  Write-Host '   也可直接指定: npm run adb:wifi -- -Ip 192.168.1.4' -ForegroundColor Yellow
  exit 1
}

# 重设 TCP 模式(手机重启后必须做一次, 且需要 USB 连接)
if ($Setup) {
  Step "重设 TCP 模式 (端口 $Port)"
  if (-not $usb) {
    Bad '-Setup 需要 USB 连接的设备'
    exit 1
  }
  $r = & $adb -s $usb tcpip $Port 2>&1
  $r | ForEach-Object { Info $_ }
  Start-Sleep -Seconds 4
  Ok "手机 adbd 已在 $Port 监听"
}

Step "连接 $Ip`:$Port"
$out = & $adb connect "$Ip`:$Port" 2>&1
$out | ForEach-Object { Info $_ }
if ("$out" -notmatch 'connected') { Bad '连接失败(地址可能已变, 试试 -Ip 指定)'; exit 1 }
$Ip | Set-Content -Path $cacheFile -Encoding ASCII   # 记住这次成功的地址

Step '当前设备'
& $adb devices -l 2>&1 | ForEach-Object { Info $_ }

$target = "$Ip`:$Port"
$probe = & $adb -s $target shell getprop ro.product.model 2>&1
if ("$probe" -match '\S' -and "$probe" -notmatch 'error|not found') {
  Step '结果'
  Ok ("无线通道可用: " + $probe.Trim().Trim())
  Write-Host ''
  Write-Host "   后续命令请加 -s $target , 例如:" -ForegroundColor White
  Write-Host "     `"$adb`" -s $target install -r android\app\build\outputs\apk\release\app-release.apk" -ForegroundColor Gray
} else {
  Bad '已连接但读不到设备属性, 请检查手机端授权弹窗'
  exit 1
}
