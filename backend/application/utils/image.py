"""Photo validation: magic-byte sniffing plus a full decode / re-encode of every upload.

Only the re-encoded pixels are ever stored, so a file can't smuggle another payload behind a
valid header, carry metadata (EXIF GPS would defeat the 2 km location grid) or be a
decompression bomb. CPU-bound: call `sanitize_image` through asyncio.to_thread.
"""

from io import BytesIO

from PIL import Image, ImageOps

MAX_IMAGE_BYTES = 5 * 1024 * 1024          # upload cap per file (input)
MAX_OUTPUT_BYTES = 10 * 1024 * 1024        # re-encoded result must stay sane too
MAX_IMAGE_PIXELS = 16_000_000              # e.g. 4000 x 4000 (~64 MB as RGBA); larger is refused before decoding
MAX_SIDE = 4096                            # longest side after re-encoding
SNIFF_BYTES = 12                           # enough for every signature below

# Pillow refuses (DecompressionBombError) above 2x this and warns above it; we refuse above it.
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS

_PIL_FORMAT = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}


class InvalidImage(ValueError):
    """The bytes are not an acceptable image. The message is safe to show the user."""


def detect_image_type(data: bytes) -> str | None:
    """Return the MIME type of an allowed image from its magic bytes, or None.

    The client-supplied Content-Type and stored object metadata are never trusted; this is the
    only authority for what gets stored and served.
    """
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def sanitize_image(data: bytes) -> tuple[bytes, str]:
    """Decode `data` and re-encode it in the same format family. Returns (bytes, mime type).

    - JPEG / PNG / WebP only, identified by magic bytes and decoded by that format's decoder;
    - at most MAX_IMAGE_BYTES in, MAX_IMAGE_PIXELS (checked from the header before decoding);
    - animated images keep their first frame only;
    - EXIF orientation is applied, then every bit of metadata (EXIF incl. GPS, XMP, ICC, text
      chunks, comments) is dropped;
    - the longest side is scaled down to MAX_SIDE.
    Raises InvalidImage for anything else (truncated, corrupt, bomb, ...).
    """
    if len(data) > MAX_IMAGE_BYTES:
        raise InvalidImage("file size must not exceed 5 MB")
    mime = detect_image_type(data)
    if mime is None:
        raise InvalidImage("only JPEG, PNG and WebP images are allowed")
    fmt = _PIL_FORMAT[mime]
    try:
        with Image.open(BytesIO(data), formats=[fmt]) as src:
            width, height = src.size
            if width < 1 or height < 1 or width * height > MAX_IMAGE_PIXELS:
                raise InvalidImage("image dimensions are too large")
            if fmt == "JPEG":
                # Decode big JPEGs at a reduced scale (cheap; result is still >= MAX_SIDE).
                src.draft("RGB", (MAX_SIDE, MAX_SIDE))
            src.seek(0)                      # first frame of an animation
            src.load()                       # full decode: truncated / corrupt data fails here
            image = ImageOps.exif_transpose(src)  # a new image (orientation applied, tag removed)
            image = _normalise_mode(image, fmt)
            if max(image.size) > MAX_SIDE:
                image.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
            image.info = {}                  # nothing from the source survives into the output
            out = BytesIO()
            if fmt == "JPEG":
                image.save(out, format="JPEG", quality=90, optimize=True)
            elif fmt == "PNG":
                image.save(out, format="PNG", optimize=False)
            else:
                image.save(out, format="WEBP", quality=90, method=4)
    except InvalidImage:
        raise
    except Image.DecompressionBombError:
        raise InvalidImage("image dimensions are too large") from None
    except Exception:
        # UnidentifiedImageError, OSError (truncated), SyntaxError (bad chunk), MemoryError, ...
        raise InvalidImage("the image could not be read") from None
    result = out.getvalue()
    if len(result) > MAX_OUTPUT_BYTES:
        raise InvalidImage("image is too large")
    return result, mime


def _normalise_mode(image: Image.Image, fmt: str) -> Image.Image:
    has_alpha = image.mode in ("RGBA", "LA", "PA") or (
        image.mode == "P" and "transparency" in image.info
    )
    if fmt == "JPEG":
        return image if image.mode in ("RGB", "L") else image.convert("RGB")
    if image.mode in ("RGB", "RGBA", "L", "LA") and not (fmt == "WEBP" and image.mode in ("L", "LA")):
        return image
    return image.convert("RGBA" if has_alpha else "RGB")
