#!/bin/bash
# 阴盘奇门遁甲 · 本地 Android 构建(一体化) —— Linux 版
# ------------------------------------------------------------------
# 与 scripts/build-android.ps1 **逻辑一一对应**(步骤编号刻意保持一致, 便于两边同步维护)。
# 把 CI 的 android job 在本地复现成一条命令, 并自动处理国内网络必须的两处镜像/超时配置
# (android/ 是生成目录、不入库, 每次 `cap add android` 都会重建, 所以补丁必须每次重打)。
#
# 用法:
#   npm run build:android                  # 出 debug 包(无需签名)
#   npm run build:android -- --release     # 出 release 包(需 keystore, 见下)
#   npm run build:android -- --skip-web    # 跳过 www 资源准备(仅重编译)
#   npm run build:android -- --no-deploy   # 跳过推送到内网服务器
#
# release 包的前置条件(二者都不入库, 需自行准备):
#   · qimen-release.keystore                 —— 项目正式签名密钥(仓库根或 android/ 下)
#   · qimen-signing.properties 中的
#     QIMEN_STORE_PASSWORD / QIMEN_KEY_PASSWORD
#   缺任一者时本脚本会明确拒绝打 release, 而不是产出一个签名不对的包。
set -uo pipefail

# ---------- 参数 ----------
RELEASE=0; SKIP_WEB=0; NO_DEPLOY=0
usage() { awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0"; exit 0; }
for arg in "$@"; do
  case "$arg" in
    # 同时接受 PowerShell 风格(-Release)与 GNU 风格(--release), 便于 npm 统一透传
    -Release|--release|release) RELEASE=1 ;;
    -SkipWeb|--skip-web|skip-web) SKIP_WEB=1 ;;
    -NoDeploy|--no-deploy|no-deploy) NO_DEPLOY=1 ;;
    -h|--help|help) usage ;;
    *) echo "未知参数: $arg (可用: --release --skip-web --no-deploy)"; exit 2 ;;
  esac
done

# ---------- 输出 ----------
if [ -t 1 ]; then
  C_CYAN=$'\033[36m'; C_GREEN=$'\033[32m'; C_GRAY=$'\033[90m'
  C_RED=$'\033[31m'; C_YELLOW=$'\033[33m'; C_WHITE=$'\033[97m'; C_RST=$'\033[0m'
else
  C_CYAN=; C_GREEN=; C_GRAY=; C_RED=; C_YELLOW=; C_WHITE=; C_RST=
fi
Step() { echo; echo "${C_CYAN}== $*${C_RST}"; }
Ok()   { echo "   ${C_GREEN}[完成] $*${C_RST}"; }
Info() { echo "   ${C_GRAY}$*${C_RST}"; }
Bad()  { echo "   ${C_RED}[失败] $*${C_RST}"; }
Warn() { echo "   ${C_YELLOW}$*${C_RST}"; }
Die()  { Bad "$*"; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# python 解释器(图标生成/版本号解析用): Debian 系叫 python3, 老发行版可能只有 python
PY="$(command -v python3 || command -v python || true)"

# ---------- 0. 环境 ----------
Step '环境检查'
# JAVA_HOME: 环境变量优先, 否则探测常见 JDK 安装位置(2026-09-28 升 JDK 27)
if [ -z "${JAVA_HOME:-}" ] || [ ! -x "${JAVA_HOME:-}/bin/javac" ]; then
  for c in /usr/lib/jvm/java-27-openjdk /usr/lib/jvm/java-21-openjdk /usr/lib/jvm/java-17-openjdk \
           /usr/lib/jvm/default /usr/lib/jvm/default-java; do
    [ -x "$c/bin/javac" ] && { JAVA_HOME="$c"; break; }
  done
fi
[ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/javac" ] \
  || Die 'JAVA_HOME 未配置或无效 —— Arch: sudo pacman -S jdk21-openjdk'

# ANDROID_HOME: 环境变量优先, 否则探测 ~/Android/Sdk
if [ -z "${ANDROID_HOME:-}" ] || [ ! -x "${ANDROID_HOME:-}/platform-tools/adb" ]; then
  for c in "$HOME/Android/Sdk" "$HOME/Android/sdk" /opt/android-sdk; do
    [ -x "$c/platform-tools/adb" ] && { ANDROID_HOME="$c"; break; }
  done
fi
[ -n "${ANDROID_HOME:-}" ] && [ -x "$ANDROID_HOME/platform-tools/adb" ] \
  || Die 'ANDROID_HOME 未配置或无效 —— 需含 platform-tools/adb'

# 让 gradle/node 子进程继承正确环境
export JAVA_HOME ANDROID_HOME
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
Ok "JDK  : $("$JAVA_HOME/bin/javac" -version 2>&1)"
Ok "SDK  : $ANDROID_HOME"
Info "Gradle 缓存: ${GRADLE_USER_HOME:-(默认位置 $HOME/.gradle)}"

# ---------- 1. www 资源 ----------
if [ "$SKIP_WEB" = 0 ]; then
  Step '1/7 准备 www 资源(与 CI 的 Setup www dir 一致)'
  rm -rf www
  mkdir -p www/qimen_app/css www/qimen_app/js
  cat > www/index.html << 'HTMLEOF'
<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta http-equiv="refresh" content="0;url=qimen_app/yinpan.html"></head><body></body></html>
HTMLEOF
  npm run build:bundle 2>&1 | tail -2 | while IFS= read -r l; do Info "$l"; done
  cp qimen_app/css/yinpan_app.min.css www/qimen_app/css/yinpan_app.css
  cp qimen_app/js/qimen_bundle.min.js www/qimen_app/js/
  cp qimen_app/js/gong_detail_data.js www/qimen_app/js/
  cp qimen_app/yinpan.html            www/qimen_app/
  Ok "www 资源就绪: $(find www -type f | wc -l) 个文件"
else
  Step '1/7 跳过 www 资源准备(--skip-web)'
fi

# ---------- 2. Android 工程 ----------
Step '2/7 Android 工程'
if [ ! -d android ]; then
  Info 'android/ 不存在, 执行 npx cap add android ...'
  npx cap add android 2>&1 | tail -4 | while IFS= read -r l; do Info "$l"; done
  [ -d android ] || Die 'cap add android 失败'
  Ok 'android 工程已生成'
else
  Ok 'android/ 已存在, 跳过创建'
fi

# ---------- 3. cap sync ----------
# ⚠️ 必须从项目根执行: 在 android/ 子目录跑会报 "platform has not been added",
#    且 gradle 全 up-to-date 假成功; 漏跑会导致 APK 内嵌旧资源。
Step '3/7 同步 web 资源到工程'
npx cap sync 2>&1 | tail -4 | while IFS= read -r l; do Info "$l"; done
Ok 'cap sync 完成'

# ---------- 4. 网络补丁(幂等) ----------
Step '4/7 网络补丁(国内必需)'
# 4a) Gradle 发行版: 官方 services.gradle.org 在国内会失败(重定向后连接被拒),
#     且 wrapper 默认 networkTimeout=10000 对拉取 ~200MB 太短。
wrapper='android/gradle/wrapper/gradle-wrapper.properties'
if [ -f "$wrapper" ]; then
  # 从 URL 里解析版本与发行类型, 两处共用同一份捕获组:
  # ⚠️ `\2` 必须对应第 2 个括号组。早期版本把第一组写成 `[0-9.]+`(无括号)却引用 `\2`,
  #    sed 会报 "invalid reference \2 on 's' command's RHS" 并**静默产出空串**,
  #    结果是去下载 gradle-8.11.1-.zip 报 FileNotFoundException。
  zipname=$(grep -oE 'gradle-[0-9.]+-(all|bin)\.zip' "$wrapper" | head -1)
  ver=$(printf '%s' "$zipname" | sed -E 's/^gradle-([0-9.]+)-(all|bin)\.zip$/\1/')
  kind=$(printf '%s' "$zipname" | sed -E 's/^gradle-([0-9.]+)-(all|bin)\.zip$/\2/')
  [ -n "$ver" ] || ver='9.8.0'
  [ -n "$kind" ] || kind='all'
  mirror="distributionUrl=https\\://mirrors.cloud.tencent.com/gradle/gradle-$ver-$kind.zip"
  if grep -q '^distributionUrl=' "$wrapper"; then
    # ⚠️ 必须用 ^distributionUrl= 锚定行首 —— 否则会连 validateDistributionUrl=true 一起改坏
    sed -i "s|^distributionUrl=.*|$mirror|" "$wrapper"
    if grep -q '^networkTimeout=' "$wrapper"; then
      sed -i 's|^networkTimeout=.*|networkTimeout=120000|' "$wrapper"
    else
      printf 'networkTimeout=120000\n' >> "$wrapper"
    fi
    Ok "Gradle 镜像 → 腾讯云 (gradle-$ver-$kind.zip), 超时 120s"
  else
    Bad 'gradle-wrapper.properties 里没有 distributionUrl'
  fi
else
  Bad '找不到 gradle-wrapper.properties'
fi

# 4b) Maven 依赖: google()/mavenCentral() 直连较慢, 阿里云镜像快两个数量级
bg='android/build.gradle'
if [ -f "$bg" ]; then
  if ! grep -q 'maven\.aliyun\.com' "$bg"; then
    sed -i \
      -e "s|google()|maven { url 'https://maven.aliyun.com/repository/google' }\n        google()|" \
      -e "s|mavenCentral()|maven { url 'https://maven.aliyun.com/repository/public' }\n        mavenCentral()|" \
      "$bg"
    Ok 'Maven 镜像 → 阿里云(google / public)'
  else
    Ok 'Maven 镜像已配置'
  fi
fi

# 4c) SDK 路径
printf 'sdk.dir=%s\n' "$ANDROID_HOME" > android/local.properties
Ok 'local.properties 已写入 sdk.dir'

# ---------- 5. CI 对齐补丁 ----------
# 复现 release.yml 里 android job 的全部定制; android/ 是生成目录, 每次重建后都要重打。
Step '5/7 CI 对齐补丁(复现 release.yml 的 android job)'
resDir='android/app/src/main/res'
appGradle='android/app/build.gradle'
manifest='android/app/src/main/AndroidManifest.xml'

# 5a) SDK 版本: minSdk 31、targetSdk 37(2026-09-28 全面升级)
#     (原 targetSdk 压 34 是规避 Android 15 edge-to-edge; 现已授权升最新,
#      edge-to-edge 行为交由 Cap 8 模板与主题适配, 装机后须实测状态栏)
vg='android/variables.gradle'
if [ -f "$vg" ]; then
  sed -i -E \
    -e 's/minSdkVersion[[:space:]]*=[[:space:]]*[0-9]+/minSdkVersion = 31/' \
    -e 's/targetSdkVersion[[:space:]]*=[[:space:]]*[0-9]+/targetSdkVersion = 37/' \
    -e 's/compileSdkVersion[[:space:]]*=[[:space:]]*[0-9]+/compileSdkVersion = 37/' \
    "$vg"
  Ok 'variables.gradle → minSdk 31 / targetSdk 37 / compileSdk 37'
else
  Bad '找不到 variables.gradle'
fi

# 5a+) AGP 9.4.1 + Gradle 9.8.0(2026-09-28 全面升级, 与 CI android job 同步;
#      模板默认 AGP 8.13 不支持 Gradle 9.8 的服务 API, 必须同步提)
bg='android/build.gradle'
wp='android/gradle/wrapper/gradle-wrapper.properties'
[ -f "$bg" ] && sed -E -i 's|gradle:[0-9.]+"|gradle:9.4.1"|' "$bg"
[ -f "$bg" ] && sed -i 's|delete rootProject.buildDir|delete rootProject.layout.buildDirectory|' "$bg"
[ -f "$wp" ] && sed -E -i 's|gradle-[0-9.]+-all\.zip|gradle-9.8.0-all.zip|' "$wp"
Ok 'AGP 9.4.1 / Gradle 9.8.0 / JDK: ${JAVA_HOME##*/}'

# 5b/5c) 状态栏: targetSdk 37(Android 15+)强制 edge-to-edge, 主题里的
#       statusBarColor/windowLightStatusBar 等一律被忽略 —— 旧注入段已删除,
#       适配全部移入 MainActivity 代码(insets padding + 图标明暗, 见 5a+ 前的
#       MainActivity 重写)。此处仅清掉历史注入残留(如有)
styles="$resDir/values/styles.xml"
if [ -f "$styles" ] && grep -q 'statusBarColor' "$styles"; then
  sed -i '/statusBarColor\|windowLightStatusBar\|windowTranslucentStatus\|windowDrawsSystemBarBackgrounds/d' "$styles"
  Ok 'values/styles.xml → 已清理旧状态栏注入(edge-to-edge 由代码适配)'
else
  Ok 'values/styles.xml 无需清理'
fi
rm -rf "$resDir/values-night"


# 5d) R8 混淆 + 资源压缩
if [ -f "$appGradle" ]; then
  sed -i -E 's/minifyEnabled[[:space:]]+false/minifyEnabled true/' "$appGradle"
  grep -q 'shrinkResources' "$appGradle" || \
    sed -i 's|\(minifyEnabled true\)|\1\n            shrinkResources true|' "$appGradle"
  sed -i 's/proguard-android\.txt/proguard-android-optimize.txt/' "$appGradle"
  Ok 'app/build.gradle → R8 + shrinkResources + optimize 规则'
fi

# 5e) ProGuard: 保留 Capacitor 与 JS 桥接方法
pg='android/app/proguard-rules.pro'
if [ -f "$pg" ] && ! grep -q 'com\.getcapacitor' "$pg"; then
  printf '\n-keep class com.getcapacitor.** { *; }
          -keep class com.qimen.yinpan.NativeSharePlugin { *; }\n-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }\n' >> "$pg"
  Ok 'proguard-rules.pro → 保留 Capacitor / JavascriptInterface'
fi

# 5f) 清单: 硬件加速 + 移除 SMS 相关权限(WebView 依赖可能注入)
if [ -f "$manifest" ]; then
  grep -q 'hardwareAccelerated' "$manifest" || \
    sed -i 's|<application|<application android:hardwareAccelerated="true"|' "$manifest"
  # FileProvider: NativeShare 分享文件需 content:// URI
  manifest='android/app/src/main/AndroidManifest.xml'
  if [ -f "$manifest" ] && ! grep -q 'fileprovider' "$manifest"; then
    sed -i 's|</application>|  <provider android:name="androidx.core.content.FileProvider" android:authorities="${applicationId}.fileprovider" android:exported="false" android:grantUriPermissions="true"><meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/file_paths"/></provider>\n    </application>|' "$manifest"
    mkdir -p android/app/src/main/res/xml
    printf '%s\n' '<?xml version="1.0" encoding="utf-8"?>' '<paths>' '    <cache-path name="share" path="share/" />' '</paths>' > android/app/src/main/res/xml/file_paths.xml
    Ok 'Manifest -> FileProvider + res/xml/file_paths.xml'
  else
    Ok 'FileProvider 已配置'
  fi
  grep -q 'xmlns:tools' "$manifest" || \
    sed -i 's|<manifest |<manifest xmlns:tools="http://schemas.android.com/tools" |' "$manifest"
  if ! grep -q 'permission\.SMS' "$manifest"; then
    sed -i 's|<application|    <uses-permission android:name="android.permission.SMS" tools:node="remove" />\n    <uses-permission android:name="android.permission.RECEIVE_SMS" tools:node="remove" />\n    <uses-permission android:name="android.permission.SEND_SMS" tools:node="remove" />\n    <uses-permission android:name="android.permission.READ_SMS" tools:node="remove" />\n    <uses-permission android:name="android.permission.BROADCAST_SMS" tools:node="remove" />\n<application|' "$manifest"
  fi
  Ok 'AndroidManifest → 硬件加速 + 移除 SMS 权限'
fi

# 5g) 图标: 用 taiji.svg 生成 5 档 PNG, 并删掉会盖住它的自适应图标定义。
#     CI 用 ImageMagick 的 convert; 本脚本优先用 scripts/make_launcher_icons.py
#     (svglib + Pillow), 复现同样的"#f5f5f5 底 + 等比缩放 + 居中 + extent"效果。
if [ -f taiji.svg ] && [ -f scripts/make_launcher_icons.py ] && [ -n "$PY" ]; then
  "$PY" scripts/make_launcher_icons.py taiji.svg "$resDir" 2>&1 | tail -1 | while IFS= read -r l; do Info "$l"; done
  rm -f "$resDir"/mipmap-anydpi-v26/*.xml 2>/dev/null
  for d in "$resDir"/drawable*; do
    [ -d "$d" ] && rm -f "$d"/ic_launcher*.xml 2>/dev/null
  done
  Ok '图标 → taiji.svg 生成的 5 档 PNG(自适应图标定义已清理)'
else
  Info '跳过图标生成(缺 taiji.svg / 生成脚本 / python)'
fi

# 5h) 固定 WebView 字体缩放
#     Capacitor 7 生成的 MainActivity 是**空类**(只有 extends BridgeActivity, 没有 onCreate),
#     不能"替换 super.onCreate 后插一行" —— 直接整体重写这个生成文件。
#     盘面按设计尺寸精确排布, 继承系统 font_scale(实测 1.25 倍)会把信息表从 ~216px 撑到
#     270px, 吃掉三分之一屏; Capacitor 没有对应配置项, 只能改 Java。
#     注意: Java 源码里**只用英文注释** —— javac 默认按平台编码读源文件,
#     中文注释可能乱码甚至吃掉整行代码(踩过); 详细说明留在本脚本里。
mainAct='android/app/src/main/java/com/qimen/yinpan/MainActivity.java'
if [ -f "$mainAct" ]; then
  nsp='android/app/src/main/java/com/qimen/yinpan/NativeSharePlugin.java'
  if [ ! -f "$nsp" ] || ! grep -q 'registerPlugin(NativeSharePlugin' "$mainAct"; then
    # 用 printf 逐行写入而非 here-doc 嵌入: 与 ps1 版一样刻意避免"注释吃掉代码行"
    printf '%s\n' \
      'package com.qimen.yinpan;' \
      '' \
      'import android.content.res.Configuration;' \
      'import android.graphics.Color;' \
      'import android.os.Bundle;' \
      'import android.view.View;' \
      'import androidx.core.graphics.Insets;' \
      'import androidx.core.view.ViewCompat;
          import androidx.core.view.WindowCompat;' \
      'import androidx.core.view.WindowInsetsCompat;' \
      'import androidx.core.view.WindowInsetsControllerCompat;' \
      'import com.getcapacitor.BridgeActivity;' \
      '' \
      'public class MainActivity extends BridgeActivity {' \
      '    @Override' \
      '    public void onCreate(Bundle savedInstanceState) {' \
      '        // registerPlugin 必须在 super.onCreate 之前(Bridge 在 super 内 create, 之后再加无效)' \
      '        registerPlugin(NativeSharePlugin.class);' \
      '        super.onCreate(savedInstanceState);' \
      '        // Pin WebView text zoom to 100%: 布局按像素调校, 不随系统字体缩放' \
      '        getBridge().getWebView().getSettings().setTextZoom(100);' \
      '' \
      '        // Edge-to-edge 适配(targetSdk 37 / Android 15+ 强制):' \
      '        // 内容默认延伸到系统栏后面 —— 用 insets 把系统栏高度作为 padding' \
      '        // 还给根布局: 背景延伸(观感统一), 内容不被状态栏/手势条遮挡。' \
      '        // 替代已失效的主题项(statusBarColor/windowLightStatusBar 被忽略)。' \
      '        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);' \
      '        getWindow().setStatusBarColor(Color.TRANSPARENT);' \
      '        getWindow().setNavigationBarColor(Color.TRANSPARENT);' \
      '        View root = findViewById(android.R.id.content);' \
      '        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {' \
      '            Insets sys = insets.getInsets(WindowInsetsCompat.Type.systemBars());' \
      '            v.setPadding(sys.left, sys.top, sys.right, sys.bottom);' \
      '            return WindowInsetsCompat.CONSUMED;' \
      '        });' \
      '        applySystemBarAppearance();' \
      '    }' \
      '' \
      '    // 状态栏/导航栏图标明暗跟随系统昼夜模式(浅色 UI 用深色图标)' \
      '    private void applySystemBarAppearance() {' \
      '        View root = findViewById(android.R.id.content);' \
      '        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), root);' \
      '        boolean lightUi = (getResources().getConfiguration().uiMode' \
      '                & Configuration.UI_MODE_NIGHT_MASK) != Configuration.UI_MODE_NIGHT_YES;' \
      '        c.setAppearanceLightStatusBars(lightUi);' \
      '        c.setAppearanceLightNavigationBars(lightUi);' \
      '    }' \
      '}' > "$mainAct"

  # NativeSharePlugin: 原生分享桥(2026-09-29, 替代 WebView 里静默失效的 navigator.share
  # 与已移除的 Capacitor Share 插件) —— 写缓存 + FileProvider + ACTION_SEND 系统面板
  printf '%s\n' \
      'package com.qimen.yinpan;' \
      '' \
      'import android.content.Intent;' \
      'import android.net.Uri;' \
      'import androidx.core.content.FileProvider;' \
      'import com.getcapacitor.Plugin;' \
      'import com.getcapacitor.PluginCall;' \
      'import com.getcapacitor.PluginMethod;' \
      'import com.getcapacitor.JSObject;' \
      'import com.getcapacitor.annotation.CapacitorPlugin;' \
      'import java.io.File;' \
      'import java.io.FileOutputStream;' \
      'import java.nio.charset.StandardCharsets;' \
      '' \
      '@CapacitorPlugin(name = "NativeShare")' \
      'public class NativeSharePlugin extends Plugin {' \
      '    @PluginMethod' \
      '    public void shareFile(PluginCall call) {' \
      '        String data = call.getString("data", "");' \
      '        String name = call.getString("name", "qimen_backup.json");' \
      '        try {' \
      '            File dir = new File(getContext().getCacheDir(), "share");' \
      '            if (!dir.exists()) dir.mkdirs();' \
      '            File f = new File(dir, name);' \
      '            try (FileOutputStream fos = new FileOutputStream(f)) {' \
      '                fos.write(data.getBytes(StandardCharsets.UTF_8));' \
      '            }' \
      '            Uri uri = FileProvider.getUriForFile(getContext(),' \
      '                    getContext().getPackageName() + ".fileprovider", f);' \
      '            Intent i = new Intent(Intent.ACTION_SEND);' \
      '            i.setType("application/json");' \
      '            i.putExtra(Intent.EXTRA_STREAM, uri);' \
      '            i.putExtra(Intent.EXTRA_TITLE, "奇门排盘备份");' \
      '            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);' \
      '            getContext().startActivity(Intent.createChooser(i, "保存排盘数据"));' \
      '            JSObject ret = new JSObject(); ret.put("ok", true);' \
      '            call.resolve(ret);' \
      '        } catch (Exception e) {' \
      '            call.reject("share failed: " + e.getMessage(), e);' \
      '        }' \
      '    }' \
      '}' > "$nsp"
  grep -q 'ACTION_SEND' "$nsp" && Ok 'NativeSharePlugin.java -> ACTION_SEND + FileProvider' || Bad 'NativeSharePlugin 写入失败'
    # 回读校验: 上一版"以为写了其实没写", 再上一版写进去却被注释吃掉
    if grep -q 'registerPlugin(NativeSharePlugin' "$mainAct" && grep -q 'ACTION_SEND' "$nsp"; then
      Ok 'MainActivity.java -> 字体缩放固定 + edge-to-edge insets 适配'
    else
      Info 'MainActivity.java 写入校验失败(字体缩放仍跟随系统)'
    fi
  else
    Ok 'MainActivity + NativeSharePlugin 均已是最新'
  fi
else
  Info '未找到 MainActivity.java(跳过字体缩放补丁)'
fi

# ---------- 6. 版本号与签名 ----------
Step '6/7 版本号与签名配置'
if [ -n "$PY" ]; then
  pkgVer="$("$PY" -c "import json;print(json.load(open('package.json'))['version'])")"
else
  pkgVer="$(grep -m1 '"version"' package.json | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
fi
IFS='.' read -r vMaj vMin vPat <<< "$pkgVer"
# versionName 用完整三段(2026-09-28 用户要求: 安装时显示 1.4.5 而非截断的 "1.4"); CI 已同步改口
verCode=$(( vMaj * 10000 + vMin * 100 + vPat ))
if [ -f "$appGradle" ]; then
  sed -i -E \
    -e "s/versionCode [0-9]+/versionCode $verCode/" \
    -e "s/versionName \"[^\"]*\"/versionName \"$pkgVer\"/" \
    "$appGradle"
  Ok "版本号 → $pkgVer / $verCode"
fi

# 签名材料优先放仓库根, 因为 android/ 是生成目录 —— cap add android 会把它整个重建。
# 脚本会自动把根目录的材料搬进工程, 所以"删掉 android/ 重新构建"不会丢签名能力。
keystore='android/qimen-release.keystore'
if [ ! -f "$keystore" ] && [ -f qimen-release.keystore ]; then
  cp qimen-release.keystore "$keystore"
  Ok 'keystore: 仓库根 → android/(工程重建后自动搬入)'
fi
hasKey=0; [ -f "$keystore" ] && hasKey=1
gp='android/gradle.properties'
hasPwd=0
[ -f "$gp" ] && grep -q 'QIMEN_STORE_PASSWORD' "$gp" && hasPwd=1
if [ "$hasPwd" = 0 ] && [ -f qimen-signing.properties ]; then
  if grep -q 'QIMEN_STORE_PASSWORD' qimen-signing.properties; then
    { echo; cat qimen-signing.properties; } >> "$gp"
    hasPwd=1
    Ok '口令: qimen-signing.properties → android/gradle.properties'
  fi
fi
Info "keystore: $([ "$hasKey" = 1 ] && echo "$keystore" || echo '不存在')   口令配置: $([ "$hasPwd" = 1 ] && echo '有' || echo '无')"

if [ "$RELEASE" = 1 ]; then
  if [ "$hasKey" = 0 ] || [ "$hasPwd" = 0 ]; then
    Bad 'release 构建需要签名密钥, 当前缺失:'
    [ "$hasKey" = 0 ] && Bad "  · $keystore"
    [ "$hasPwd" = 0 ] && Bad '  · android/gradle.properties 里的 QIMEN_STORE_PASSWORD / QIMEN_KEY_PASSWORD'
    Warn '   两者都不入库, 需从原开发机拷入。'
    Warn '   若改用新生成的密钥, 签名会变 —— 老用户必须先卸载再安装。'
    Warn '   只想验证编译请去掉 --release(出 debug 包)。'
    exit 1
  fi
  # 注意: Gradle 的 rootProject 是 android/(settings.gradle 所在), 而本项目把密钥放在
  # android/qimen-release.keystore —— 所以是 file('qimen-release.keystore')。
  # CI 用的是仓库根的那份, 故其配置写作 file('../qimen-release.keystore'), 两者别混。
  if ! grep -q 'signingConfigs' "$appGradle"; then
    cat >> "$appGradle" << 'GRADLEEOF'

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
GRADLEEOF
    Ok '已注入 release 签名配置'
  else
    Ok '签名配置已存在'
  fi
fi

# ---------- 7. 编译 ----------
task='assembleDebug'; [ "$RELEASE" = 1 ] && task='assembleRelease'
Step "7/7 编译 ($task)"
[ -f android/gradlew ] && chmod +x android/gradlew
start=$(date +%s)
( cd android && ./gradlew "$task" --no-daemon 2>&1 | tail -12 | while IFS= read -r l; do Info "$l"; done )
code=${PIPESTATUS[0]}
mins=$(( ($(date +%s) - start) / 60 ))

Step '结果'
[ "$code" -ne 0 ] && Die "gradle 退出码 $code, 耗时 $(( ($(date +%s) - start) / 60 )) 分钟"
kind=debug; [ "$RELEASE" = 1 ] && kind=release
apk="android/app/build/outputs/apk/$kind/app-$kind.apk"
if [ -f "$apk" ]; then
  size=$(du -h "$apk" | cut -f1)
  Ok "产物: $ROOT/$apk  ($size, 耗时 ${mins} 分钟)"
  echo
  echo "   安装到已连接的设备: ${C_WHITE}"
  echo "     $ANDROID_HOME/platform-tools/adb install -r \"$ROOT/$apk\"${C_RST}"
else
  Die "未找到产物 $apk"
fi

# ---------- 8. 推送到内网 web 服务器 ----------
# 构建完顺手同步到 nginx, 手机上直接开 http://192.168.1.3/qimen_app/yinpan.html 验证,
# 比每次装 APK 快得多。推送失败只提示, 不影响 APK 产物。
if [ "$NO_DEPLOY" = 0 ]; then
  Step '推送网页版到内网服务器'
  if [ -f scripts/deploy-web.py ] && [ -n "$PY" ]; then
    if "$PY" scripts/deploy-web.py; then
      Ok '网页版已同步到 192.168.1.3'
    else
      Info '推送未成功(不影响 APK); 可稍后单独执行 npm run deploy:web'
    fi
  else
    Info '跳过推送(缺 scripts/deploy-web.py 或 python)'
  fi
fi
