#!/usr/bin/env python3
"""
生成 Android 启动图标 —— 复现 CI 里那条 ImageMagick 命令的效果:
    convert -background '#f5f5f5' -density 300 taiji.svg -resize ${s}x${s} \
            -gravity center -extent ${s}x${s} "$dir/ic_launcher.png"

Windows 上通常没有 ImageMagick, 故用纯 Python(svglib 渲染 SVG + Pillow 做缩放/居中/铺底)。
用法: python make_launcher_icons.py <taiji.svg> <android/app/src/main/res>
"""
import os
import sys

try:
    from svglib.svglib import svg2rlg
    from reportlab.graphics import renderPM
    from PIL import Image
except ImportError as e:
    print('缺少依赖: %s' % e)
    print('请先执行: python -m pip install svglib reportlab pillow')
    sys.exit(2)

# CI 的尺寸映射(mipmap-<name> → 像素)
SIZES = [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]
BG = (0xF5, 0xF5, 0xF5, 255)   # CI 用的 -background '#f5f5f5'


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    svg_path, res_dir = sys.argv[1], sys.argv[2]

    if not os.path.isfile(svg_path):
        print('找不到 SVG: %s' % svg_path)
        sys.exit(1)
    if not os.path.isdir(res_dir):
        print('找不到资源目录: %s' % res_dir)
        sys.exit(1)

    # 渲染到高分辨率一次, 再缩到各档尺寸(比每档单独渲染更稳、更快)
    drawing = svg2rlg(svg_path)
    if drawing is None:
        print('SVG 渲染失败(svglib 无法解析): %s' % svg_path)
        sys.exit(1)
    longest = max(drawing.width, drawing.height) or 1
    scale = 1024.0 / longest
    drawing.scale(scale, scale)
    drawing.width *= scale
    drawing.height *= scale

    tmp = os.path.join(res_dir, '_icon_tmp.png')
    renderPM.drawToFile(drawing, tmp, fmt='PNG', bgColor=None)
    base = Image.open(tmp).convert('RGBA')
    print('SVG 渲染尺寸: %dx%d' % (base.width, base.height))

    written = []
    for name, px in SIZES:
        im = base.copy()
        im.thumbnail((px, px), Image.LANCZOS)          # -resize NxN (等比)
        canvas = Image.new('RGBA', (px, px), BG)       # -background + -extent
        canvas.paste(im, ((px - im.width) // 2, (px - im.height) // 2), im)   # -gravity center
        d = os.path.join(res_dir, 'mipmap-%s' % name)
        os.makedirs(d, exist_ok=True)
        for fname in ('ic_launcher.png', 'ic_launcher_round.png'):
            out = os.path.join(d, fname)
            canvas.save(out, 'PNG')
            written.append(os.path.relpath(out, res_dir))
    os.remove(tmp)

    print('已生成 %d 个图标文件:' % len(written))
    for w in written:
        print('  ' + w)
    return 0


if __name__ == '__main__':
    sys.exit(main())
