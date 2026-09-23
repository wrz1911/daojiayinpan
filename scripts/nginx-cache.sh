#!/bin/bash
# ============================================================
# 在 **内网服务器**(192.168.1.3) 上执行 —— 启用静态资源长缓存
# ------------------------------------------------------------
# 背景: 原配置在 `location /` 里写了
#         add_header Cache-Control "no-cache, no-store, must-revalidate";
#       它会作用于**所有**资源, 于是 JS/CSS 也被禁掉缓存 ——
#       每次打开网页都要重下 539KB(gzip 后)。
#
# 做法: 拆成两个 location
#   · 静态资源(引用带 ?v=<APP_VERSION> 版本戳) → expires 30d
#     deploy-web.py 上传时会自动注入版本戳, 发新版 URL 就变, 缓存自然失效
#   · 其余(HTML / APK) → no-cache(而非 no-store), 浏览器仍可走 304 空响应
#
# 安全: 先备份 → 校验 → 通过才 reload; 失败自动回滚。
#
# 用法(在 WSL 里跑, 会提示输入服务器密码):
#   ssh -t wrz@192.168.1.3 'bash -s' < scripts/nginx-cache.sh
# ============================================================
set -euo pipefail

CONF=/etc/nginx/nginx.conf
BACKUP="$CONF.bak-$(date +%Y%m%d-%H%M%S)"

echo "=== ① 备份 ==="
sudo cp "$CONF" "$BACKUP"
echo "  已备份 → $BACKUP"

echo "=== ② 改写缓存策略 ==="
sudo python3 - "$CONF" <<'PYEOF'
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()

old = '''        location / {
            # HTML 不缓存: 页面改名或更新后浏览器不应继续用旧副本
            add_header Cache-Control "no-cache, no-store, must-revalidate";
            root   /srv/http/qimen;
            index  index.html index.htm;
        }'''

new = '''        # 静态资源: 引用都带 ?v=<APP_VERSION> 版本戳(deploy-web.py 上传时注入),
        # 因此可以放心长缓存 —— 发新版时版本号一变 URL 就变, 缓存自动失效。
        location ~* \\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf)$ {
            root   /srv/http/qimen;
            expires 30d;
            add_header Cache-Control "public, max-age=2592000";
            access_log off;
        }

        location / {
            # 其余文件(HTML / APK): 每次校验。
            # 注意用 no-cache 而非 no-store —— 前者允许浏览器发 If-None-Match
            # 拿 304 空响应, 后者会强制重新下载整个文件。
            add_header Cache-Control "no-cache";
            root   /srv/http/qimen;
            index  index.html index.htm;
        }'''

if old not in s:
    print('  ✗ 未找到待替换的 location / 块 —— 配置可能已改过, 请手工检查')
    sys.exit(1)
open(p, 'w', encoding='utf-8').write(s.replace(old, new, 1))
print('  ✓ 已写入新配置')
PYEOF

echo "=== ③ 语法校验 ==="
if sudo nginx -t; then
  echo "=== ④ 重载 ==="
  sudo systemctl reload nginx
  echo "  ✓ 已生效"
  echo
  echo "验证(在 WSL 里执行):"
  echo "  curl -sI http://192.168.1.3/qimen_app/js/qimen_bundle.min.js | grep -i cache-control"
  echo "  期望: public, max-age=2592000"
else
  echo "  ✗ 语法错误, 自动回滚"
  sudo cp "$BACKUP" "$CONF"
  exit 1
fi
