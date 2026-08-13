#!/usr/bin/env node
// 统一测试 runner: 串行运行 tests/ 下全部核心测试, 汇总退出码
// 用法: node tests/run.js  (或 npm test)
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TESTS_DIR = __dirname;
const ROOT = path.join(TESTS_DIR, '..');
const TIMEOUT_MS = 120000;

const tests = fs.readdirSync(TESTS_DIR)
  .filter(f => /^test_.*\.js$/.test(f))
  .sort();

console.log(`╔══════════════════════════════════╗`);
console.log(`║  奇门排盘测试套件 (${tests.length} 个测试)   ║`);
console.log(`╚══════════════════════════════════╝\n`);

let failed = 0;
const t0 = Date.now();
for (const t of tests) {
  const start = Date.now();
  const r = spawnSync(process.execPath, [path.join(TESTS_DIR, t)], {
    cwd: ROOT, timeout: TIMEOUT_MS, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const ms = Date.now() - start;
  const ok = r.status === 0;
  if (!ok) failed++;
  const marker = ok ? '✓ PASS' : (r.status === null ? '✗ TIMEOUT' : `✗ FAIL(${r.status})`);
  console.log(`${marker} ${(ms / 1000).toFixed(1)}s  ${t}`);
  if (!ok && r.status !== null) {
    // 打印失败测试最后几行便于 CI 日志定位
    const out = ((r.stdout || '') + (r.stderr || '')).trim().split('\n');
    console.log('  └ ' + out.slice(-6).join('\n  └ '));
  }
}
const total = (Date.now() - t0) / 1000;
console.log(`\n═══════════════════════════════════`);
console.log(`  通过: ${tests.length - failed}/${tests.length}  总耗时: ${total.toFixed(1)}s`);
if (failed > 0) {
  console.log(`  ✗ ${failed} 个测试失败`);
  process.exit(1);
} else {
  console.log(`  ✓ 全部通过`);
}
console.log(`═══════════════════════════════════`);
