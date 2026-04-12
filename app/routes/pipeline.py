import logging
from typing import Optional
from fastapi import APIRouter, Depends, Form, HTTPException, Request, UploadFile, File
from app.auth import verify_api_key
from app.claude_client import _call_claude, _safe_parse_json
from app.database import supabase
from app.image_utils import validate_and_encode_image
from app.prompts import EXTRACT_SYSTEM_PROMPT, build_analyze_prompt
from app.openfda import fetch_fda_label, format_fda_context
from app.rate_limit import limiter, RATE_LIMIT_STRING
from app.schemas import (
    CaregiverCard,
    CombinedResponse,
    MedicationExtraction,
    PipelineResponse,
    RiskInfo,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/pipeline", response_model=PipelineResponse)
@limiter.limit(RATE_LIMIT_STRING)
async def pipeline(
    request: Request,
    image: UploadFile = File(...),
    user_question: Optional[str] = Form(None),
    user_id: str | None = Depends(verify_api_key),
):
    # Validate user_question length
    if user_question and len(user_question) > 500:
        raise HTTPException(
            status_code=400,
            detail="user_question must not exceed 500 characters.",
        )

    # --- Step 1: Extract medication info from image ---
    raw = await image.read()
    content_type = image.content_type or ""
    b64_image, media_type = validate_and_encode_image(raw, content_type)

    extract_content = [
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

    extract_raw = _call_claude(EXTRACT_SYSTEM_PROMPT, extract_content, max_tokens=256)
    extract_data = _safe_parse_json(extract_raw)
    extraction = MedicationExtraction(**extract_data)

    # --- Step 2: Analyze extracted medication (augmented with FDA label data) ---
    fda_data = fetch_fda_label(extraction.medication_name)
    fda_context = format_fda_context(fda_data)

    system_prompt = build_analyze_prompt(
        extraction.medication_name, user_question or "", fda_context
    )
    analyze_content = [
        {"type": "text", "text": "Please provide the medication analysis."}
    ]

    analyze_raw = _call_claude(system_prompt, analyze_content, max_tokens=512)
    analyze_data = _safe_parse_json(analyze_raw)

    analysis = CombinedResponse(
        medication_name=analyze_data["medication_name"],
        explanation=analyze_data["explanation"],
        risk=RiskInfo(**analyze_data["risk"]),
        caregiver_card=CaregiverCard(**analyze_data["caregiver_card"]),
    )

    result = PipelineResponse(extraction=extraction, analysis=analysis)

    # Persist to Supabase if configured
    if supabase is not None:
        try:
            supabase.table("medication_history").insert({
                "user_id": user_id,
                "medication_name": extraction.medication_name,
                "dosage": extraction.dosage,
                "form": extraction.form,
                "confidence": extraction.confidence,
                "explanation": analysis.explanation,
                "risk_level": analysis.risk.level,
                "risk_explanation": analysis.risk.explanation,
                "risk_recommendation": analysis.risk.recommendation,
                "caregiver_medication": analysis.caregiver_card.medication,
                "caregiver_purpose": analysis.caregiver_card.purpose,
                "caregiver_how_to_take": analysis.caregiver_card.how_to_take,
                "caregiver_key_warning": analysis.caregiver_card.key_warning,
                "user_question": user_question,
            }).execute()
        except Exception:
            logger.exception("Failed to persist pipeline result to Supabase")

    return result
