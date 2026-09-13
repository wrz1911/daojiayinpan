#!/bin/sh
# 打包 4 个自有 JS 为单一压缩 bundle
# 顺序: constants → engine → chuanren → app(与 standalone.html 原加载顺序一致)
# 四个文件均为 IIFE 包裹, 顺序拼接无作用域冲突, engine 的 'use strict' 指令随 IIFE 保留
# 注意: esbuild 的 stdin 管道模式走 transform API(不支持 --outfile 构建 flag), 结果须重定向 stdout
set -e
cd "$(dirname "$0")/../qimen_app/js"
VER=$(sed -n "s/.*const APP_VERSION = '\([^']*\)'.*/\1/p" yinpan_app.js | head -1)
BANNER=$(mktemp)
cat > "$BANNER" <<EOF
/*!
 * 道家阴盘奇门遁甲 v${VER:-unknown} | MIT License
 * https://github.com/wrz1911/daojiayinpan
 * Copyright (c) 2026 地天泰
 *
 * 本产物含第三方开源组件:
 *   tyme4ts v1.5.2 — Copyright (c) 2024 6tail — MIT License
 *   https://github.com/6tail/tyme4ts
 * 完整许可文本见仓库根目录 LICENSE 与 licenses/tyme4ts-LICENSE。
 */
EOF
{ cat qimen_constants.js qimen_engine_min.js qimen_chuanren.js yinpan_app.js; } \
  | npx esbuild --minify --target=es2017 --loader=js > "$BANNER.body"
# banner 在压缩**之后**前置: esbuild 会把 legal comment 挪到文件末尾, 且 stdin 模式
# 不支持 --banner:js, 所以自行拼接以保证版权声明稳定出现在产物开头。
cat "$BANNER" "$BANNER.body" > qimen_bundle.min.js
rm -f "$BANNER" "$BANNER.body"
printf 'bundle 生成: qimen_app/js/qimen_bundle.min.js (%s bytes)\n' "$(wc -c < qimen_bundle.min.js)"
