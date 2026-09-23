#!/bin/bash
# 阴盘奇门遁甲 · 设备操作(无线调试 / 装机 / 查看)
# ------------------------------------------------------------------
# 用法:
#   scripts/device.sh                       # = wifi(默认子命令)
#   scripts/device.sh wifi [--setup] [--ip 192.168.1.4] [--port 5555]
#   scripts/device.sh install [--release] [--target 192.168.1.4:5555]
#   scripts/device.sh list                  # 列出当前设备
#
# 对应 npm 入口: npm run adb:wifi / adb:install / adb:list
#
# ── 为什么用固定端口 5555 ──────────────────────────────────────────────
# Android 11+ 设置里的「无线调试」端口是随机的、无法固定; 这里改用经典 TCP/IP 模式,
# 把手机 adbd 固定在 5555。手机无 root, 故 persist.adb.tcp.port 改不了 ——
# **手机重启后 TCP 模式失效**, 需 USB 连一次并加 --setup 重设。
#
# ── WSL 注意(WSL 没有 USB 直通: 手机插在 Windows 上, WSL 内核里也看不到设备)──
#   · `--setup` 用不了 → 改用 Windows 侧 adb.exe 执行一次 `tcpip 5555`,
#     或装 usbipd-win 把 USB 转发进 WSL(winget install usbipd)
#   · USB 探测那一路上必然失效 → 本脚本退回缓存, 再退回**同网段 5555 端口扫描**
#   · 网络需为 mirrored 模式(新版 WSL 默认)才能直连手机, 不需要任何端口映射
#   · ⚠️ 还要绕开 loopback 黑洞, 见 ensure_adb_server() 的注释
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ============================ 输出 ============================
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

# ============================ adb / WSL 基础设施 ============================
adb=''
resolve_adb() {
  [ -n "$adb" ] && return 0
  local c
  for c in "${ANDROID_HOME:-}/platform-tools/adb" "$HOME/Android/Sdk/platform-tools/adb"; do
    [ -n "$c" ] && [ -x "$c" ] && { adb="$c"; break; }
  done
  [ -n "$adb" ] || adb="$(command -v adb || true)"
  [ -z "$adb" ] && Die 'adb 未找到 —— 需安装 Android SDK platform-tools'
  Info "adb: $adb"
}

# WSL 没有 USB 直通: 手机插在 Windows 上, WSL 内核里也看不到, `adb devices` 恒为空。
# 只有经 usbipd-win 转发进来才会有 USB 设备, 否则只能走网络。
IS_WSL=0
grep -qi microsoft /proc/version 2>/dev/null && IS_WSL=1

# ⚠️ WSL(mirrored 网络模式)的致命坑, 必须特殊处理:
#   连到**未被监听的 127.0.0.1 端口**不会立刻返回 ECONNREFUSED, 而是永久挂起。
#   adb client 的流程恰恰是「先 connect 127.0.0.1:5037 探测 server, 失败才 fork 一个」,
#   于是它卡在 connect 上、永远走不到启动分支 —— 实测 `adb devices` 25 秒零输出、
#   CPU 仅 0.002s, strace 停在 `connect(3, 127.0.0.1:5037) = ? ERESTARTSYS`。
#   解法: 跳过 client 的探测, 直接用 `nodaemon server` 把 server 拉起来;
#   一旦 5037 有人监听, 后续所有 adb 命令(含手动敲的)都恢复正常。
#   (本机另有 systemd user service 常驻: ~/.config/systemd/user/adb-server.service)
ADB_SOCK_PORT=5037
adb_server_up() { ss -tln 2>/dev/null | grep -q "127.0.0.1:${ADB_SOCK_PORT}"; }
ensure_adb_server() {
  [ "$IS_WSL" = 1 ] || return 0
  adb_server_up && return 0
  Info "WSL: adb server 未运行, 后台启动(绕过 loopback 黑洞)…"
  nohup "$adb" -L "tcp:${ADB_SOCK_PORT}" nodaemon server >/dev/null 2>&1 &
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    sleep 0.5
    adb_server_up && { Ok 'adb server 已就绪'; return 0; }
  done
  Warn 'adb server 启动超时(后续 adb 命令可能卡住)'
}

# 找 USB 设备(序列号不含 ":")
get_usb_serial() {
  "$adb" devices 2>/dev/null | while IFS= read -r l; do
    case "$l" in
      *$'\t'device|*' device')
        local s; s="$(printf '%s' "$l" | awk '{print $1}')"
        case "$s" in
          *:*) ;;                 # 已是网络设备, 跳过
          '') ;;                  # 表头空行
          *) printf '%s' "$s"; return 0 ;;
        esac ;;
    esac
  done | head -1
}

# 已连接的网络设备(优先 device 状态)
connected_target() {
  "$adb" devices 2>/dev/null | awk '$1 ~ /:/ && $2 == "device" {print $1; exit}'
}

ADB_CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/qimen-adb-wireless.txt"

# 发现手机地址: --ip 参数 > USB 探测 > 上次成功的记录 > 同网段扫描
# 结果写入全局 DISCOVERED_IP(空 = 没找到)
DISCOVERED_IP=''
discover_ip() {
  local want_ip="${1:-}" want_port="${2:-5555}"
  local usb='' route='' got='' cached='' myip='' prefix=''
  DISCOVERED_IP=''

  Step '设备发现'
  ensure_adb_server
  usb="$(get_usb_serial)"
  if [ -n "$usb" ]; then
    Ok "USB 设备: $usb"
  elif [ "$IS_WSL" = 1 ]; then
    Info '没有 USB 设备(WSL 无 USB 直通 —— 手机插在 Windows 上也看不到)'
  else
    Info '没有 USB 连接的设备'
  fi

  # (日常场景是手机只连 WiFi、不插 USB, 所以缓存这一路必须留)
  if [ -n "$want_ip" ]; then
    DISCOVERED_IP="$want_ip"; return 0
  fi

  if [ -n "$usb" ]; then
    route="$("$adb" -s "$usb" shell "ip route 2>/dev/null | grep wlan0" 2>/dev/null)"
    got="$(printf '%s' "$route" | grep -oE 'src[[:space:]]+[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1 | awk '{print $2}')"
    if [ -n "$got" ]; then
      DISCOVERED_IP="$got"; Ok "手机 WiFi 地址(USB 探测): $got"; return 0
    fi
    Info 'USB 设备在, 但读不到 wlan0 地址(手机可能没连 WiFi)'
  fi

  if [ -f "$ADB_CACHE" ]; then
    cached="$(tr -d '[:space:]' < "$ADB_CACHE" | sed -E 's/:[0-9]+$//')"
    case "$cached" in
      [0-9]*.[0-9]*.[0-9]*.[0-9]*) DISCOVERED_IP="$cached"; Info "使用上次记录的地址: $cached"; return 0 ;;
    esac
  fi

  # 兜底: 并发扫同网段谁在监听 5555。WSL 下没有 USB 可探测, 这一路是主要发现手段。
  # 只在前面几路都没结果时才跑(254 个地址 / 64 并发 / 每个 1s 超时 → 约几秒)。
  # ⚠️ 取本机地址不能用 `ip addr show scope global` —— WSL 的 DNS 代理
  #    10.255.255.254 挂在 lo 上却带 scope global, 会被误判成局域网地址(扫错整个网段)。
  myip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1)"
  [ -n "$myip" ] || myip="$(ip -4 -o addr show scope global 2>/dev/null | awk '$2!="lo"{print $4}' | cut -d/ -f1 | head -1)"
  if [ -n "$myip" ]; then
    prefix="${myip%.*}"
    Info "扫描 ${prefix}.0/24 的 ${want_port} 端口…"
    # 用 @ 作 xargs 占位符(别用 {}, 会和 shell 的 ${} 混淆)
    DISCOVERED_IP="$(seq 1 254 | xargs -P 64 -I@ sh -c \
      "timeout 1 bash -c 'echo > /dev/tcp/${prefix}.@/${want_port}' 2>/dev/null && echo ${prefix}.@" 2>/dev/null \
      | head -1)"
    [ -n "$DISCOVERED_IP" ] && { Ok "扫描发现候选设备: $DISCOVERED_IP"; return 0; }
  fi

  Bad '无法确定手机地址'
  if [ "$IS_WSL" = 1 ]; then
    Warn '   WSL 没有 USB 直通, 用不了 --setup; 手机重启后请任选其一重设 TCP 模式:'
    Warn '     · Windows 侧装 platform-tools → adb.exe tcpip 5555'
    Warn '     · 装 usbipd-win 把 USB 转发进 WSL: winget install usbipd'
    Warn '   另: WSL 需为 mirrored 网络模式才能直连手机(本机实测即可)'
  else
    Warn '   手机重启后首次需要 USB 连接并加 --setup; 之后可只用 WiFi'
  fi
  Warn '   也可直接指定: npm run adb:wifi -- --ip 192.168.1.4'
  return 1
}

# ============================ 子命令: wifi ============================
do_wifi() {
  local IP='' PORT=5555 SETUP=0
  while [ $# -gt 0 ]; do
    case "$1" in
      -Ip|--ip)     IP="${2:-}"; shift 2 ;;
      -Port|--port) PORT="${2:-}"; shift 2 ;;
      -Setup|--setup|setup) SETUP=1; shift ;;
      -h|--help|help) usage ;;
      *) echo "未知参数: $1"; exit 2 ;;
    esac
  done
  resolve_adb

  discover_ip "$IP" "$PORT" || exit 1
  IP="$DISCOVERED_IP"

  # 重设 TCP 模式(手机重启后必须做一次, 且需要 USB 连接)
  if [ "$SETUP" = 1 ]; then
    Step "重设 TCP 模式 (端口 $PORT)"
    local usb; usb="$(get_usb_serial)"
    if [ -z "$usb" ]; then
      Bad '--setup 需要 USB 连接的设备'
      if [ "$IS_WSL" = 1 ]; then
        Warn '   WSL 看不到 USB(手机插在 Windows 上也没用), 二选一:'
        Warn '     · Windows 侧装 platform-tools → adb.exe tcpip 5555'
        Warn '     · 装 usbipd-win: winget install usbipd; usbipd list; usbipd attach --wsl --busid <id>'
      fi
      exit 1
    fi
    "$adb" -s "$usb" tcpip "$PORT" 2>&1 | while IFS= read -r l; do Info "$l"; done
    sleep 4
    Ok "手机 adbd 已在 $PORT 监听"
  fi

  Step "连接 $IP:$PORT"
  # ⚠️ 首次连接(或手机重启后)会触发手机的「允许 USB 调试」弹窗, 此时 adb 报
  #    `failed to authenticate` —— 这不是地址错, 在手机点「允许」后重连就好。
  #    所以这里重试几次, 而不是一次定生死(实测第一次必失败、第二次即 device)。
  local attempt=0 out=''
  while :; do
    attempt=$((attempt + 1))
    out="$("$adb" connect "$IP:$PORT" 2>&1)"
    printf '%s\n' "$out" | while IFS= read -r l; do Info "$l"; done
    case "$out" in
      *connected*) break ;;
      *authenticate*)
        if [ "$attempt" -lt 3 ]; then
          Warn "需要手机授权(第 $attempt 次) —— 请在手机弹窗点「允许」, 5 秒后重试…"
          sleep 5; continue
        fi
        Bad '认证失败: 手机未授权本机的 adb 密钥'
        Warn '   · 解锁手机并在弹窗点「允许」(弹窗只在那时出现)'
        Warn '   · 或把已授权环境的 ~/.android/adbkey 与 adbkey.pub 复制到本机 ~/.android/'
        exit 1 ;;
      *)
        if [ "$attempt" -lt 2 ]; then sleep 2; continue; fi
        Bad '连接失败(地址可能已变, 试试 --ip 指定)'; exit 1 ;;
    esac
  done
  mkdir -p "$(dirname "$ADB_CACHE")" 2>/dev/null
  printf '%s' "$IP" > "$ADB_CACHE"   # 记住这次成功的地址

  Step '当前设备'
  "$adb" devices -l 2>&1 | while IFS= read -r l; do Info "$l"; done

  local target="$IP:$PORT"
  local probe; probe="$("$adb" -s "$target" shell getprop ro.product.model 2>&1 | tr -d '\r')"
  case "$probe" in
    ''|*error*|*'not found'*)
      Bad '已连接但读不到设备属性, 请检查手机端授权弹窗'
      exit 1 ;;
    *)
      Step '结果'
      Ok "无线通道可用: $probe"
      echo
      echo "   装包: ${C_WHITE}npm run adb:install${C_RST}"
      echo "   其他 adb 命令请加 -s $target" ;;
  esac
}

# ============================ 子命令: install ============================
do_install() {
  local RELEASE=0 TARGET='' apk=''
  while [ $# -gt 0 ]; do
    case "$1" in
      -r|--release|release) RELEASE=1; shift ;;
      -t|--target) TARGET="${2:-}"; shift 2 ;;
      -h|--help|help) usage ;;
      *) echo "未知参数: $1"; exit 2 ;;
    esac
  done
  resolve_adb

  local kind=debug; [ "$RELEASE" = 1 ] && kind=release
  apk="$ROOT/android/app/build/outputs/apk/$kind/app-$kind.apk"
  if [ ! -f "$apk" ]; then
    Bad "找不到 APK: $apk"
    Warn "   先构建: npm run build:android $([ "$RELEASE" = 1 ] && echo '-- --release')"
    exit 1
  fi
  Ok "APK: $apk ($(du -h "$apk" | cut -f1))"

  ensure_adb_server
  [ -z "$TARGET" ] && TARGET="$(connected_target)"
  if [ -z "$TARGET" ]; then
    Info '当前没有已连接的网络设备, 先发现并连接…'
    discover_ip '' 5555 || exit 1
    TARGET="$DISCOVERED_IP:5555"
    "$adb" connect "$TARGET" >/dev/null 2>&1
    sleep 1
    [ -n "$(connected_target)" ] || Die "无法连接到 $TARGET"
  fi
  Ok "目标设备: $TARGET"

  Step "安装 ($kind)"
  # ⚠️ debug 包与 release 包签名不同, 覆盖安装会报 INSTALL_FAILED_UPDATE_INCOMPATIBLE;
  #    换签名(或 debug/release 互换)时必须先卸载, 数据会丢。
  local out; out="$("$adb" -s "$TARGET" install -r "$apk" 2>&1)"
  printf '%s\n' "$out" | while IFS= read -r l; do Info "$l"; done
  case "$out" in
    *Success*) Ok "安装成功 ($kind → $TARGET)" ;;
    *INSTALL_FAILED_UPDATE_INCOMPATIBLE*)
      Bad '签名不一致, 无法覆盖安装'
      Warn '   debug 与 release 签名不同; 换签名需先卸载(数据会丢):'
      Warn "     \"$adb\" -s $TARGET uninstall com.qimen.yinpan"
      exit 1 ;;
    *) Die '安装失败(见上方 adb 输出)' ;;
  esac
}

# ============================ 子命令: list ============================
do_list() {
  resolve_adb
  ensure_adb_server
  Step '设备列表'
  "$adb" devices -l 2>&1 | while IFS= read -r l; do Info "$l"; done
}

# ============================ 派发 ============================
usage() { awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0"; exit 0; }

case "${1:-wifi}" in
  wifi|connect) shift; do_wifi "$@" ;;
  install)      shift; do_install "$@" ;;
  list|devices) shift; do_list "$@" ;;
  -h|--help|help) usage ;;
  *) echo "未知子命令: $1"; echo "可用: wifi | install | list"; exit 2 ;;
esac
