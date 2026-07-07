# app/services/storage.py
import base64
import io
import logging
from fastapi import UploadFile
from PIL import Image

logger = logging.getLogger(__name__)

# Firestore's hard document size limit is 1 MiB. Base64 inflates bytes by
# ~33%, so we target a raw JPEG well under that ceiling to leave headroom
# for the rest of the report/cluster document fields.
MAX_DIMENSION = 1280       # longest edge, in pixels
JPEG_QUALITY = 70          # 0-100, lower = smaller file
MAX_RAW_BYTES = 700_000    # ~700KB raw -> ~933KB base64, safely under 1MiB


def _compress_image(file_bytes: bytes) -> bytes:
    """
    Downscales and re-encodes as JPEG so the result comfortably fits inside
    a single Firestore document once base64-encoded. Falls back to
    progressively lower quality if the first pass is still too large.
    """
    img = Image.open(io.BytesIO(file_bytes))

    # Normalize mode — JPEG doesn't support alpha channels (PNG/RGBA input
    # would otherwise raise on save).
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    # Downscale if the longest edge exceeds MAX_DIMENSION, preserving aspect ratio.
    img.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.LANCZOS)

    quality = JPEG_QUALITY
    for _ in range(4):  # a few shrink attempts before giving up
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=quality, optimize=True)
        result = buffer.getvalue()
        if len(result) <= MAX_RAW_BYTES:
            return result
        quality -= 15  # try a smaller file on the next pass

    # Last resort: return whatever the final pass produced. Logged so it's
    # visible during the hackathon rather than silently oversized.
    logger.warning(
        "Compressed image still %d bytes after quality reduction; "
        "Firestore write may fail if this pushes the document over 1MiB.",
        len(result),
    )
    return result


async def upload_evidence_to_cloud(file: UploadFile) -> str:
    """
    HACKATHON BYPASS: Instead of using Firebase Cloud Storage (which requires
    a billing account), we compress the image and store it directly in
    Firestore as a Base64 data URL. Compression keeps documents under
    Firestore's 1MiB limit — uncompressed phone photos (3-8MB) would exceed
    it and fail the write with an opaque Firestore error.
    """
    await file.seek(0)
    file_bytes = await file.read()

    try:
        compressed_bytes = _compress_image(file_bytes)
        mime_type = "image/jpeg"  # we always re-encode to JPEG above
    except Exception as e:
        # If Pillow can't parse it (corrupt upload, unsupported format),
        # fail loudly rather than silently storing an oversized original.
        logger.error("Image compression failed: %s", e)
        raise

    base64_encoded = base64.b64encode(compressed_bytes).decode("utf-8")
    return f"data:{mime_type};base64,{base64_encoded}"