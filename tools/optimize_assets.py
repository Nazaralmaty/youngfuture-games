#!/usr/bin/env python3
"""
optimize_assets.py — готовит сгенерированные картинки к вебу.

kie.ai отдаёт 2K PNG по ~2 МБ. Игра открывается по ссылке с телефона,
поэтому фон в 2 МБ недопустим: ужимаем под реальный размер контейнера
(максимум 460 CSS-пикселей ширины, ×2 под retina) и переводим в WebP.

  python3 tools/optimize_assets.py
  python3 tools/optimize_assets.py --quality 78
"""

import argparse
import os
import sys

try:
    from PIL import Image
except ImportError:
    print("ОШИБКА: нужен Pillow → pip3 install Pillow", file=sys.stderr)
    sys.exit(1)

SRC = "assets/generated"
OUT = "assets"

# контейнер игры — 460×920 CSS-пикселей, берём ×2 под retina
BG_MAX = (920, 1840)
ICON_MAX = (256, 256)


def optimize(path, out_path, box, quality):
    with Image.open(path) as im:
        im = im.convert("RGB")
        before = im.size
        im.thumbnail(box, Image.LANCZOS)
        im.save(out_path, "WEBP", quality=quality, method=6)
    return before, im.size


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--quality", type=int, default=82)
    parser.add_argument("--src", default=SRC)
    parser.add_argument("--out", default=OUT)
    args = parser.parse_args()

    if not os.path.isdir(args.src):
        print(f"ОШИБКА: нет папки {args.src}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(args.out, exist_ok=True)
    total_before = total_after = 0
    rows = []

    for name in sorted(os.listdir(args.src)):
        if not name.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
            continue
        src = os.path.join(args.src, name)
        stem = os.path.splitext(name)[0]
        box = ICON_MAX if stem.startswith("icon_") else BG_MAX
        dst = os.path.join(args.out, stem + ".webp")

        size_before = os.path.getsize(src)
        dims_before, dims_after = optimize(src, dst, box, args.quality)
        size_after = os.path.getsize(dst)

        total_before += size_before
        total_after += size_after
        rows.append((stem, dims_before, dims_after, size_before, size_after))

    if not rows:
        print(f"в {args.src} нечего оптимизировать")
        return

    print(f"{'файл':<18} {'было':<12} {'стало':<12} {'вес':<20}")
    for stem, db, da, sb, sa in rows:
        print(f"{stem:<18} {db[0]}×{db[1]:<7} {da[0]}×{da[1]:<7} "
              f"{sb/1024:>6.0f}KB → {sa/1024:>5.0f}KB")
    print(f"\nвсего: {total_before/1024/1024:.1f}MB → {total_after/1024/1024:.2f}MB "
          f"({100 - total_after * 100 / total_before:.0f}% меньше)")
    print(f"готовые файлы: {args.out}/*.webp — их и подключает игра")


if __name__ == "__main__":
    main()
