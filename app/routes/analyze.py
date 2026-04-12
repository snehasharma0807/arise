import logging
from fastapi import APIRouter, Depends, Request
from app.auth import verify_api_key
from app.claude_client import _call_claude, _safe_parse_json
from app.database import supabase
from app.prompts import build_analyze_prompt
from app.openfda import fetch_fda_label, format_fda_context
from app.rate_limit import limiter, RATE_LIMIT_STRING
from app.schemas import CombinedRequest, CombinedResponse, RiskInfo, CaregiverCard

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/analyze", response_model=CombinedResponse)
@limiter.limit(RATE_LIMIT_STRING)
async def analyze_medication(
    request: Request,
    body: CombinedRequest,
    user_id: str | None = Depends(verify_api_key),
):
    fda_data = fetch_fda_label(body.medication_name)
    fda_context = format_fda_context(fda_data)

    system_prompt = build_analyze_prompt(
        body.medication_name, body.user_question or "", fda_context
    )

    user_content = [{"type": "text", "text": "Please provide the medication analysis."}]

    raw_text = _call_claude(system_prompt, user_content, max_tokens=512)
    data = _safe_parse_json(raw_text)

    result = CombinedResponse(
        medication_name=data["medication_name"],
        explanation=data["explanation"],
        risk=RiskInfo(**data["risk"]),
        caregiver_card=CaregiverCard(**data["caregiver_card"]),
    )

    # Persist to Supabase if configured
    if supabase is not None:
        try:
            supabase.table("analysis_logs").insert({
                "user_id": user_id,
                "medication_name": result.medication_name,
                "user_question": body.user_question,
                "explanation": result.explanation,
                "risk_level": result.risk.level,
                "risk_explanation": result.risk.explanation,
                "risk_recommendation": result.risk.recommendation,
            }).execute()
        except Exception:
            logger.exception("Failed to persist analysis result to Supabase")

    return result
