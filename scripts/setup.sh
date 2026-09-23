#!/bin/bash
# 阴盘奇门遁甲 · 构建环境检查/补齐
# ------------------------------------------------------------------
# 只做两件事: ① 体检(JDK / Android SDK / 图标依赖); ② 自动补装**无需 root**的部分
# (Android SDK 组件走 sdkmanager)。系统包缺什么就明确列出 pacman 命令, **不擅自安装**。
# 用法: npm run setup
set -uo pipefail

if [ -t 1 ]; then
  C_CYAN=$'\033[36m'; C_GREEN=$'\033[32m'; C_GRAY=$'\033[90m'
  C_RED=$'\033[31m'; C_YELLOW=$'\033[33m'; C_RST=$'\033[0m'
else
  C_CYAN=; C_GREEN=; C_GRAY=; C_RED=; C_YELLOW=; C_RST=
fi
Step() { echo; echo "${C_CYAN}== $*${C_RST}"; }
Ok()   { echo "   ${C_GREEN}[完成] $*${C_RST}"; }
Info() { echo "   ${C_GRAY}$*${C_RST}"; }
Bad()  { echo "   ${C_RED}[失败] $*${C_RST}"; }
Warn() { echo "   ${C_YELLOW}$*${C_RST}"; }

missingPkgs=()
need() {  # need <命令> <pacman 包名> <说明>
  if command -v "$1" >/dev/null 2>&1; then Ok "$3: $(command -v "$1")"; else
    Bad "$3 缺失(命令 $1)"; missingPkgs+=("$2"); fi
}

Step '基础工具'
need node   nodejs        'Node.js'
need npm    npm           'npm'
need java   jdk21-openjdk 'JDK (java)'

Step 'JDK'
if [ -z "${JAVA_HOME:-}" ] || [ ! -x "${JAVA_HOME:-}/bin/javac" ]; then
  for c in /usr/lib/jvm/java-21-openjdk /usr/lib/jvm/java-17-openjdk /usr/lib/jvm/default; do
    [ -x "$c/bin/javac" ] && { JAVA_HOME="$c"; break; }
  done
fi
if [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/javac" ]; then
  Ok "JAVA_HOME: $JAVA_HOME ($("$JAVA_HOME/bin/javac" -version 2>&1))"
  Info '提示: 新开终端才会自动带上; 本脚本内已导出给后续步骤'
  export JAVA_HOME
else
  Bad 'JAVA_HOME 未配置且未找到 JDK —— sudo pacman -S jdk21-openjdk'
  missingPkgs+=(jdk21-openjdk)
fi

Step 'Android SDK'
if [ -z "${ANDROID_HOME:-}" ] || [ ! -x "${ANDROID_HOME:-}/platform-tools/adb" ]; then
  for c in "$HOME/Android/Sdk" "$HOME/Android/sdk" /opt/android-sdk; do
    [ -x "$c/platform-tools/adb" ] && { ANDROID_HOME="$c"; break; }
  done
fi
if [ -n "${ANDROID_HOME:-}" ] && [ -x "$ANDROID_HOME/platform-tools/adb" ]; then
  export ANDROID_HOME
  export ANDROID_SDK_ROOT="$ANDROID_HOME"
  Ok "ANDROID_HOME: $ANDROID_HOME"
  Info "adb: $("$ANDROID_HOME/platform-tools/adb" version 2>&1 | head -1)"
else
  Bad 'ANDROID_HOME 未配置或无效(缺 platform-tools/adb)'
  cat <<'TIP'
   安装方式(无需 root):
     mkdir -p ~/Android/Sdk/cmdline-tools
     curl -L -o /tmp/clt.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
     unzip -q /tmp/clt.zip -d /tmp/clt && mv /tmp/clt/cmdline-tools ~/Android/Sdk/cmdline-tools/latest
   然后把它加进 shell 环境:
     set -gx ANDROID_HOME $HOME/Android/Sdk
     set -gx ANDROID_SDK_ROOT $HOME/Android/Sdk
TIP
  ANDROID_HOME=''
fi

Step 'SDK 组件'
if [ -n "$ANDROID_HOME" ]; then
  SDKM="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
  if [ ! -x "$SDKM" ]; then
    Bad 'cmdline-tools 缺失(sdkmanager 不存在) —— 见上面的安装方式'
  else
    want='platforms;android-34 build-tools;34.0.0 platform-tools'
    missing=''
    for w in $want; do
      case "$w" in
        platforms\;android-34) [ -d "$ANDROID_HOME/platforms/android-34" ] || missing="$missing $w" ;;
        build-tools\;34.0.0)   [ -d "$ANDROID_HOME/build-tools/34.0.0" ] || missing="$missing $w" ;;
        platform-tools)        [ -x "$ANDROID_HOME/platform-tools/adb" ] || missing="$missing $w" ;;
      esac
    done
    if [ -n "$missing" ]; then
      Info "缺失组件:$missing —— 开始安装(无需 root)"
      # shellcheck disable=SC2086
      yes | "$SDKM" --licenses >/dev/null 2>&1
      # shellcheck disable=SC2086
      "$SDKM" $missing 2>&1 | tail -5 | while IFS= read -r l; do Info "$l"; done
      Ok 'SDK 组件安装完成'
    else
      Ok 'platforms;android-34 / build-tools;34.0.0 / platform-tools 均已就绪'
    fi
  fi
fi

Step '图标生成依赖(可选)'
PY="$(command -v python3 || command -v python || true)"
if [ -z "$PY" ]; then
  Info '未找到 python —— 图标生成会跳过(不影响构建, 只是不做图标)'
else
  lack="$("$PY" - <<'PYEOF'
import importlib.util
# 模块名 → 缺失时给出的安装包名
mods = [('svglib', 'python-svglib'), ('reportlab', 'python-reportlab'),
        ('PIL', 'python-pillow'), ('rlPyCairo', 'pip install rlPyCairo')]
print(', '.join(p for m, p in mods if importlib.util.find_spec(m) is None))
PYEOF
)"
  if [ -z "$lack" ]; then
    Ok '图标生成依赖齐备(svglib / reportlab / Pillow / rlPyCairo)'
  else
    Warn "缺少: $lack"
    Info 'Arch: sudo pacman -S python-svglib python-reportlab python-pillow python-cairo'
    Info '      python3 -m pip install --user --break-system-packages rlPyCairo'
  fi
fi

Step '结果'
if [ "${#missingPkgs[@]}" -gt 0 ]; then
  # 去重
  uniq_pkgs=$(printf '%s\n' "${missingPkgs[@]}" | sort -u | tr '\n' ' ')
  Bad "仍需安装的系统包: $uniq_pkgs"
  echo "     sudo pacman -S --needed $uniq_pkgs"
  exit 1
fi
Ok 'Android 构建环境就绪 —— 接着可以跑: npm run build:android'
