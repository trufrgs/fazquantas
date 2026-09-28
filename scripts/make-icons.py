"""Gera ícones e splash do app a partir das cartas (espadão + bastião sobre madeira).

Uso: python scripts/make-icons.py   (requer Pillow)
Saídas: apps/web/public/icons/* (PWA/web) e apps/web/assets/* (entrada do @capacitor/assets).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
CARDS = ROOT / 'apps/web/public/cards'
PUBLIC = ROOT / 'apps/web/public/icons'
ASSETS = ROOT / 'apps/web/assets'


def wood(size: int) -> Image.Image:
    """Fundo de madeira escura com luz no centro (sem textura fina: ícone precisa ler pequeno)."""
    img = Image.new('RGB', (size, size), (58, 34, 19))
    light = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(light)
    for i in range(60, 0, -1):
        r = size * 0.75 * i / 60
        d.ellipse((size / 2 - r, size * 0.45 - r, size / 2 + r, size * 0.45 + r), fill=int(255 * (1 - i / 60) ** 1.4))
    warm = Image.new('RGB', (size, size), (150, 94, 52))
    img = Image.composite(warm, img, light.filter(ImageFilter.GaussianBlur(size / 20)))
    # veios horizontais bem sutis e irregulares
    overlay = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    grain = ImageDraw.Draw(overlay)
    step = max(3, size // 40)
    for i, y in enumerate(range(0, size, step)):
        if i % 3 != 1:
            grain.line((0, y + (i * 7) % step, size, y + (i * 5) % step), fill=(20, 10, 4, 38), width=max(1, size // 400))
    overlay = overlay.filter(ImageFilter.GaussianBlur(size / 500))
    return Image.alpha_composite(img.convert('RGBA'), overlay).convert('RGB')


def card_layer(name: str, width: int, angle: float) -> Image.Image:
    card = Image.open(CARDS / f'{name}.webp').convert('RGBA')
    card = card.resize((width, round(width * card.height / card.width)), Image.LANCZOS)
    return card.rotate(angle, resample=Image.BICUBIC, expand=True)


def compose(size: int, card_scale: float, background: bool = True) -> Image.Image:
    canvas = wood(size).convert('RGBA') if background else Image.new('RGBA', (size, size), (0, 0, 0, 0))
    w = round(size * card_scale)
    for name, angle, dx in (('P1', 13, -0.13), ('E1', -9, 0.1)):
        layer = card_layer(name, w, angle)
        x = round(size / 2 - layer.width / 2 + dx * size)
        y = round(size / 2 - layer.height / 2 + size * 0.02)
        shadow = Image.new('RGBA', layer.size, (0, 0, 0, 0))
        shadow.putalpha(layer.getchannel('A').point(lambda a: int(a * 0.55)))
        shadow = shadow.filter(ImageFilter.GaussianBlur(size / 60))
        canvas.alpha_composite(shadow, (x + round(size * 0.012), y + round(size * 0.025)))
        canvas.alpha_composite(layer, (x, y))
    return canvas


def main() -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    ASSETS.mkdir(parents=True, exist_ok=True)
    icon = compose(1024, 0.46)
    icon.convert('RGB').save(ASSETS / 'icon-only.png')
    compose(1024, 0.36, background=False).save(ASSETS / 'icon-foreground.png')
    wood(1024).save(ASSETS / 'icon-background.png')
    splash = Image.new('RGB', (2732, 2732), (29, 18, 11))
    splash_art = compose(900, 0.46)
    mask = Image.new('L', (900, 900), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, 899, 899), radius=200, fill=255)
    splash.paste(splash_art.convert('RGB'), (916, 916), mask)
    splash.save(ASSETS / 'splash.png')
    splash.save(ASSETS / 'splash-dark.png')

    for size, name in ((192, 'icon-192.png'), (512, 'icon-512.png'), (180, 'apple-touch-icon.png'), (64, 'favicon-64.png')):
        icon.resize((size, size), Image.LANCZOS).convert('RGB').save(PUBLIC / name)
    maskable = compose(512, 0.34)
    maskable.convert('RGB').save(PUBLIC / 'icon-maskable-512.png')
    print('ok')


def native() -> None:
    """Sobrescreve ícones e splash dos projetos Capacitor, mantendo os tamanhos do template."""
    web = ROOT / 'apps/web'
    icon = compose(1024, 0.46).convert('RGB')
    fg = compose(1024, 0.36, background=False)

    def splash_at(w: int, h: int) -> Image.Image:
        img = Image.new('RGB', (w, h), (29, 18, 11))
        side = round(min(w, h) * 0.34)
        art = compose(side, 0.46).convert('RGB')
        m = Image.new('L', (side, side), 0)
        ImageDraw.Draw(m).rounded_rectangle((0, 0, side - 1, side - 1), radius=round(side * 0.22), fill=255)
        img.paste(art, ((w - side) // 2, (h - side) // 2), m)
        return img

    res = web / 'android/app/src/main/res'
    for f in sorted(res.glob('mipmap-*/*.png')):
        size = Image.open(f).size
        if f.name == 'ic_launcher.png':
            icon.resize(size, Image.LANCZOS).save(f)
        elif f.name == 'ic_launcher_round.png':
            m = Image.new('L', size, 0)
            ImageDraw.Draw(m).ellipse((0, 0, size[0] - 1, size[1] - 1), fill=255)
            out = Image.new('RGBA', size, (0, 0, 0, 0))
            out.paste(icon.resize(size, Image.LANCZOS), (0, 0), m)
            out.save(f)
        elif f.name == 'ic_launcher_foreground.png':
            fg.resize(size, Image.LANCZOS).save(f)
    for f in sorted(res.glob('drawable*/splash.png')):
        w, h = Image.open(f).size
        splash_at(w, h).save(f)
    bg = res / 'values/ic_launcher_background.xml'
    if bg.exists():
        bg.write_text(
            '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
            '    <color name="ic_launcher_background">#3A2213</color>\n</resources>\n'
        )
    xc = web / 'ios/App/App/Assets.xcassets'
    for f in sorted(xc.glob('AppIcon.appiconset/*.png')):
        icon.resize(Image.open(f).size, Image.LANCZOS).save(f)
    for f in sorted(xc.glob('Splash.imageset/*.png')):
        w, h = Image.open(f).size
        splash_at(w, h).save(f)
    print('native ok')


if __name__ == '__main__':
    import sys
    main()
    if '--native' in sys.argv:
        native()
