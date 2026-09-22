<#
  阴盘奇门遁甲 · Windows 开发/构建环境自检与引导
  ------------------------------------------------------------------
  幂等: 可反复运行, 只补齐缺口, 不覆盖已有配置。

  用法:
    npm run setup:windows                    # 只体检, 不改动系统
    powershell -ExecutionPolicy Bypass -File setup-windows.ps1 -Install

  -Install 会自动处理两类轻量缺口:
    · 把 Git 的 bin 目录补进用户级 PATH(让 sh/bash/sed/wc 可用 —— 否则
      npm run build:bundle 等所有 bash 脚本都跑不起来)
    · 缺失时安装 Rust 工具链(stable-x86_64-pc-windows-msvc, 约 250MB)
  其余项目(Node / MSVC C++ 生成工具 / git 身份 / ssh-agent)只打印命令,
  不代为决定 —— 它们要么体积大, 要么需要人的判断(邮箱、口令)。

  不涉及任何密钥: 签名口令等仍只存在 android/gradle.properties 与 GitHub Secrets。
#>
[CmdletBinding()]
param(
  [switch]$Install
)

$ErrorActionPreference = 'Continue'
$script:missing = New-Object System.Collections.ArrayList
$script:toFix = New-Object System.Collections.ArrayList

function Section($t) {
  Write-Host ''
  Write-Host "-- $t " -ForegroundColor Cyan
}
function Pass($name, $detail) {
  Write-Host ("  [正常] {0,-24} {1}" -f $name, $detail) -ForegroundColor Green
}
function Fail($name, $detail, $hint) {
  Write-Host ("  [缺失] {0,-24} {1}" -f $name, $detail) -ForegroundColor Yellow
  if ($hint) { Write-Host ("         > " + $hint) -ForegroundColor DarkGray }
  [void]$script:missing.Add($name)
}
function Warn($name, $detail, $hint) {
  Write-Host ("  [注意] {0,-24} {1}" -f $name, $detail) -ForegroundColor DarkYellow
  if ($hint) { Write-Host ("         > " + $hint) -ForegroundColor DarkGray }
}
function Get-ExePath($name) {
  $c = Get-Command $name -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  return ''
}
function Add-UserPath($dir) {
  $p = [System.Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not $p) { $new = $dir } else { $new = $p.TrimEnd(';') + ';' + $dir }
  [System.Environment]::SetEnvironmentVariable('Path', $new, 'User')
}
function Update-SessionPath {
  # 让本进程立刻看到最新 PATH(改 PATH / 安装工具之后调用)
  $m = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
  $u = [System.Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$m;$u"
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$gitBin = 'C:\Program Files\Git\bin'
$cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
$shExe = Join-Path $gitBin 'sh.exe'

Write-Host ''
Write-Host '阴盘奇门遁甲 · Windows 环境自检' -ForegroundColor White
if ($Install) { Write-Host '模式: 体检 + 自动补齐轻量缺口' -ForegroundColor White }
else { Write-Host '模式: 仅体检(加 -Install 可自动补齐)' -ForegroundColor White }

# ---------- 1. 系统 ----------
Section '系统'
$os = Get-CimInstance Win32_OperatingSystem
Pass 'Windows' ($os.Caption + ' build ' + [System.Environment]::OSVersion.Version.Build)
$lp = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -ErrorAction SilentlyContinue).LongPathsEnabled
if ($lp -eq 1) { Pass '长路径支持' '已启用' }
else { Warn '长路径支持' '未启用' 'Rust/Tauri 依赖路径较深, 建议启用 LongPathsEnabled' }

# ---------- 2. 前端工具链 ----------
Section '前端工具链'
$node = Get-ExePath 'node'
if ($node) {
  $nv = (& node -v) 2>$null
  $major = 0
  if ("$nv" -match '^v(\d+)') { $major = [int]$Matches[1] }
  if ($major -ge 20) { Pass 'Node.js' "$nv ($node)" }
  else { Fail 'Node.js' "$nv 版本过低(需 >= 20)" 'winget install OpenJS.NodeJS.LTS' }
} else {
  Fail 'Node.js' '未安装' 'winget install OpenJS.NodeJS.LTS'
}
if (Get-ExePath 'npm') { Pass 'npm' ((& npm -v) 2>$null) }
else { Fail 'npm' '未安装(随 Node 一起提供)' '' }

if (Test-Path (Join-Path $root 'node_modules')) { Pass 'node_modules' '已安装' }
else { Fail 'node_modules' '未安装' '在项目根执行: npm install --legacy-peer-deps' }

# ---------- 3. Git 与 shell ----------
Section 'Git 与 shell(所有构建脚本都是 bash 脚本)'
if (Get-ExePath 'git') { Pass 'git' ((& git --version) 2>$null) }
else { Fail 'git' '未安装' 'winget install Git.Git' }

$sh = Get-ExePath 'sh'
if ($sh) {
  Pass 'sh / bash' $sh
  if (Test-Path $shExe) { Pass 'sed / wc / mktemp' 'Git 自带, 构建脚本依赖已满足' }
} else {
  if (Test-Path $shExe) {
    Fail 'sh / bash' 'Git 已装但不在 PATH' "把 `"$gitBin`" 加进用户级 PATH"
    [void]$script:toFix.Add('GitPath')
  } else {
    Fail 'sh / bash' '未找到 Git for Windows' 'winget install Git.Git'
  }
}

# ---------- 4. Git 身份与推送通道 ----------
Section 'Git 身份与推送通道(提交与推送的前置)'
$gname = (git config --global user.name) 2>$null
$gmail = (git config --global user.email) 2>$null
if ($gname -and $gmail) {
  Pass 'git 身份' "$gname <$gmail>"
} else {
  Fail 'git 身份' '未配置(commit 会直接失败)' 'git config --global user.name "<名字>"; git config --global user.email "<邮箱>"'
}
$remote = ''
try { $remote = (git -C $root remote get-url origin) 2>$null } catch { $remote = '' }
if ("$remote" -like 'git@*') {
  Pass '远端协议' 'SSH'
  $sshDir = Join-Path $env:USERPROFILE '.ssh'
  $hasKey = (Test-Path (Join-Path $sshDir 'id_ed25519')) -or (Test-Path (Join-Path $sshDir 'id_rsa'))
  if ($hasKey) { Pass 'SSH 私钥' '已存在' }
  else { Warn 'SSH 私钥' '未找到' 'ssh-keygen -t ed25519 生成后, 把公钥加到 GitHub' }
  $agent = Get-Service ssh-agent -ErrorAction SilentlyContinue
  if ($agent -and $agent.Status -eq 'Running') { Pass 'ssh-agent' '运行中' }
  else { Warn 'ssh-agent' '未运行(私钥带口令时无法免交互推送)' '管理员终端: Set-Service ssh-agent -StartupType Automatic; Start-Service ssh-agent; ssh-add' }
} elseif ("$remote" -like 'https://*') {
  Pass '远端协议' 'HTTPS(凭据走 Git Credential Manager)'
} else {
  Warn '远端协议' '未识别 origin' ''
}

# ---------- 5. Rust 工具链 ----------
Section 'Rust 工具链(构建 Windows exe 必需)'
$rustc = Get-ExePath 'rustc'
if (-not $rustc) { $rc = Join-Path $cargoBin 'rustc.exe'; if (Test-Path $rc) { $rustc = $rc } }
if ($rustc) {
  Pass 'rustc' ((& $rustc --version) 2>$null)
  $cargo = Get-ExePath 'cargo'
  if (-not $cargo) { $cg = Join-Path $cargoBin 'cargo.exe'; if (Test-Path $cg) { $cargo = $cg } }
  if ($cargo) { Pass 'cargo' ((& $cargo --version) 2>$null) }
  $hostLine = (& $rustc -vV) 2>$null | Select-String 'host:'
  if ($hostLine) { Pass '默认 target' ($hostLine.Line -replace '^host:\s*', '') }
} else {
  Fail 'Rust' '未安装' '用 -Install 自动安装, 或见 https://rustup.rs'
  [void]$script:toFix.Add('Rust')
}

# ---------- 6. MSVC / SDK / WebView2 ----------
Section 'C++ 工具链与运行时(链接与显示)'
$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
$vsPath = ''
if (Test-Path $vswhere) {
  # 注意: VS 2026(内部版本 18)必须带 -prerelease 才能被 vswhere 识别
  $vsPath = (& $vswhere -latest -prerelease -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath) 2>$null
  if ($vsPath) { $vsPath = ($vsPath | Select-Object -First 1) }
}
if ($vsPath) {
  $short = $vsPath -replace '^C:\\Program Files \(x86\)\\Microsoft Visual Studio\\', ''
  Pass 'MSVC C++ 工具集' $short
} else {
  Fail 'MSVC C++ 工具集' '未找到(需含 VC.Tools.x86.x64 组件)' 'Visual Studio Installer 勾选「使用 C++ 的桌面开发」'
}
$sdk = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\Include' -ErrorAction SilentlyContinue
if ($sdk) { Pass 'Windows SDK' (($sdk | ForEach-Object { $_.Name }) -join ', ') }
else { Fail 'Windows SDK' '未找到' '随「使用 C++ 的桌面开发」工作负载一并安装' }

$wvKey = 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
if (Test-Path $wvKey) { Pass 'WebView2 运行时' (Get-ItemProperty $wvKey).pv }
else { Warn 'WebView2 运行时' '未检出' 'Win11 通常随 Edge 自带; 缺失时 app.exe 会启动失败' }

# ---------- 7. 自动补齐 ----------
if ($Install -and $script:toFix.Count -gt 0) {
  Section '自动补齐'
  foreach ($item in $script:toFix) {
    if ($item -eq 'GitPath') {
      Add-UserPath $gitBin
      Update-SessionPath
      Pass '已写入用户 PATH' $gitBin
    }
    if ($item -eq 'Rust') {
      $exe = Join-Path $env:TEMP 'rustup-init.exe'
      if (-not (Test-Path $exe)) {
        Write-Host '  下载 rustup-init.exe ...' -ForegroundColor Gray
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri 'https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe' -OutFile $exe -UseBasicParsing
      }
      Write-Host '  安装 stable-x86_64-pc-windows-msvc(约 250MB, 请稍候) ...' -ForegroundColor Gray
      & $exe -y --default-toolchain stable-x86_64-pc-windows-msvc --profile default 2>&1 | Out-Null
      Update-SessionPath
      $rc = Join-Path $cargoBin 'rustc.exe'
      if (Test-Path $rc) { Pass 'Rust 已安装' ((& $rc --version) 2>$null) }
      else { Warn 'Rust 安装' '未成功, 请手动运行 rustup-init.exe' }
    }
  }
}

# ---------- 8. 汇总 ----------
Section '汇总'
if ($script:missing.Count -eq 0) {
  Write-Host '  环境就绪, 可以构建 Windows 桌面版。' -ForegroundColor Green
} else {
  Write-Host ("  仍有 {0} 项待处理: {1}" -f $script:missing.Count, ($script:missing -join ', ')) -ForegroundColor Yellow
}
Write-Host ''
Write-Host '  常用命令:' -ForegroundColor White
Write-Host '    npm install --legacy-peer-deps   # 安装前端依赖'
Write-Host '    npm run build:bundle             # 重新打包 bundle + CSS'
Write-Host '    npm run build:windows            # 构建 app.exe(首次约 3 分钟)'
Write-Host '    npx tauri dev                    # 开发模式(热重载)'
Write-Host '    npx eslint qimen_app/js/*.js     # 静态检查(CI 同款)'
Write-Host ''
Write-Host '  说明: PATH 变更只对新开的终端生效, 当前窗口请重开。' -ForegroundColor DarkGray
Write-Host '        deb/rpm/AppImage 与 APK 由 CI 构建, Windows 本地不产出。' -ForegroundColor DarkGray
Write-Host ''
