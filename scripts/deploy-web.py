#!/usr/bin/env python3
"""把构建产物同步到内网 web 服务器(nginx @ 192.168.1.3)

浏览器直接开: http://192.168.1.3/qimen_app/yinpan.html —— 手机上验证网页版比装 APK 快得多。

用法:
    npm run deploy:web                # 推网页资源
    npm run deploy:web -- --with-apk  # 顺带推 release APK 与下载页
    npm run deploy:web -- --dry-run   # 只看要推什么, 不实际上传

认证(凭据不写入仓库, 本仓库是公开的):
    1) **优先 SSH 密钥免密** —— 默认读 ~/.ssh/id_ed25519(可用 QIMEN_WEB_KEY 覆盖)。
       一次性配置: 把本机公钥追加到服务器的 ~/.ssh/authorized_keys, 之后永不需口令。
    2) 回退口令 —— 环境变量 QIMEN_WEB_PASS, 否则读项目根 .qimen-web-pass(已 gitignore)。
    3) 其它可覆盖项: QIMEN_WEB_USER / QIMEN_WEB_HOST / QIMEN_WEB_PORT / QIMEN_WEB_ROOT。
"""
import argparse
import hashlib
import os
import re
import shlex
import subprocess
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

try:
    import paramiko
except ImportError:
    print('缺少 paramiko: python -m pip install paramiko')
    sys.exit(2)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

HOST = os.environ.get('QIMEN_WEB_HOST', '192.168.1.3')
PORT = int(os.environ.get('QIMEN_WEB_PORT', '22'))
USER = os.environ.get('QIMEN_WEB_USER', 'wrz')
REMOTE_ROOT = os.environ.get('QIMEN_WEB_ROOT', '/srv/http/qimen')
SITE = os.environ.get('QIMEN_WEB_URL', 'http://%s' % HOST)

# (本地相对路径, 远端相对路径)
WEB_FILES = [
    ('qimen_app/yinpan.html',            'qimen_app/yinpan.html'),
    ('qimen_app/css/yinpan_app.min.css', 'qimen_app/css/yinpan_app.css'),   # 压缩版, 前端引用名不变
    ('qimen_app/js/qimen_bundle.min.js', 'qimen_app/js/qimen_bundle.min.js'),   # tyme4j 已并入(2026-09-24)
    ('qimen_app/js/gong_detail_data.js', 'qimen_app/js/gong_detail_data.js'),
]
APK_FILES = [
    ('qimen_app/apk.html', 'apk.html'),
    ('android/app/build/outputs/apk/release/app-release.apk', 'app-release.apk'),
]


# ── 上传时的版本戳注入 ──────────────────────────────────────────────
# 为什么要它:
#   要让 nginx 对这些静态资源启用长缓存(expires), 引用就必须带版本戳 ——
#   否则发新版后浏览器会继续用旧 JS, 出现「HTML 新 + JS 旧」的功能错乱,
#   比"每次重下"更糟。而带上 ?v=<APP_VERSION> 后, 版本号一变 URL 就变,
#   浏览器自然取到新文件, 「长缓存」与「部署即生效」得以兼得。
# 关键: 只改写**要上传的内容**, 本地源文件保持干净;
#       并且下面的 sha256 校验必须用改写后的数据, 否则会误报"哈希不符"。
def get_app_version():
    p = os.path.join(ROOT, 'qimen_app/js/yinpan_app.js')
    try:
        with open(p, 'r', encoding='utf-8', errors='replace') as fh:
            m = re.search(r"const APP_VERSION = '([^']+)'", fh.read())
        ver = m.group(1) if m else ''
    except OSError:
        ver = ''
    # 附加 git 短 hash(与 scripts/build.sh 的版本戳逻辑保持一致):
    # APP_VERSION 两次发布之间不变, 同版本内的修复部署若 URL 不变,
    # 会被浏览器 30 天缓存吃掉 —— 表现为"修了但用户看不到修复"。
    try:
        sh = subprocess.run(['git', '-C', ROOT, 'rev-parse', '--short', 'HEAD'],
                            capture_output=True, text=True, timeout=10).stdout.strip()
        if sh:
            dirty = subprocess.run(['git', '-C', ROOT, 'diff', '--quiet'],
                                   capture_output=True, timeout=10).returncode != 0
            ver = '%s-g%s%s' % (ver, sh, '-dirty' if dirty else '')
    except Exception:
        pass
    return ver


APP_VERSION = get_app_version()


def stamp_asset(rel_path, data):
    """按需给待上传内容注入版本戳; 不需要改动的原样返回"""
    if not APP_VERSION:
        return data
    name = os.path.basename(rel_path)
    if name not in ('yinpan.html', 'qimen_bundle.min.js'):
        return data
    try:
        text = data.decode('utf-8')
    except UnicodeDecodeError:
        return data
    if name == 'yinpan.html':
        for asset in ('css/yinpan_app.css', 'js/qimen_bundle.min.js'):
            text = text.replace('"%s"' % asset, '"%s?v=%s"' % (asset, APP_VERSION))
    else:
        # bundle 内部懒加载 gong_detail_data.js, 同样要带版本(否则它吃旧缓存)。
        # 注意: esbuild 压缩后引号形式会变(源码单引号 → 产物双引号), 两种都要处理。
        for q in ("'", '"'):
            text = text.replace('%sjs/gong_detail_data.js%s' % (q, q),
                                '%sjs/gong_detail_data.js?v=%s%s' % (q, APP_VERSION, q))
    return text.encode('utf-8')


def get_password():
    pwd = os.environ.get('QIMEN_WEB_PASS')
    if pwd:
        return pwd.strip()
    f = os.path.join(ROOT, '.qimen-web-pass')
    if os.path.isfile(f):
        with open(f, 'r', encoding='utf-8') as fh:
            return fh.read().strip()
    print('未找到服务器口令。二选一:')
    print('  1) 设置环境变量 QIMEN_WEB_PASS')
    print('  2) 在项目根创建 .qimen-web-pass 文件写入口令(该文件已 gitignore)')
    sys.exit(1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--with-apk', action='store_true', help='同时推送 release APK 与下载页')
    ap.add_argument('--dry-run', action='store_true', help='只列出将上传的文件')
    args = ap.parse_args()

    plan = list(WEB_FILES) + (APK_FILES if args.with_apk else [])

    print('=== 待同步(%d 个文件) → %s%s ===' % (len(plan), HOST, REMOTE_ROOT))
    missing = []
    for local, remote in plan:
        lp = os.path.join(ROOT, local)
        ok = os.path.isfile(lp)
        size = os.path.getsize(lp) if ok else 0
        print('  %-52s %10s  %s' % (local + '  →  ' + remote,
                                    ('%d' % size) if ok else '-',
                                    '' if ok else '✗ 不存在'))
        if not ok:
            missing.append(local)
    if missing:
        print('\n缺少文件: %s' % ', '.join(missing))
        if any('qimen_bundle' in m for m in missing):
            print('提示: 先跑 npm run build:bundle')
        if any('.apk' in m for m in missing):
            print('提示: 先跑 npm run build:android -- -Release')
        sys.exit(1)

    if args.dry_run:
        print('\n(--dry-run, 未实际上传)')
        return 0

    print('\n=== 连接 %s@%s ===' % (USER, HOST))
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    # 认证: 优先 SSH 密钥免密(配一次就一劳永逸), 服务器不接受时才回退口令。
    keyfile = os.environ.get('QIMEN_WEB_KEY', os.path.expanduser('~/.ssh/id_ed25519'))
    try:
        if os.path.isfile(keyfile):
            try:
                ssh.connect(HOST, port=PORT, username=USER, key_filename=keyfile,
                            timeout=20, look_for_keys=False, allow_agent=False)
                print('  认证: SSH 密钥 %s' % keyfile)
            except paramiko.AuthenticationException:
                print('  密钥未被服务器接受, 回退口令认证')
                ssh.connect(HOST, port=PORT, username=USER, password=get_password(),
                            timeout=20, look_for_keys=False, allow_agent=False)
                print('  认证: 口令')
        else:
            ssh.connect(HOST, port=PORT, username=USER, password=get_password(),
                        timeout=20, look_for_keys=False, allow_agent=False)
            print('  认证: 口令')
    except Exception as e:
        print('连接失败: %s: %s' % (type(e).__name__, e))
        return 1
    sftp = ssh.open_sftp()

    uploaded = []
    for local, remote in plan:
        lp = os.path.join(ROOT, local)
        rp = REMOTE_ROOT + '/' + remote
        try:
            raw = open(lp, 'rb').read()
            data = stamp_asset(local, raw)          # 注入版本戳(不改本地文件)
            if len(data) != len(raw):
                with sftp.open(rp, 'wb') as rf:     # 内容有改动 → 走内存写入
                    rf.write(data)
            else:
                sftp.put(lp, rp)
            lsize = len(data)
            # 只比大小不够: 改动后字节数可能恰好不变(如常量 [2,3,4,6]→[1,2,4,6]),
            # 再比一次 sha256 才算真的同步成功。
            # 注意: 必须用注入后的 data 算哈希, 否则会与服务端不一致而误报。
            local_hash = hashlib.sha256(data).hexdigest()
            _, out, _ = ssh.exec_command('sha256sum %s' % shlex.quote(rp), timeout=30)
            remote_hash = out.read().decode('utf-8', 'replace').split()[0] if out else ''
            good = (local_hash == remote_hash)
            flag = '✓ sha256 一致' if good else '⚠️ 哈希不符(本地 %s / 远端 %s)' % (local_hash[:12], remote_hash[:12])
            print('  %-46s %10d  %s' % (remote, lsize, flag))
            uploaded.append((remote, lsize, good))
        except Exception as e:
            print('  %-46s  ✗ %s' % (remote, e))
            uploaded.append((remote, 0, False))

    sftp.close()
    ssh.close()

    ok = sum(1 for _, _, good in uploaded if good)
    print('\n=== 完成: %d/%d 个文件已同步 ===' % (ok, len(uploaded)))
    if ok == len(uploaded):
        print('  网页版: %s/qimen_app/yinpan.html' % SITE)
        if args.with_apk:
            print('  安卓包: %s/apk.html' % SITE)
        print('  (手机浏览器直接打开即可, 可能需要下拉刷新清缓存)')
        return 0
    print('  有文件未同步成功, 请检查上面的输出')
    return 1


if __name__ == '__main__':
    sys.exit(main())
