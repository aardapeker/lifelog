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
