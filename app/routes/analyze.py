from fastapi import APIRouter, Depends, Request
from app.auth import verify_api_key
from app.claude_client import _call_claude, _safe_parse_json
from app.prompts import build_analyze_prompt
from app.rate_limit import limiter, RATE_LIMIT_STRING
from app.schemas import CombinedRequest, CombinedResponse, RiskInfo, CaregiverCard

router = APIRouter()


@router.post("/analyze", response_model=CombinedResponse)
@limiter.limit(RATE_LIMIT_STRING)
async def analyze_medication(
    request: Request,
    body: CombinedRequest,
    _: None = Depends(verify_api_key),
):
    system_prompt = build_analyze_prompt(
        body.medication_name, body.user_question or ""
    )

    user_content = [{"type": "text", "text": "Please provide the medication analysis."}]

    raw_text = _call_claude(system_prompt, user_content, max_tokens=512)
    data = _safe_parse_json(raw_text)

    return CombinedResponse(
        medication_name=data["medication_name"],
        explanation=data["explanation"],
        risk=RiskInfo(**data["risk"]),
        caregiver_card=CaregiverCard(**data["caregiver_card"]),
    )
