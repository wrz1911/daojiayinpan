<#
  阴盘奇门遁甲 · 本地 Android 构建(一体化)
  ------------------------------------------------------------------
  把 CI 的 android job 在本地复现成一条命令, 并自动处理国内网络必须的两处镜像/超时配置
  (android/ 是生成目录、不入库, 每次 `cap add android` 都会重建, 所以补丁必须每次重打)。

  用法:
    npm run build:android                 # 出 debug 包(无需签名)
    npm run build:android -- -Release     # 出 release 包(需 keystore, 见下)
    npm run build:android -- -SkipWeb     # 跳过 www 资源准备(仅重编译)

  release 包的前置条件(二者都不入库, 需自行准备):
    · android/qimen-release.keystore        —— 项目正式签名密钥
    · android/gradle.properties 中的
      QIMEN_STORE_PASSWORD / QIMEN_KEY_PASSWORD
    缺任一者时本脚本会明确拒绝打 release, 而不是产出一个签名不对的包。
#>
[CmdletBinding()]
param(
  [switch]$Release,
  [switch]$SkipWeb
)

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

function Step($t) { Write-Host ''; Write-Host "== $t" -ForegroundColor Cyan }
function Ok($m)   { Write-Host ("   [完成] " + $m) -ForegroundColor Green }
function Info($m) { Write-Host ("   " + $m) -ForegroundColor Gray }
function Bad($m)  { Write-Host ("   [失败] " + $m) -ForegroundColor Red }
function Die($m)  { Bad $m; exit 1 }

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# ---------- 0. 环境 ----------
Step '环境检查'
$jdkHome = [System.Environment]::GetEnvironmentVariable('JAVA_HOME', 'User')
$sdkHome = [System.Environment]::GetEnvironmentVariable('ANDROID_HOME', 'User')
if (-not $jdkHome -or -not (Test-Path (Join-Path $jdkHome 'bin\javac.exe'))) {
  Die 'JAVA_HOME 未配置或无效 —— 先跑 npm run setup:android'
}
if (-not $sdkHome -or -not (Test-Path (Join-Path $sdkHome 'platform-tools\adb.exe'))) {
  Die 'ANDROID_HOME 未配置或无效 —— 先跑 npm run setup:android'
}
# 让 gradle/node 子进程继承正确环境
$env:JAVA_HOME = $jdkHome
$env:ANDROID_HOME = $sdkHome
$env:ANDROID_SDK_ROOT = $sdkHome
if (-not $env:GRADLE_USER_HOME) {
  $gh = [System.Environment]::GetEnvironmentVariable('GRADLE_USER_HOME', 'User')
  if ($gh) { $env:GRADLE_USER_HOME = $gh }
}
$env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
            [System.Environment]::GetEnvironmentVariable('Path', 'User')
Ok ("JDK  : " + ((& (Join-Path $jdkHome 'bin\javac.exe') -version) 2>&1))
Ok ("SDK  : " + $sdkHome)
Info ("Gradle 缓存: " + $(if ($env:GRADLE_USER_HOME) { $env:GRADLE_USER_HOME } else { '(默认位置)' }))

# ---------- 1. www 资源 ----------
if (-not $SkipWeb) {
  Step '1/6 准备 www 资源(与 CI 的 Setup www dir 一致)'
  Remove-Item www -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path www\qimen_app\css,www\qimen_app\js | Out-Null
  $idx = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">' +
         '<meta http-equiv="refresh" content="0;url=qimen_app/yinpan.html">' +
         '<script>window.location.replace(''qimen_app/yinpan.html'');</script></head><body></body></html>'
  Set-Content -Path www\index.html -Value $idx -Encoding ASCII
  npm run build:bundle 2>&1 | Select-Object -Last 2 | ForEach-Object { Info $_ }
  Copy-Item qimen_app\css\yinpan_app.min.css www\qimen_app\css\yinpan_app.css -Force
  Copy-Item qimen_app\js\qimen_bundle.min.js www\qimen_app\js\ -Force
  Copy-Item qimen_app\js\tyme4j-browser.js   www\qimen_app\js\ -Force
  Copy-Item qimen_app\js\gong_detail_data.js www\qimen_app\js\ -Force
  Copy-Item qimen_app\yinpan.html            www\qimen_app\ -Force
  Ok ("www 资源就绪: " + (Get-ChildItem www -Recurse -File | Measure-Object).Count + ' 个文件')
} else {
  Step '1/6 跳过 www 资源准备(-SkipWeb)'
}

# ---------- 2. Android 工程 ----------
Step '2/6 Android 工程'
if (-not (Test-Path 'android')) {
  Info 'android/ 不存在, 执行 npx cap add android ...'
  npx cap add android 2>&1 | Select-Object -Last 4 | ForEach-Object { Info $_ }
  if (-not (Test-Path 'android')) { Die 'cap add android 失败' }
  Ok 'android 工程已生成'
} else {
  Ok 'android/ 已存在, 跳过创建'
}

# ---------- 3. cap sync ----------
Step '3/6 同步 web 资源到工程'
npx cap sync 2>&1 | Select-Object -Last 4 | ForEach-Object { Info $_ }
Ok 'cap sync 完成'

# ---------- 4. 网络补丁(幂等) ----------
Step '4/6 网络补丁(国内必需)'
# 4a) Gradle 发行版: 官方 services.gradle.org 在国内会失败(重定向后连接被拒),
#     且 wrapper 默认 networkTimeout=10000 对拉取 ~200MB 太短。
$wrapper = 'android\gradle\wrapper\gradle-wrapper.properties'
if (Test-Path $wrapper) {
  $lines = Get-Content $wrapper
  $ver = ''
  foreach ($l in $lines) {
    $m = [regex]::Match($l, 'gradle-([\d.]+)-(all|bin)\.zip')
    if ($m.Success) { $ver = $m.Groups[1].Value; $kind = $m.Groups[2].Value }
  }
  if (-not $ver) { $ver = '8.11.1'; $kind = 'all' }
  $mirror = "distributionUrl=https\://mirrors.cloud.tencent.com/gradle/gradle-$ver-$kind.zip"
  $changed = $false
  $out = foreach ($l in $lines) {
    if ($l -match '^distributionUrl=') { if ($l -ne $mirror) { $changed = $true }; $mirror }
    elseif ($l -match '^networkTimeout=') { if ($l -ne 'networkTimeout=120000') { $changed = $true }; 'networkTimeout=120000' }
    else { $l }
  }
  if ($changed) { Set-Content -Path $wrapper -Value $out -Encoding ASCII; Ok "Gradle 镜像 → 腾讯云 (gradle-$ver-$kind.zip), 超时 120s" }
  else { Ok 'Gradle 镜像已是目标配置' }
} else { Bad '找不到 gradle-wrapper.properties' }

# 4b) Maven 依赖: google()/mavenCentral() 直连较慢, 阿里云镜像快两个数量级
$bg = 'android\build.gradle'
if (Test-Path $bg) {
  $c = Get-Content $bg -Raw
  if ($c -notmatch 'maven\.aliyun\.com') {
    $c = $c -creplace 'google\(\)', "maven { url 'https://maven.aliyun.com/repository/google' }`r`n        google()"
    $c = $c -creplace 'mavenCentral\(\)', "maven { url 'https://maven.aliyun.com/repository/public' }`r`n        mavenCentral()"
    Set-Content -Path $bg -Value $c -Encoding ASCII
    Ok 'Maven 镜像 → 阿里云(google / public)'
  } else { Ok 'Maven 镜像已配置' }
}

# 4c) SDK 路径
"sdk.dir=" + ($sdkHome -replace '\\','/') | Set-Content -Path 'android\local.properties' -Encoding ASCII
Ok 'local.properties 已写入 sdk.dir'

# ---------- 5. 版本号与签名 ----------
Step '5/6 版本号与签名配置'
$pkg = Get-Content 'package.json' -Raw | ConvertFrom-Json
$verName = $pkg.version
$parts = $verName.Split('.')
$verCode = ([int]$parts[0] * 10000) + ([int]$parts[1] * 100) + [int]$parts[2]
$abg = 'android\app\build.gradle'
if (Test-Path $abg) {
  $c = Get-Content $abg -Raw
  $c = $c -replace 'versionCode \d+', "versionCode $verCode"
  $c = $c -replace 'versionName "[^"]*"', "versionName `"$verName`""
  Set-Content -Path $abg -Value $c -Encoding ASCII
  Ok "版本号 → $verName / $verCode (取自 package.json)"
}

$keystore = 'android\qimen-release.keystore'
$hasKey = Test-Path $keystore
$hasPwd = $false
$gp = 'android\gradle.properties'
if (Test-Path $gp) { $hasPwd = ((Get-Content $gp -Raw) -match 'QIMEN_STORE_PASSWORD') }
Info ("keystore: " + $(if ($hasKey) { $keystore } else { '不存在' }) + "   口令配置: " + $(if ($hasPwd) { '有' } else { '无' }))

if ($Release) {
  if (-not $hasKey -or -not $hasPwd) {
    Bad 'release 构建需要签名密钥, 当前缺失:'
    if (-not $hasKey) { Bad "  · $keystore" }
    if (-not $hasPwd) { Bad '  · android/gradle.properties 里的 QIMEN_STORE_PASSWORD / QIMEN_KEY_PASSWORD' }
    Write-Host '   两者都不入库, 需从原开发机拷入(旧密钥归档在原开发机的 ~/qimen-sign-old/)。' -ForegroundColor Yellow
    Write-Host '   若改用新生成的密钥, 签名会变 —— 老用户必须先卸载再安装。' -ForegroundColor Yellow
    Write-Host '   只想验证编译请去掉 -Release(出 debug 包)。' -ForegroundColor Yellow
    exit 1
  }
  # 注意: Gradle 的 rootProject 是 android/(settings.gradle 所在), 而本项目把密钥放在
  # android/qimen-release.keystore —— 所以是 file('qimen-release.keystore')。
  # CI 用的是仓库根的那份, 故其配置写作 file('../qimen-release.keystore'), 两者别混。
  if ($c -notmatch 'signingConfigs') {
    Add-Content -Path $abg -Value @"

android {
    signingConfigs {
        release {
            storeFile rootProject.file('qimen-release.keystore')
            storePassword project.findProperty('QIMEN_STORE_PASSWORD')
            keyAlias 'qimen'
            keyPassword project.findProperty('QIMEN_KEY_PASSWORD')
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
"@
    Ok '已注入 release 签名配置'
  } else { Ok '签名配置已存在' }
}

# ---------- 6. 编译 ----------
$task = if ($Release) { 'assembleRelease' } else { 'assembleDebug' }
Step "6/6 编译 ($task)"
$sw = [System.Diagnostics.Stopwatch]::StartNew()
Push-Location android
& .\gradlew.bat $task --no-daemon 2>&1 | Select-Object -Last 12 | ForEach-Object { Info $_ }
$code = $LASTEXITCODE
Pop-Location
$sw.Stop()

Step '结果'
if ($code -ne 0) { Die ("gradle 退出码 $code, 耗时 {0:N1} 分钟" -f $sw.Elapsed.TotalMinutes) }
$kind = if ($Release) { 'release' } else { 'debug' }
$apk = "android\app\build\outputs\apk\$kind\app-$kind.apk"
if (Test-Path $apk) {
  $f = Get-Item $apk
  Ok ("产物: {0}  ({1:N2} MB, 耗时 {2:N1} 分钟)" -f $f.FullName, ($f.Length / 1MB), $sw.Elapsed.TotalMinutes)
  Write-Host ''
  Write-Host '   安装到已连接的设备: ' -ForegroundColor White
  Write-Host ("     " + (Join-Path $sdkHome 'platform-tools\adb.exe') + " install -r `"$($f.FullName)`"") -ForegroundColor Gray
} else { Die "未找到产物 $apk" }
