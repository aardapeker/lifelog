# Regenerates every icon/splash image in assets/. Run from the project root: python3 scripts/make-logo.py assets
import sys
from PIL import Image, ImageDraw, ImageFont, ImageChops
FONTS = 'node_modules/@expo-google-fonts/libre-caslon-text/'
ITALIC = FONTS + '400Regular_Italic/LibreCaslonText_400Regular_Italic.ttf'
REG = FONTS + '400Regular/LibreCaslonText_400Regular.ttf'
BG, MOON = (29, 28, 28, 255), (242, 239, 230, 255)
S = 1024

def glyph_mask(ch, font_path, size, cx, cy, ss=4, stroke=0):
    """Glyph as an L-mode mask, optically centered on (cx, cy)."""
    big = Image.new('L', (S * ss, S * ss), 0)
    f = ImageFont.truetype(font_path, size * ss)
    d = ImageDraw.Draw(big)
    box = d.textbbox((0, 0), ch, font=f, stroke_width=stroke * ss)
    w, h = box[2] - box[0], box[3] - box[1]
    d.text((cx * ss - w / 2 - box[0], cy * ss - h / 2 - box[1]), ch, font=f, fill=255, stroke_width=stroke * ss, stroke_fill=255)
    return big.resize((S, S), Image.LANCZOS)

def circle_mask(cx, cy, r, ss=4):
    big = Image.new('L', (S * ss, S * ss), 0)
    ImageDraw.Draw(big).ellipse(((cx - r) * ss, (cy - r) * ss, (cx + r) * ss, (cy + r) * ss), fill=255)
    return big.resize((S, S), Image.LANCZOS)

def mark_mask(scale):
    """The logo mark: a full moon with a serif italic 'l' (for Lifelog) cut out of it."""
    r = int(S * 0.5 * scale)
    moon = circle_mask(S / 2, S / 2, r)
    letter = glyph_mask('l', ITALIC, int(r * 1.55), S / 2 + r * 0.02, S / 2 + r * 0.04, stroke=max(1, int(r * 0.022)))
    return ImageChops.subtract(moon, letter)

def on(bg, mask, color):
    img = Image.new('RGBA', (S, S), bg)
    img.paste(Image.new('RGBA', (S, S), color), (0, 0), mask)
    return img

out = sys.argv[1]
transparent = (0, 0, 0, 0)
# app icon (legacy / Play-style full square)
on(BG, mark_mask(0.62), MOON).save(f'{out}/icon.png')
# adaptive icon: foreground must sit inside the ~66% safe zone
on(transparent, mark_mask(0.60), MOON).save(f'{out}/android-icon-foreground.png')
Image.new('RGBA', (S, S), BG).save(f'{out}/android-icon-background.png')
on(transparent, mark_mask(0.60), (255, 255, 255, 255)).save(f'{out}/android-icon-monochrome.png')
# splash: just the mark, background colour comes from app.json
on(transparent, mark_mask(0.9), MOON).save(f'{out}/splash-icon.png')
# favicon (unused on Android, kept tidy)
on(BG, mark_mask(0.8), MOON).resize((48, 48), Image.LANCZOS).save(f'{out}/favicon.png')
print('ok')
# notification icon: Android wants a white silhouette on transparent
on(transparent, mark_mask(0.92), (255, 255, 255, 255)).resize((96, 96), Image.LANCZOS).save(f'{out}/notification-icon.png')

# widget preview (what Android shows in the widget picker)
def widget_preview(path):
    W, H, ss = 1000, 440, 2
    img = Image.new('RGBA', (W * ss, H * ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, W * ss, H * ss), radius=70 * ss, fill=BG)
    serif = ImageFont.truetype(REG, 64 * ss)
    sans = ImageFont.truetype('node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf', 36 * ss)
    sansm = ImageFont.truetype('node_modules/@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf', 40 * ss)
    d.text((48 * ss, 40 * ss), 'Lifelog', font=serif, fill=(255, 255, 255, 255))
    d.text((50 * ss, 128 * ss), 'How was the shift?', font=sans, fill=(153, 152, 152, 255))
    bw = (W - 48 * 2 - 28) // 2
    for i, (label, fill, color) in enumerate([('Talk', (255, 255, 255, 255), BG), ('Write', (51, 50, 50, 255), (255, 255, 255, 255))]):
        x0 = 48 + i * (bw + 28)
        box = (x0 * ss, 290 * ss, (x0 + bw) * ss, 400 * ss)
        d.rounded_rectangle(box, radius=55 * ss, fill=fill)
        tb = d.textbbox((0, 0), label, font=sansm)
        d.text(((box[0] + box[2] - (tb[2] - tb[0])) / 2 - tb[0], (box[1] + box[3] - (tb[3] - tb[1])) / 2 - tb[1]), label, font=sansm, fill=color)
    img.resize((W, H), Image.LANCZOS).save(path)

# the widget now starts as a slim 4x1 row, so the picker preview shows that
def widget_preview_slim(path):
    W, H, ss = 1000, 180, 2
    img = Image.new('RGBA', (W * ss, H * ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, W * ss, H * ss), radius=60 * ss, fill=BG)
    serif = ImageFont.truetype(REG, 50 * ss)
    sansm = ImageFont.truetype('node_modules/@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf', 38 * ss)
    tb = d.textbbox((0, 0), 'Lifelog', font=serif)
    d.text((44 * ss, (H * ss - (tb[3] - tb[1])) / 2 - tb[1]), 'Lifelog', font=serif, fill=(255, 255, 255, 255))
    x, bw, gap = 300, (1000 - 300 - 30 - 24) // 2, 24
    for i, (label, fill, color) in enumerate([('Talk', (255, 255, 255, 255), BG), ('Write', (51, 50, 50, 255), (255, 255, 255, 255))]):
        x0 = x + i * (bw + gap)
        box = (x0 * ss, 40 * ss, (x0 + bw) * ss, 140 * ss)
        d.rounded_rectangle(box, radius=50 * ss, fill=fill)
        b = d.textbbox((0, 0), label, font=sansm)
        d.text(((box[0] + box[2] - (b[2] - b[0])) / 2 - b[0], (box[1] + box[3] - (b[3] - b[1])) / 2 - b[1]), label, font=sansm, fill=color)
    img.resize((W, H), Image.LANCZOS).save(path)

widget_preview_slim(f'{out}/widget-preview.png')
