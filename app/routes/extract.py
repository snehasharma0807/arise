from fastapi import APIRouter, Depends, Request, UploadFile, File
from app.auth import verify_api_key
from app.claude_client import _call_claude, _safe_parse_json
from app.image_utils import validate_and_encode_image
from app.prompts import EXTRACT_SYSTEM_PROMPT
from app.rate_limit import limiter, RATE_LIMIT_STRING
from app.schemas import MedicationExtraction

router = APIRouter()


@router.post("/extract", response_model=MedicationExtraction)
@limiter.limit(RATE_LIMIT_STRING)
async def extract_medication(
    request: Request,
    image: UploadFile = File(...),
    _: str | None = Depends(verify_api_key),
):
    raw = await image.read()
    content_type = image.content_type or ""

    b64_image, media_type = validate_and_encode_image(raw, content_type)

    user_content = [
        {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": media_type,
                "data": b64_image,
            },
        },
        {
            "type": "text",
            "text": "Please extract the medication information from this image.",
        },
    ]

    raw_text = _call_claude(EXTRACT_SYSTEM_PROMPT, user_content, max_tokens=256)
    data = _safe_parse_json(raw_text)
    return MedicationExtraction(**data)
