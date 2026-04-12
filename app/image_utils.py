import base64
import io
from fastapi import HTTPException
from PIL import Image
from app.config import ALLOWED_MIME_TYPES, MAX_IMAGE_SIZE_MB, MAX_IMAGE_DIMENSION


def validate_and_encode_image(raw: bytes, content_type: str) -> tuple[str, str]:
    # Validate MIME type
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image type '{content_type}'. Allowed: {', '.join(sorted(ALLOWED_MIME_TYPES))}",
        )

    # Validate file size
    max_bytes = MAX_IMAGE_SIZE_MB * 1024 * 1024
    if len(raw) > max_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"Image exceeds maximum allowed size of {MAX_IMAGE_SIZE_MB} MB.",
        )

    img = Image.open(io.BytesIO(raw))
    original_format = img.format  # "JPEG", "PNG", "WEBP", "GIF", or None

    # Resize if the longest side exceeds the limit
    width, height = img.size
    if max(width, height) > MAX_IMAGE_DIMENSION:
        scale = MAX_IMAGE_DIMENSION / max(width, height)
        new_size = (int(width * scale), int(height * scale))
        img = img.resize(new_size, Image.LANCZOS)

    # Re-encode: keep PNG for potential transparency, use JPEG for everything else
    output = io.BytesIO()
    if original_format == "PNG":
        img = img.convert("RGBA") if img.mode in ("P", "LA") else img
        img.save(output, format="PNG", optimize=True)
        media_type = "image/png"
    else:
        if img.mode in ("RGBA", "P", "LA"):
            img = img.convert("RGB")
        img.save(output, format="JPEG", quality=85)
        media_type = "image/jpeg"

    encoded = base64.standard_b64encode(output.getvalue()).decode("utf-8")
    return encoded, media_type
