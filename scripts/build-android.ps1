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
  [switch]$SkipWeb,
  [switch]$NoDeploy
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
  Step '1/7 准备 www 资源(与 CI 的 Setup www dir 一致)'
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
  Step '1/7 跳过 www 资源准备(-SkipWeb)'
}

# ---------- 2. Android 工程 ----------
Step '2/7 Android 工程'
if (-not (Test-Path 'android')) {
  Info 'android/ 不存在, 执行 npx cap add android ...'
  npx cap add android 2>&1 | Select-Object -Last 4 | ForEach-Object { Info $_ }
  if (-not (Test-Path 'android')) { Die 'cap add android 失败' }
  Ok 'android 工程已生成'
} else {
  Ok 'android/ 已存在, 跳过创建'
}

# ---------- 3. cap sync ----------
Step '3/7 同步 web 资源到工程'
npx cap sync 2>&1 | Select-Object -Last 4 | ForEach-Object { Info $_ }
Ok 'cap sync 完成'

# ---------- 4. 网络补丁(幂等) ----------
Step '4/7 网络补丁(国内必需)'
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

# ---------- 5. CI 对齐补丁 ----------
# 复现 release.yml 里 android job 的全部定制; android/ 是生成目录, 每次重建后都要重打。
Step '5/7 CI 对齐补丁(复现 release.yml 的 android job)'
$resDir    = 'android\app\src\main\res'
$appGradle = 'android\app\build.gradle'
$manifest  = 'android\app\src\main\AndroidManifest.xml'

# 5a) SDK 版本: CI 把 minSdk 提到 31、targetSdk 压到 34
#     (targetSdk 35 起 Android 15 强制 edge-to-edge, 主题里的 statusBarColor 会被忽略而变透明)
$vg = 'android\variables.gradle'
if (Test-Path $vg) {
  $c = Get-Content $vg -Raw
  $c = $c -replace 'minSdkVersion\s*=\s*\d+', 'minSdkVersion = 31'
  $c = $c -replace 'targetSdkVersion\s*=\s*\d+', 'targetSdkVersion = 34'
  Set-Content -Path $vg -Value $c -Encoding ASCII
  Ok 'variables.gradle → minSdk 31 / targetSdk 34'
} else { Bad '找不到 variables.gradle' }

# 5b) 状态栏做成不透明实色(与页面顶部装饰条同色)
$styles = Join-Path $resDir 'values\styles.xml'
if ((Test-Path $styles) -and ((Get-Content $styles -Raw) -notmatch 'statusBarColor')) {
  $c = Get-Content $styles -Raw
  $rep = "`$1<item name=`"android:background`">@null</item>`r`n" +
         "`$1<item name=`"android:statusBarColor`">#ffffff</item>`r`n" +
         "`$1<item name=`"android:windowLightStatusBar`">true</item>`r`n" +
         "`$1<item name=`"android:windowTranslucentStatus`">false</item>`r`n" +
         "`$1<item name=`"android:windowDrawsSystemBarBackgrounds`">true</item>"
  $c = $c -replace '(\s*)<item name="android:background">@null</item>', $rep
  Set-Content -Path $styles -Value $c -Encoding ASCII
  Ok 'values/styles.xml → 不透明状态栏 + 深色图标'
} else { Ok 'values/styles.xml 已配置' }

# 5c) 暗色模式: 同名 style 会整体替换 values/ 里的定义, 故必须写全各项
$nightDir = Join-Path $resDir 'values-night'
New-Item -ItemType Directory -Force -Path $nightDir | Out-Null
$nightXml = @(
  '<?xml version="1.0" encoding="utf-8"?>',
  '<resources>',
  '    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">',
  '        <item name="windowActionBar">false</item>',
  '        <item name="windowNoTitle">true</item>',
  '        <item name="android:background">@null</item>',
  '        <item name="android:statusBarColor">#1b1b1b</item>',
  '        <item name="android:windowLightStatusBar">false</item>',
  '        <item name="android:windowTranslucentStatus">false</item>',
  '        <item name="android:windowDrawsSystemBarBackgrounds">true</item>',
  '    </style>',
  '</resources>'
) -join "`r`n"
Set-Content -Path (Join-Path $nightDir 'styles.xml') -Value $nightXml -Encoding ASCII
Ok 'values-night/styles.xml → 暗色状态栏'

# 5d) R8 混淆 + 资源压缩
if (Test-Path $appGradle) {
  $c = Get-Content $appGradle -Raw
  $c = $c -replace 'minifyEnabled\s+false', 'minifyEnabled true'
  if ($c -notmatch 'shrinkResources') { $c = $c -replace '(minifyEnabled true)', "`$1`r`n            shrinkResources true" }
  $c = $c -replace 'proguard-android\.txt', 'proguard-android-optimize.txt'
  Set-Content -Path $appGradle -Value $c -Encoding ASCII
  Ok 'app/build.gradle → R8 + shrinkResources + optimize 规则'
}

# 5e) ProGuard: 保留 Capacitor 与 JS 桥接方法
$pg = 'android\app\proguard-rules.pro'
if ((Test-Path $pg) -and ((Get-Content $pg -Raw) -notmatch 'com\.getcapacitor')) {
  Add-Content -Path $pg -Value "`r`n-keep class com.getcapacitor.** { *; }`r`n-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }"
  Ok 'proguard-rules.pro → 保留 Capacitor / JavascriptInterface'
}

# 5f) 清单: 硬件加速 + 移除 SMS 相关权限(WebView 依赖可能注入)
if (Test-Path $manifest) {
  $c = Get-Content $manifest -Raw
  if ($c -notmatch 'hardwareAccelerated') { $c = $c -replace '<application', '<application android:hardwareAccelerated="true"' }
  if ($c -notmatch 'xmlns:tools') { $c = $c -replace '<manifest ', '<manifest xmlns:tools="http://schemas.android.com/tools" ' }
  if ($c -notmatch 'permission\.SMS') {
    $perms = "    <uses-permission android:name=`"android.permission.SMS`" tools:node=`"remove`" />`r`n" +
             "    <uses-permission android:name=`"android.permission.RECEIVE_SMS`" tools:node=`"remove`" />`r`n" +
             "    <uses-permission android:name=`"android.permission.SEND_SMS`" tools:node=`"remove`" />`r`n" +
             "    <uses-permission android:name=`"android.permission.READ_SMS`" tools:node=`"remove`" />`r`n" +
             "    <uses-permission android:name=`"android.permission.BROADCAST_SMS`" tools:node=`"remove`" />`r`n"
    $c = $c -replace '<application', ($perms + '<application')
  }
  Set-Content -Path $manifest -Value $c -Encoding ASCII
  Ok 'AndroidManifest → 硬件加速 + 移除 SMS 权限'
}

# 5g) 图标: 用 taiji.svg 生成 5 档 PNG, 并删掉会盖住它的自适应图标定义。
#     CI 用 ImageMagick 的 convert, 本机没有 —— scripts/make_launcher_icons.py 用
#     svglib + Pillow 复现同样的"#f5f5f5 底 + 等比缩放 + 居中 + extent"效果。
if ((Test-Path 'taiji.svg') -and (Test-Path 'scripts\make_launcher_icons.py') -and (Get-Command python -ErrorAction SilentlyContinue)) {
  & python 'scripts\make_launcher_icons.py' 'taiji.svg' $resDir 2>&1 | Select-Object -Last 1 | ForEach-Object { Info $_ }
  $anydpi = Join-Path $resDir 'mipmap-anydpi-v26'
  if (Test-Path $anydpi) { Get-ChildItem $anydpi -Filter '*.xml' -ErrorAction SilentlyContinue | Remove-Item -Force }
  Get-ChildItem $resDir -Directory -Filter 'drawable*' -ErrorAction SilentlyContinue | ForEach-Object {
    Get-ChildItem $_.FullName -Filter 'ic_launcher*.xml' -ErrorAction SilentlyContinue | Remove-Item -Force
  }
  Ok '图标 → taiji.svg 生成的 5 档 PNG(自适应图标定义已清理)'
} else { Info '跳过图标生成(缺 taiji.svg / 生成脚本 / python)' }

# ---------- 6. 版本号与签名 ----------
# 5h) 固定 WebView 字体缩放
#     Capacitor 7 生成的 MainActivity 是**空类**(只有 extends BridgeActivity, 没有 onCreate),
#     不能"替换 super.onCreate 后插一行" —— 直接整体重写这个生成文件。
#     盘面按设计尺寸精确排布, 继承系统 font_scale(实测 1.25 倍)会把信息表从 ~216px 撑到
#     270px, 吃掉三分之一屏; Capacitor 没有对应配置项, 只能改 Java。
#     注意: Java 源码里**只用英文注释** —— javac 在 Windows 默认按平台编码读源文件,
#     中文注释可能乱码甚至吃掉整行代码(踩过); 详细说明留在本脚本里。
$mainAct = 'android\app\src\main\java\com\qimen\yinpan\MainActivity.java'
if (Test-Path $mainAct) {
  $ja = [System.IO.File]::ReadAllText($mainAct)
  if ($ja -notmatch 'setTextZoom') {
    # 用数组拼接而非 here-string: here-string 里嵌 Java 极易丢换行, 曾把 setTextZoom 注释掉
    $javaLines = @(
      'package com.qimen.yinpan;',
      '',
      'import android.os.Bundle;',
      'import com.getcapacitor.BridgeActivity;',
      '',
      'public class MainActivity extends BridgeActivity {',
      '    @Override',
      '    public void onCreate(Bundle savedInstanceState) {',
      '        super.onCreate(savedInstanceState);',
      '        // Pin WebView text zoom to 100%: the pan layout is pixel-tuned and must not',
      '        // follow the system font scale (font_scale=1.25 inflates the info table by 1/4).',
      '        getBridge().getWebView().getSettings().setTextZoom(100);',
      '    }',
      '}',
      ''
    )
    [System.IO.File]::WriteAllText($mainAct, ($javaLines -join "`n"), (New-Object System.Text.UTF8Encoding($false)))
    # 回读校验: 上一版"以为写了其实没写", 再上一版写进去却被注释吃掉
    if (([System.IO.File]::ReadAllText($mainAct)) -match 'setTextZoom\(100\)') { Ok 'MainActivity.java -> WebView 字体缩放固定 100%' }
    else { Info 'MainActivity.java 写入校验失败(字体缩放仍跟随系统)' }
  } else { Ok 'MainActivity.java 已固定字体缩放' }
} else { Info '未找到 MainActivity.java(跳过字体缩放补丁)' }
Step '6/7 版本号与签名配置'
$pkg = Get-Content 'package.json' -Raw | ConvertFrom-Json
$parts = $pkg.version.Split('.')
$verCode = ([int]$parts[0] * 10000) + ([int]$parts[1] * 100) + [int]$parts[2]
# 与 CI 完全一致: versionName 取两段(1.4.0 → "1.4"), versionCode = major*10000+minor*100+patch
$verShort = ($parts[0..1] -join '.')
if (Test-Path $appGradle) {
  $c = Get-Content $appGradle -Raw
  $c = $c -replace 'versionCode \d+', "versionCode $verCode"
  $c = $c -replace 'versionName "[^"]*"', "versionName `"$verShort`""
  Set-Content -Path $appGradle -Value $c -Encoding ASCII
  Ok "版本号 → $verShort / $verCode (与 CI 的 android job 一致)"
}

# 签名材料优先放仓库根, 因为 android/ 是生成目录 —— cap add android 会把它整个重建。
# 脚本会自动把根目录的材料搬进工程, 所以"删掉 android/ 重新构建"不会丢签名能力。
$keystore = 'android\qimen-release.keystore'
if (-not (Test-Path $keystore) -and (Test-Path 'qimen-release.keystore')) {
  Copy-Item 'qimen-release.keystore' $keystore -Force
  Ok 'keystore: 仓库根 → android/(工程重建后自动搬入)'
}
$hasKey = Test-Path $keystore
$gp = 'android\gradle.properties'
$hasPwd = (Test-Path $gp) -and ((Get-Content $gp -Raw) -match 'QIMEN_STORE_PASSWORD')
if (-not $hasPwd -and (Test-Path 'qimen-signing.properties')) {
  $sp = (Get-Content 'qimen-signing.properties' -Raw).Trim()
  if ($sp -match 'QIMEN_STORE_PASSWORD') {
    Add-Content -Path $gp -Value ("`r`n" + $sp)
    $hasPwd = $true
    Ok '口令: qimen-signing.properties → android/gradle.properties'
  }
}
Info ("keystore: " + $(if ($hasKey) { $keystore } else { '不存在' }) + "   口令配置: " + $(if ($hasPwd) { '有' } else { '无' }))

if ($Release) {
  if (-not $hasKey -or -not $hasPwd) {
    Bad 'release 构建需要签名密钥, 当前缺失:'
    if (-not $hasKey) { Bad "  · $keystore" }
    if (-not $hasPwd) { Bad '  · android/gradle.properties 里的 QIMEN_STORE_PASSWORD / QIMEN_KEY_PASSWORD' }
    Write-Host '   两者都不入库, 需从原开发机拷入。' -ForegroundColor Yellow
    Write-Host '   若改用新生成的密钥, 签名会变 —— 老用户必须先卸载再安装。' -ForegroundColor Yellow
    Write-Host '   只想验证编译请去掉 -Release(出 debug 包)。' -ForegroundColor Yellow
    exit 1
  }
  # 注意: Gradle 的 rootProject 是 android/(settings.gradle 所在), 而本项目把密钥放在
  # android/qimen-release.keystore —— 所以是 file('qimen-release.keystore')。
  # CI 用的是仓库根的那份, 故其配置写作 file('../qimen-release.keystore'), 两者别混。
  if ((Get-Content $appGradle -Raw) -notmatch 'signingConfigs') {
    $signBlock = @(
      '',
      'android {',
      '    signingConfigs {',
      '        release {',
      "            storeFile rootProject.file('qimen-release.keystore')",
      "            storePassword project.findProperty('QIMEN_STORE_PASSWORD')",
      "            keyAlias 'qimen'",
      "            keyPassword project.findProperty('QIMEN_KEY_PASSWORD')",
      '        }',
      '    }',
      '    buildTypes {',
      '        release {',
      '            signingConfig signingConfigs.release',
      '        }',
      '    }',
      '}'
    ) -join "`r`n"
    Add-Content -Path $appGradle -Value $signBlock
    Ok '已注入 release 签名配置'
  } else { Ok '签名配置已存在' }
}

# ---------- 7. 编译 ----------
$task = if ($Release) { 'assembleRelease' } else { 'assembleDebug' }
Step "7/7 编译 ($task)"
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

# ---------- 8. 推送到内网 web 服务器 ----------
# 构建完顺手同步到 nginx, 手机上直接开 http://192.168.1.3/qimen_app/yinpan.html 验证,
# 比每次装 APK 快得多。推送失败只提示, 不影响 APK 产物。
if (-not $NoDeploy) {
  Step '推送网页版到内网服务器'
  $deploy = Join-Path $root 'scripts\deploy-web.py'
  if ((Test-Path $deploy) -and (Get-Command python -ErrorAction SilentlyContinue)) {
    & python $deploy
    if ($LASTEXITCODE -eq 0) { Ok '网页版已同步到 192.168.1.3' }
    else { Info '推送未成功(不影响 APK); 可稍后单独执行 npm run deploy:web' }
  } else {
    Info '跳过推送(缺 scripts/deploy-web.py 或 python)'
  }
}