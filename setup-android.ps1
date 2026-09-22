<#
  阴盘奇门遁甲 · Android 构建链自动安装(JDK 21 + Android SDK)
  ------------------------------------------------------------------
  与 setup-windows.ps1 同思路: 全程免管理员、无 UAC 弹窗。
    · JDK 用官方 zip 解压到用户目录, 不走 winget/MSI(默认微软 OpenJDK 21, 失败自动回退 Adoptium)
    · Android SDK 用官方 commandline-tools zip + sdkmanager 拉组件
    · 环境变量只写用户级(JAVA_HOME / ANDROID_HOME / ANDROID_SDK_ROOT / PATH)
  幂等: 已存在的组件会跳过; 可反复运行。

  用法:
    npm run setup:android
    powershell -ExecutionPolicy Bypass -File setup-android.ps1
    powershell -ExecutionPolicy Bypass -File setup-android.ps1 -JdkDir D:\dev\jdk-21 -SdkDir D:\Android\Sdk

  装完后仍不能直接打 release APK —— 还缺签名密钥(android/qimen-release.keystore,
  该目录不入库, 需从原开发机拷入并配置 android/gradle.properties 口令), 详见 AGENTS.md。
#>
[CmdletBinding()]
param(
  [string]$JdkDir = 'D:\dev\jdk-21',
  [string]$SdkDir = 'D:\Android\Sdk',
  [string]$CompileSdk = '35',
  [string]$BuildTools = '35.0.0'
)

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'   # PS 5.1 的进度条会让 Invoke-WebRequest 慢十倍
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Step($t) { Write-Host ''; Write-Host "== $t" -ForegroundColor Cyan }
function Ok($m)   { Write-Host ("   [完成] " + $m) -ForegroundColor Green }
function Info($m) { Write-Host ("   " + $m) -ForegroundColor Gray }
function Bad($m)  { Write-Host ("   [失败] " + $m) -ForegroundColor Red }

function Get-RemoteFileName($url) { return ($url -split '/')[-1] }

function Save-Url($url, $dest) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  # 用 Invoke-WebRequest 而非 WebClient: 小文件两者都能通, 但近 200MB 的大文件在
  # 重定向链路上 WebClient 会以 "Unable to connect to the remote server" 失败。
  Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing -TimeoutSec 900
  $sw.Stop()
  $mb = (Get-Item $dest).Length / 1MB
  Info ("下载 {0} ({1:N1} MB, {2:N0} 秒, {3:N1} MB/s)" -f (Get-RemoteFileName $url), $mb, $sw.Elapsed.TotalSeconds, ($mb / $sw.Elapsed.TotalSeconds))
}

function Expand-ZipFast($zip, $dest) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null
  if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  [System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $dest)
}

function Add-UserPath($dir) {
  $p = [System.Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not $p) { $p = '' }
  if (($p -split ';') -contains $dir) { return $false }
  $new = if ($p.TrimEnd(';') -eq '') { $dir } else { $p.TrimEnd(';') + ';' + $dir }
  [System.Environment]::SetEnvironmentVariable('Path', $new, 'User')
  return $true
}

Write-Host ''
Write-Host '阴盘奇门遁甲 · Android 构建链安装' -ForegroundColor White
Info "JDK 目录      : $JdkDir"
Info "Android SDK   : $SdkDir"
Info "编译目标      : platform android-$CompileSdk + build-tools $BuildTools"

# ---------- 1. JDK 21 ----------
Step '1/5 JDK 21'
$javac = Join-Path $JdkDir 'bin\javac.exe'
if (Test-Path $javac) {
  Ok ("已存在, 跳过: " + ((& $javac -version) 2>&1))
} else {
  # 多源回退: Adoptium 的下载链接会 307 跳到 GitHub Releases, 那条链路在部分网络下
  # 大文件必然失败(实测 "Unable to connect to the remote server"), 故默认走微软 CDN。
  $zip = Join-Path $env:TEMP 'jdk21.zip'
  $sources = @(
    @{ Name = 'Microsoft OpenJDK 21 (微软 CDN)'; Url = 'https://aka.ms/download-jdk/microsoft-jdk-21-windows-x64.zip' },
    @{ Name = 'Adoptium Temurin 21 (经 GitHub Releases)'; Url = 'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse' }
  )
  if (Test-Path $zip) {
    Info '安装包已缓存, 跳过下载'
  } else {
    $got = $false
    foreach ($s in $sources) {
      try {
        Info ('源: ' + $s.Name)
        Save-Url $s.Url $zip
        $got = $true
        break
      } catch {
        Bad ('该源失败: ' + $_.Exception.Message)
        if (Test-Path $zip) { Remove-Item $zip -Force -ErrorAction SilentlyContinue }
      }
    }
    if (-not $got) { Bad ('所有 JDK 源均失败; 可手动下载 JDK 21 的 zip 放到: ' + $zip); exit 1 }
  }
  $tmp = Join-Path $env:TEMP 'jdk21-extract'
  Info '解压中 ...'
  Expand-ZipFast $zip $tmp
  # zip 内是一层版本目录(如 jdk-21.0.9+10), 取出来放到目标路径
  $inner = Get-ChildItem $tmp -Directory | Select-Object -First 1
  if (-not $inner) { Bad '压缩包结构异常'; exit 1 }
  New-Item -ItemType Directory -Force -Path (Split-Path $JdkDir -Parent) | Out-Null
  if (Test-Path $JdkDir) { Remove-Item $JdkDir -Recurse -Force }
  Move-Item $inner.FullName $JdkDir
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
  if (Test-Path $javac) { Ok ("安装完成: " + ((& $javac -version) 2>&1)) } else { Bad 'JDK 安装后未找到 javac'; exit 1 }
}

# ---------- 2. Android commandline-tools ----------
Step '2/5 Android commandline-tools'
$sdkmanager = Join-Path $SdkDir 'cmdline-tools\latest\bin\sdkmanager.bat'
if (Test-Path $sdkmanager) {
  Ok '已存在, 跳过'
} else {
  Info '从官方清单解析最新版 ...'
  $manifest = (Invoke-WebRequest 'https://dl.google.com/android/repository/repository2-3.xml' -UseBasicParsing -TimeoutSec 60).Content
  $idx = $manifest.IndexOf('cmdline-tools;latest')
  if ($idx -lt 0) { Bad '官方清单里找不到 cmdline-tools;latest'; exit 1 }
  $seg = $manifest.Substring($idx, [Math]::Min(20000, $manifest.Length - $idx))
  $m = [regex]::Match($seg, '<url>(commandlinetools-win-\d+_latest\.zip)</url>')
  if (-not $m.Success) { Bad '未能解析出 windows 版下载地址'; exit 1 }
  $url = 'https://dl.google.com/android/repository/' + $m.Groups[1].Value
  $zip = Join-Path $env:TEMP $m.Groups[1].Value
  if (-not (Test-Path $zip)) { Save-Url $url $zip } else { Info '安装包已缓存, 跳过下载' }
  $tmp = Join-Path $env:TEMP 'cmdline-tools-extract'
  Info '解压中 ...'
  Expand-ZipFast $zip $tmp
  $dest = Join-Path $SdkDir 'cmdline-tools\latest'
  New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent) | Out-Null
  if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
  # zip 内是 cmdline-tools/ 一层, 需重命名为 latest
  Move-Item (Join-Path $tmp 'cmdline-tools') $dest
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
  if (Test-Path $sdkmanager) { Ok '安装完成' } else { Bad 'commandline-tools 安装后未找到 sdkmanager.bat'; exit 1 }
}

# ---------- 3. 环境变量(用户级) ----------
Step '3/5 环境变量(用户级, 不需要管理员)'
[System.Environment]::SetEnvironmentVariable('JAVA_HOME', $JdkDir, 'User')
[System.Environment]::SetEnvironmentVariable('ANDROID_HOME', $SdkDir, 'User')
[System.Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT', $SdkDir, 'User')
Ok "JAVA_HOME        = $JdkDir"
Ok "ANDROID_HOME     = $SdkDir"
Ok "ANDROID_SDK_ROOT = $SdkDir"
foreach ($d in @((Join-Path $JdkDir 'bin'), (Join-Path $SdkDir 'cmdline-tools\latest\bin'), (Join-Path $SdkDir 'platform-tools'))) {
  if (Add-UserPath $d) { Ok "PATH += $d" } else { Info "PATH 已含 $d" }
}
# 本进程内生效, 供下面 sdkmanager / adb 直接调用
$env:JAVA_HOME = $JdkDir
$env:ANDROID_HOME = $SdkDir
$env:ANDROID_SDK_ROOT = $SdkDir
$env:Path = "$JdkDir\bin;$SdkDir\cmdline-tools\latest\bin;$SdkDir\platform-tools;" + $env:Path

# ---------- sdkmanager 通用调用入口 ----------
function Invoke-SdkManager($argLine, $timeoutMs) {
  # 只接管 stdin(喂 y 接受许可); stdout/stderr 直接透传到控制台 ——
  # 既能看到下载进度, 也避免重定向缓冲写满导致死锁。
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = 'cmd.exe'
  $psi.Arguments = "/c `"`"$sdkmanager`" $argLine`""
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput = $true
  $psi.CreateNoWindow = $false
  try {
    $p = [System.Diagnostics.Process]::Start($psi)
    try {
      1..120 | ForEach-Object { if (-not $p.HasExited) { $p.StandardInput.WriteLine('y') } }
    } catch { }
    try { $p.StandardInput.Close() } catch { }
    if (-not $p.WaitForExit($timeoutMs)) { try { $p.Kill() } catch { }; return -1 }
    return $p.ExitCode
  } catch {
    Bad ('调用 sdkmanager 失败: ' + $_.Exception.Message)
    return -1
  }
}

# ---------- 4. 接受许可 ----------
Step '4/5 接受 SDK 许可协议'
if ((Invoke-SdkManager '--licenses' 180000) -eq 0) { Ok '许可已全部接受' }
else { Info '许可步骤返回非零(新版 sdkmanager 的常见行为), 后续安装阶段会再次确认' }

# ---------- 5. 安装 SDK 组件 ----------
Step "5/5 安装 platform-tools / android-$CompileSdk / build-tools $BuildTools"
$pkgArgs = (@('platform-tools', "platforms;android-$CompileSdk", "build-tools;$BuildTools") | ForEach-Object { "`"$_`"" }) -join ' '
$rc = Invoke-SdkManager $pkgArgs 1800000
# 判定以产物为准: 新版 sdkmanager 会打印 "sdkmanager is deprecated" 警告,
# 且组件确实装好后退出码仍可能非 0 —— 只看退出码会误报失败(实测踩过)。
$aaptOk = Test-Path (Join-Path $SdkDir "build-tools\$BuildTools\aapt2.exe")
$jarOk  = Test-Path (Join-Path $SdkDir "platforms\android-$CompileSdk\android.jar")
$adbOk  = Test-Path (Join-Path $SdkDir 'platform-tools\adb.exe')
if ($aaptOk -and $jarOk -and $adbOk) { Ok '组件安装完成(以产物核实, 忽略 sdkmanager 退出码)' }
else { Bad ("组件安装未成功 (sdkmanager 退出码 $rc)") }

# ---------- 汇总 ----------
Step '汇总'
$javacNow = Join-Path $JdkDir 'bin\javac.exe'
if (Test-Path $javacNow) { Ok ('javac  : ' + ((& $javacNow -version) 2>&1)) } else { Bad 'javac 缺失' }
$adb = Join-Path $SdkDir 'platform-tools\adb.exe'
if (Test-Path $adb) { Ok ('adb    : ' + ((& $adb version) 2>&1 | Select-Object -First 1)) } else { Bad 'adb 缺失' }
foreach ($d in @("platforms\android-$CompileSdk", "build-tools\$BuildTools")) {
  $full = Join-Path $SdkDir $d
  if (Test-Path $full) { Ok ("已安装 : $d") } else { Bad ("缺失   : $d") }
}
Write-Host ''
Write-Host '  下一步: 本地打 APK 仍缺签名密钥 ——' -ForegroundColor White
Write-Host '    android/ 目录不入库, release 构建需要 android/qimen-release.keystore' -ForegroundColor DarkGray
Write-Host '    + android/gradle.properties 里的 QIMEN_STORE_PASSWORD / QIMEN_KEY_PASSWORD' -ForegroundColor DarkGray
Write-Host '    二者需从原开发机拷入; 只想试跑可用 debug 构建(无需签名)' -ForegroundColor DarkGray
Write-Host '  环境变量已写入用户级, 新开的终端生效。' -ForegroundColor DarkGray
Write-Host ''
