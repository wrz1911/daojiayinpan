#!/usr/bin/env node
/**
 * 开发监听 —— 改动源码即自动重建 bundle 并同步到内网服务器
 * ------------------------------------------------------------------
 * 用法: npm run dev        (Ctrl-C 退出)
 *
 * 为什么需要它: 手机上验证网页版比装 APK 快得多, 但"改一行 → 手动 build →
 * 手动 deploy → 手机下拉刷新"一次要敲三条命令。本脚本把它压成一条:
 * 保存文件 → 自动重建 + 自动同步 → 手机下拉刷新。
 *
 * ⚠️ 忽略规则是**必须**的: qimen_bundle.min.js / yinpan_app.min.css 是构建产物,
 *    重建会改动它们, 不排除就会自触发 → 死循环。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const WATCH_DIRS = ['qimen_app/js', 'qimen_app/css'];
const WATCH_FILES = ['qimen_app/yinpan.html'];

// 构建产物: 忽略(否则自触发死循环)
const IGNORE = [/(^|[\\/])qimen_bundle\.min\.js$/, /(^|[\\/])yinpan_app\.min\.css$/];
// 编辑器临时文件
const IGNORE_TMP = [/~$/, /\.swp$/, /\.tmp$/, /(^|[\\/])\.#/];

const DEBOUNCE_MS = 400;
let timer = null;
let busy = false;
let queued = false;

const stamp = () => new Date().toTimeString().slice(0, 8);
const log = (m) => console.log(`[${stamp()}] ${m}`);

function ignored(p) {
  if (!p) return true;
  return IGNORE.some((re) => re.test(p)) || IGNORE_TMP.some((re) => re.test(p));
}

function run(cmd, args) {
  return spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' }).status === 0;
}

function cycle(reason) {
  if (busy) { queued = true; return; }
  busy = true;
  log(`改动: ${reason}  →  重建 bundle`);
  if (run('bash', ['scripts/build.sh', 'bundle', '--no-deploy'])) {
    log('重建完成  →  同步到内网服务器');
    const ok = run('python3', ['scripts/deploy-web.py']);
    log(ok ? '✅ 已同步 —— 手机下拉刷新即可'
           : '⚠️ 同步失败(检查 .qimen-web-pass / QIMEN_WEB_PASS 或网络)');
  } else {
    log('❌ bundle 重建失败, 已跳过同步');
  }
  busy = false;
  if (queued) { queued = false; cycle('排队中的改动'); }
}

function schedule(p) {
  if (ignored(p)) return;
  clearTimeout(timer);
  timer = setTimeout(() => cycle(path.relative(ROOT, p) || p), DEBOUNCE_MS);
}

log('监听中(Ctrl-C 退出):');
let watched = 0;
for (const d of WATCH_DIRS) {
  const abs = path.join(ROOT, d);
  if (!fs.existsSync(abs)) { log(`  跳过(不存在) ${d}`); continue; }
  log(`  ${d}/`);
  fs.watch(abs, { recursive: true }, (_evt, f) => schedule(f ? path.join(abs, f) : abs));
  watched++;
}
for (const f of WATCH_FILES) {
  const abs = path.join(ROOT, f);
  if (!fs.existsSync(abs)) { log(`  跳过(不存在) ${f}`); continue; }
  log(`  ${f}`);
  fs.watch(abs, () => schedule(abs));
  watched++;
}
if (!watched) {
  console.error('没有可监听的路径, 退出');
  process.exit(1);
}
log(`改动保存后自动重建+同步(防抖 ${DEBOUNCE_MS}ms)`);
