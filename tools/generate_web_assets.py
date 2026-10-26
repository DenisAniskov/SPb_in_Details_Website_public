#!/usr/bin/env python3
"""Generate the website's image assets from the approved application icon.

The approved mark is never redrawn. Every file written here is a scaled,
masked or composed copy of assets that already exist in the application
repository:

  docs/branding/original_app_icon.png                  approved icon (1254×1254)
  docs/branding/previews/adaptive_full_512.png         full-bleed icon, 512×512
  docs/branding/previews/adaptive_squircle_light_512.png  launcher preview, light wallpaper
  docs/branding/previews/adaptive_squircle_dark_512.png   launcher preview, dark wallpaper
  docs/branding/previews/branding_icons_sheet.png      icon variants sheet

Outputs land in `public/`:

  favicon.ico                     16/32/48/64 multi-size icon
  favicon-16x16.png               16×16
  favicon-32x32.png               32×32
  apple-touch-icon.png            180×180
  og-image.png                    1200×630 link preview (titled card)
  brand/app-icon-256.png          256×256 header mark
  brand/app-icon-512.webp         512×512 hero icon
  brand/launcher-light-256.webp   launcher preview on light wallpaper
  brand/launcher-dark-256.webp    launcher preview on dark wallpaper
  brand/icon-set-1000.webp        icon variants sheet, 1000 px wide

The script also writes `docs/BRAND_ASSETS.md` with the SHA-256 of every output
and of the source files it read, so the derivation stays traceable.

Usage:
    python tools/generate_web_assets.py --source-repo <path to app repo> \
        [--font-dir <path with roboto-*.ttf>] [--check]

`--check` verifies that the files on disk match what the script would write,
without writing anything (used by the verification run).
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# The approved source icon, as recorded in the application repository
# (docs/branding/icon_metadata.json). A mismatch stops the run: assets may only
# be derived from the icon the owner approved.
APPROVED_ICON_SHA256 = "ad138ca985d832ad1152be4c911ac9e4ec37533c2afd90bb02f1ba1d923f5d5e"

BRAND = {
    "navy_1000": (0, 6, 28),
    "navy_950": (0, 10, 46),
    "navy_900": (1, 19, 76),
    "blue_500": (0, 73, 179),
    "blue_400": (2, 109, 222),
    "sky_300": (85, 177, 246),
    "gold_400": (243, 195, 99),
    "gold_300": (254, 224, 149),
    "text": (244, 247, 255),
    "text_muted": (195, 208, 232),
    "text_soft": (159, 176, 205),
}

REPO_ROOT = Path(__file__).resolve().parent.parent
PUBLIC = REPO_ROOT / "public"
MANIFEST = REPO_ROOT / "docs" / "BRAND_ASSETS.md"

written: list[tuple[str, bytes]] = []


def sha256_of(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def png_bytes(image: Image.Image, *, optimize: bool = True) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=optimize)
    return buffer.getvalue()


def webp_bytes(image: Image.Image, quality: int = 86) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", quality=quality, method=6)
    return buffer.getvalue()


def emit(relative: str, data: bytes, *, check: bool) -> None:
    path = PUBLIC / relative
    written.append((relative, data))
    if check:
        if not path.is_file():
            raise SystemExit(f"FAIL: {relative} отсутствует")
        if path.read_bytes() != data:
            raise SystemExit(f"FAIL: {relative} отличается от ожидаемого")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    print(f"  {relative:34s} {len(data) / 1024:7.1f} КиБ")


def rounded_mask(size: int, radius_ratio: float, supersample: int = 4) -> Image.Image:
    """Antialiased rounded-square mask, drawn at 4× and downsampled."""
    big = size * supersample
    mask = Image.new("L", (big, big), 0)
    draw = ImageDraw.Draw(mask)
    radius = int(big * radius_ratio)
    draw.rounded_rectangle((0, 0, big - 1, big - 1), radius=radius, fill=255)
    return mask.resize((size, size), Image.LANCZOS)


def vertical_gradient(size: tuple[int, int], top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    width, height = size
    gradient = Image.new("RGB", (1, height))
    pixels = gradient.load()
    for y in range(height):
        ratio = y / max(height - 1, 1)
        pixels[0, y] = tuple(  # type: ignore[index]
            round(top[channel] + (bottom[channel] - top[channel]) * ratio) for channel in range(3)
        )
    return gradient.resize((width, height), Image.BILINEAR)


def radial_glow(size: tuple[int, int], center: tuple[float, float], radius: float,
                colour: tuple[int, int, int], strength: float) -> Image.Image:
    """Soft radial glow as an additive overlay."""
    width, height = size
    layer = Image.new("RGB", size, (0, 0, 0))
    pixels = layer.load()
    cx, cy = center[0] * width, center[1] * height
    for y in range(height):
        for x in range(width):
            distance = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if distance >= radius:
                continue
            falloff = (1 - distance / radius) ** 2 * strength
            pixels[x, y] = tuple(round(colour[channel] * falloff) for channel in range(3))  # type: ignore[index]
    return layer


def add_glow(base: Image.Image, glow: Image.Image) -> Image.Image:
    from PIL import ImageChops

    return ImageChops.add(base, glow)


def map_grid(size: tuple[int, int], step: int, colour: tuple[int, int, int], alpha: int) -> Image.Image:
    """Faint map-like grid, alpha-composited over the card."""
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    width, height = size
    for x in range(0, width, step):
        draw.line([(x, 0), (x, height)], fill=(*colour, alpha), width=1)
    for y in range(0, height, step):
        draw.line([(0, y), (width, y)], fill=(*colour, alpha), width=1)
    return layer


def load_font(font_dir: Path, name: str, size: int) -> ImageFont.FreeTypeFont:
    path = font_dir / name
    if not path.is_file():
        raise SystemExit(
            f"FAIL: не найден шрифт {path}. Укажите каталог с roboto-*.ttf через --font-dir "
            "(например, <flutter>/bin/cache/artifacts/material_fonts)."
        )
    return ImageFont.truetype(str(path), size)


def fit_font(font_dir: Path, name: str, max_size: int, max_width: int, text: str,
             min_size: int = 16) -> ImageFont.FreeTypeFont:
    """Largest font size at which `text` still fits into `max_width` pixels."""
    probe = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    for size in range(max_size, min_size - 1, -1):
        font = load_font(font_dir, name, size)
        if probe.textlength(text, font=font) <= max_width:
            return font
    return load_font(font_dir, name, min_size)


def build_og_image(icon: Image.Image, font_dir: Path) -> bytes:
    width, height = 1200, 630
    card = vertical_gradient((width, height), BRAND["navy_900"], BRAND["navy_1000"])
    card = add_glow(card, radial_glow((width, height), (0.08, 0.0), 620, BRAND["blue_400"], 0.34))
    card = add_glow(card, radial_glow((width, height), (0.92, 0.1), 520, BRAND["blue_500"], 0.42))
    card = card.convert("RGBA")
    card.alpha_composite(map_grid((width, height), 60, BRAND["sky_300"], 14))

    icon_size = 300
    icon_x, icon_y = 88, 165
    badge = icon.resize((icon_size, icon_size), Image.LANCZOS).convert("RGBA")
    badge.putalpha(rounded_mask(icon_size, 0.235))
    card.alpha_composite(badge, (icon_x, icon_y))

    draw = ImageDraw.Draw(card)
    text_x = icon_x + icon_size + 64
    # Auto-fitted type: the card must never clip a glyph at the right edge.
    available = width - text_x - 84

    title = "Петербург в деталях"
    slogan = "«Замечай больше. Открывай Петербург.»"
    body = [
        "Пешеходный навигатор по Санкт-Петербургу:",
        "карта и каталог 180 мест, прогулки и оценки среды",
    ]
    meta = "Android 8.0+  ·  v1.0.0  ·  GitHub Release"

    title_font = fit_font(font_dir, "roboto-bold.ttf", 68, available, title)
    slogan_font = fit_font(font_dir, "roboto-medium.ttf", 31, available, slogan)
    body_font = fit_font(font_dir, "roboto-regular.ttf", 28, available, max(body, key=len))
    meta_font = fit_font(font_dir, "roboto-regular.ttf", 23, available, meta)

    draw.text((text_x, 172), title, font=title_font, fill=(*BRAND["text"], 255))
    draw.line([(text_x + 2, 264), (text_x + 110, 264)], fill=(*BRAND["gold_400"], 255), width=4)
    draw.text((text_x, 292), slogan, font=slogan_font, fill=(*BRAND["gold_400"], 255))
    draw.text((text_x, 344), body[0], font=body_font, fill=(*BRAND["text_muted"], 255))
    draw.text((text_x, 384), body[1], font=body_font, fill=(*BRAND["text_muted"], 255))
    draw.text((text_x, 442), meta, font=meta_font, fill=(*BRAND["text_soft"], 255))

    for text_value, font in ((title, title_font), (slogan, slogan_font), (body[0], body_font),
                             (body[1], body_font), (meta, meta_font)):
        if draw.textlength(text_value, font=font) > available:
            raise SystemExit(f"FAIL: строка выходит за границы og-image: {text_value}")

    return png_bytes(card.convert("RGB"), optimize=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-repo", required=True, type=Path,
                        help="path to the application repository (read-only)")
    parser.add_argument("--font-dir", type=Path, default=None,
                        help="directory containing roboto-*.ttf for the OG image")
    parser.add_argument("--check", action="store_true",
                        help="verify files on disk instead of writing them")
    args = parser.parse_args()

    source = args.source_repo.resolve()
    branding = source / "docs" / "branding"
    previews = branding / "previews"

    required = {
        "approved": branding / "original_app_icon.png",
        "full": previews / "adaptive_full_512.png",
        "launcher_light": previews / "adaptive_squircle_light_512.png",
        "launcher_dark": previews / "adaptive_squircle_dark_512.png",
        "sheet": previews / "branding_icons_sheet.png",
    }
    for name, path in required.items():
        if not path.is_file():
            raise SystemExit(f"FAIL: не найден исходник {name}: {path}")

    approved_digest = sha256_of(required["approved"].read_bytes())
    if approved_digest != APPROVED_ICON_SHA256:
        raise SystemExit(
            "FAIL: SHA-256 утверждённой иконки не совпадает с зафиксированным.\n"
            f"  ожидалось: {APPROVED_ICON_SHA256}\n  получено:  {approved_digest}"
        )
    print(f"Утверждённая иконка проверена: SHA-256 {approved_digest[:16]}…")

    font_dir = args.font_dir
    if font_dir is None:
        # Look for the Roboto files in a few portable locations: an explicit
        # `material_fonts` directory next to the repository, a Flutter SDK on
        # PATH, and the current working directory. Pass --font-dir when the
        # fonts live somewhere else.
        candidates = [
            Path.cwd() / "material_fonts",
            Path(__file__).resolve().parent.parent / "material_fonts",
        ]
        flutter_root = os.environ.get("FLUTTER_ROOT")
        if flutter_root:
            candidates.append(
                Path(flutter_root) / "bin" / "cache" / "artifacts" / "material_fonts"
            )
        for candidate in candidates:
            if (candidate / "roboto-bold.ttf").is_file():
                font_dir = candidate
                break
    if font_dir is None or not (font_dir / "roboto-bold.ttf").is_file():
        raise SystemExit("FAIL: не найден каталог шрифтов Roboto для og-image.png (--font-dir).")

    full = Image.open(required["full"]).convert("RGBA")
    if full.size != (512, 512):
        raise SystemExit(f"FAIL: ожидался исходник 512×512, получено {full.size}")

    print("Генерация ресурсов в public/:")

    # Header mark (36 px display, 3× density) and hero icon: scaled only.
    emit("brand/app-icon-128.png", png_bytes(full.convert("RGB").resize((128, 128), Image.LANCZOS)), check=args.check)
    emit("brand/app-icon-512.webp", webp_bytes(full.convert("RGB"), 90), check=args.check)

    # Launcher previews: keep the wallpaper backdrop, they illustrate it.
    for key, name in (("launcher_light", "launcher-light-256"), ("launcher_dark", "launcher-dark-256")):
        preview = Image.open(required[key]).convert("RGB").resize((256, 256), Image.LANCZOS)
        emit(f"brand/{name}.webp", webp_bytes(preview, 88), check=args.check)

    # Icon variants sheet.
    sheet = Image.open(required["sheet"]).convert("RGB")
    sheet_width = 1000
    sheet_height = round(sheet.height * sheet_width / sheet.width)
    emit("brand/icon-set-1000.webp",
         webp_bytes(sheet.resize((sheet_width, sheet_height), Image.LANCZOS), 84), check=args.check)

    # Favicons and touch icon from the full-bleed icon.
    for size in (16, 32):
        emit(f"favicon-{size}x{size}.png",
             png_bytes(full.convert("RGB").resize((size, size), Image.LANCZOS)), check=args.check)
    emit("apple-touch-icon.png",
         png_bytes(full.convert("RGB").resize((180, 180), Image.LANCZOS)), check=args.check)

    ico_buffer = io.BytesIO()
    full.convert("RGB").save(ico_buffer, format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    emit("favicon.ico", ico_buffer.getvalue(), check=args.check)

    # Social preview card.
    emit("og-image.png", build_og_image(full.convert("RGB"), font_dir), check=args.check)

    if args.check:
        print("OK: все ресурсы совпадают с ожидаемыми")
        return 0

    manifest = [
        "# Ресурсы сайта: происхождение и контрольные суммы",
        "",
        "Файл создан `tools/generate_web_assets.py`. Не редактируйте вручную:",
        "перезапустите скрипт после изменения производных ресурсов.",
        "",
        "## Источники (только чтение, репозиторий приложения)",
        "",
        f"- `docs/branding/original_app_icon.png` — SHA-256 `{approved_digest}` (утверждённая иконка)",
    ]
    for name, path in required.items():
        if name == "approved":
            continue
        manifest.append(f"- `{path.relative_to(source).as_posix()}` — SHA-256 `{sha256_of(path.read_bytes())}`")
    manifest += ["", "## Созданные файлы", "", "| Файл | Размер | SHA-256 |", "| --- | --- | --- |"]
    for relative, data in sorted(written):
        manifest.append(f"| `public/{relative}` | {len(data)} байт | `{sha256_of(data)}` |")
    manifest.append("")
    MANIFEST.write_text("\n".join(manifest) + "\n", encoding="utf-8", newline="\n")
    print(f"Манифест записан: {MANIFEST.relative_to(REPO_ROOT).as_posix()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
