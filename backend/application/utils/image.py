MAX_IMAGE_BYTES = 5 * 1024 * 1024


def detect_image_type(data: bytes) -> str | None:
    """Return the MIME type of an allowed image from its magic bytes, or None.

    The client-supplied Content-Type is never trusted; this is the only authority
    for what gets stored and later served.
    """
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None
