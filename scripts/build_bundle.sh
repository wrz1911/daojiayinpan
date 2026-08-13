#!/bin/sh
# 打包 4 个自有 JS 为单一压缩 bundle
# 顺序: constants → engine → chuanren → app(与 standalone.html 原加载顺序一致)
# 四个文件均为 IIFE 包裹, 顺序拼接无作用域冲突, engine 的 'use strict' 指令随 IIFE 保留
# 注意: esbuild 的 stdin 管道模式走 transform API(不支持 --outfile 构建 flag), 结果须重定向 stdout
set -e
cd "$(dirname "$0")/../qimen_app/js"
{ cat qimen_constants.js qimen_engine_min.js qimen_chuanren.js yinpan_app.js; } \
  | npx esbuild --minify --target=es2017 --loader=js > qimen_bundle.min.js
printf 'bundle 生成: qimen_app/js/qimen_bundle.min.js (%s bytes)\n' "$(wc -c < qimen_bundle.min.js)"
