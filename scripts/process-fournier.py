import sys, os
import numpy as np
from PIL import Image, ImageFilter

TARGET = np.array([252, 248, 239], dtype=np.float32)   # papel limpo, branco quente
W = int(os.environ.get('W', '420'))

def clean(path, out):
    im = Image.open(path).convert('RGBA')
    im = im.crop(im.getchannel('A').getbbox())
    # recorte pelo retângulo em que o cartão é opaco em quase todas as linhas/colunas —
    # alguns scans estão levemente inclinados e a borda "escorre" para o transparente
    alpha = np.asarray(im.getchannel('A')) > 200
    ah, aw = alpha.shape
    # mede só na faixa central, longe dos cantos arredondados
    cols = np.nonzero(alpha[int(ah * 0.08):int(ah * 0.92), :].mean(axis=0) > 0.995)[0]
    rows = np.nonzero(alpha[:, int(aw * 0.08):int(aw * 0.92)].mean(axis=1) > 0.995)[0]
    box = (int(cols[0]), int(rows[0]), int(cols[-1]) + 1, int(rows[-1]) + 1)
    im = im.crop(box)
    inset = round(im.width * 0.012)
    im = im.crop((inset, inset, im.width - inset, im.height - inset))
    # qualquer transparência que sobrou vira papel (nunca preto)
    rgb0 = np.asarray(im.convert('RGB')).astype(np.float32)
    lum0 = rgb0.mean(axis=2)
    paper0 = np.median(rgb0[lum0 > 200], axis=0)
    base = Image.new('RGBA', im.size, tuple(int(v) for v in paper0) + (255,))
    im = Image.alpha_composite(base, im)
    arr = np.asarray(im).astype(np.float32)
    rgb, a = arr[..., :3], arr[..., 3:]
    # versão sem pintinhas (mediana 5x5) para as áreas de papel
    med = np.asarray(im.convert('RGB').filter(ImageFilter.MedianFilter(5))).astype(np.float32)
    # cor do papel: mediana dos pixels claros e opacos
    lum = rgb.mean(axis=2)
    opaque = a[..., 0] > 250
    paper = np.median(rgb[(lum > 200) & opaque], axis=0)
    # levels suaves no cartão todo (aproxima o papel do alvo sem lavar a arte)
    black = 18.0
    scale = (TARGET - black) / np.maximum(paper - black, 1)
    leveled = np.clip((rgb - black) * (1 + (scale - 1) * 0.55) + black, 0, 255)
    # máscara de "papel": proximidade da cor do papel (com transição suave)
    dist = np.linalg.norm(med - paper, axis=2)
    m = np.clip(1 - (dist - 34) / 46, 0, 1)[..., None]
    out_rgb = leveled * (1 - m) + TARGET * m
    # textura bem leve do papel, sem as manchas
    grain = np.clip((med - paper) * 0.08, -4, 4) * m
    out_rgb = np.clip(out_rgb + grain, 0, 255)
    res = Image.fromarray(np.concatenate([out_rgb, a], axis=2).astype(np.uint8), 'RGBA')
    # todas as cartas na mesma proporção (recorte centralizado, sem distorcer)
    RATIO = 1.6
    if res.height > res.width * RATIO:
        extra = res.height - round(res.width * RATIO)
        res = res.crop((0, extra // 2, res.width, extra // 2 + round(res.width * RATIO)))
    else:
        nw = round(res.height / RATIO)
        extra = res.width - nw
        res = res.crop((extra // 2, 0, extra // 2 + nw, res.height))
    h = round(W * RATIO)
    res = res.resize((W, h), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=0.8, percent=60, threshold=2))
    # máscara arredondada suave (supersampling 4x)
    from PIL import ImageDraw
    big = Image.new('L', (W * 4, h * 4), 0)
    ImageDraw.Draw(big).rounded_rectangle((0, 0, W * 4 - 1, h * 4 - 1), radius=round(W * 4 * 0.06), fill=255)
    res.putalpha(big.resize((W, h), Image.LANCZOS))
    res.save(out, 'WEBP', quality=86, method=6)
    return res.size, paper

if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    os.makedirs(dst, exist_ok=True)
    for f in sorted(os.listdir(src)):
        if f.endswith('.png'):
            size, paper = clean(os.path.join(src, f), os.path.join(dst, f.replace('.png', '.webp')))
    print('ok', size)
