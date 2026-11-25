"""Draws the two photos of a character seed profile (scripts/seed_characters.py) from the
bundled Noto emoji in scripts/characters/emoji (see the LICENSE file there)."""
import hashlib
import io
import random
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

EMOJI_DIR = Path(__file__).resolve().parent / "characters" / "emoji"
SIZE = (800, 1000)
JPEG_QUALITY = 86
VARIATION_SELECTOR = "️"
# Two-colour backdrops in the app's own palette (frontend/src/index.css).
BACKDROPS = [
    ((253, 214, 178), (194, 120, 74)), ((214, 232, 204), (107, 143, 94)), ((250, 209, 209), (196, 98, 98)),
    ((205, 222, 240), (92, 124, 166)), ((244, 226, 178), (200, 156, 62)), ((224, 212, 200), (122, 101, 85)),
]
CARD_BACKGROUND = (253, 246, 237)
CARD_BORDER = (232, 212, 188)
INK = (44, 32, 22)
FLAG_RED = (192, 74, 74)


def emoji_file(emoji: str) -> Path:
    code = "_".join(f"{ord(ch):04x}" for ch in emoji if ch != VARIATION_SELECTOR)
    return EMOJI_DIR / f"{code}.png"


def _emoji(emoji: str, size: int) -> Image.Image:
    return Image.open(emoji_file(emoji)).convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)


def _paste_centred(canvas: Image.Image, picture: Image.Image, x: int, y: int) -> None:
    canvas.paste(picture, (x - picture.width // 2, y - picture.height // 2), picture)


def _jpeg(canvas: Image.Image) -> bytes:
    out = io.BytesIO()
    canvas.save(out, "JPEG", quality=JPEG_QUALITY)
    return out.getvalue()


def draw_portrait(name: str, portrait: str, prop: str) -> bytes:
    """The character in front of a backdrop sprinkled with their prop; the same name always
    gives the same picture."""
    rng = random.Random(hashlib.sha256(name.encode()).digest())
    top, bottom = rng.choice(BACKDROPS)
    width, height = SIZE
    mask = Image.linear_gradient("L").resize(SIZE)
    canvas = Image.composite(Image.new("RGB", SIZE, bottom), Image.new("RGB", SIZE, top), mask)

    small = _emoji(prop, 120)
    faded = small.copy()
    faded.putalpha(small.getchannel("A").point(lambda a: a * 38 // 100))
    for row in range(5):
        for column in range(4):
            x = 100 + column * 200 + (100 if row % 2 else 0) + rng.randint(-25, 25)
            y = 90 + row * 205 + rng.randint(-25, 25)
            turned = faded.rotate(rng.randint(-35, 35), Image.Resampling.BICUBIC, expand=True)
            _paste_centred(canvas, turned, x, y)

    _paste_centred(canvas, _emoji(portrait, 560), width // 2, height // 2 - 20)
    _paste_centred(canvas, _emoji(prop, 250).rotate(rng.randint(-15, 15), Image.Resampling.BICUBIC, expand=True),
                   width - 200, height - 230)
    return _jpeg(canvas)


def draw_red_flag(portrait: str, red_flag: str) -> bytes:
    """A card that states the character's red flag."""
    width, height = SIZE
    canvas = Image.new("RGB", SIZE, CARD_BACKGROUND)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((50, 50, width - 50, height - 50), radius=48, outline=CARD_BORDER, width=6)
    _paste_centred(canvas, _emoji(portrait, 260), width // 2, 250)
    draw.text((width // 2, 450), "RED FLAG", font=ImageFont.load_default(64), fill=FLAG_RED, anchor="mm")
    draw.multiline_text(
        (width // 2, 680), textwrap.fill(red_flag, 22), font=ImageFont.load_default(54), fill=INK,
        anchor="mm", align="center", spacing=18,
    )
    return _jpeg(canvas)
