from typing import Optional
from pydantic import BaseModel, field_validator, Field


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class CombinedRequest(BaseModel):
    medication_name: str = Field(..., min_length=1, max_length=200)
    user_question: Optional[str] = Field(None, max_length=500)

    @field_validator("medication_name", mode="before")
    @classmethod
    def strip_medication_name(cls, v: str) -> str:
        return v.strip() if isinstance(v, str) else v

    @field_validator("user_question", mode="before")
    @classmethod
    def strip_user_question(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str):
            return v.strip() or None
        return v


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class MedicationExtraction(BaseModel):
    medication_name: str
    dosage: str
    form: str
    confidence: str


class RiskInfo(BaseModel):
    level: str
    explanation: str
    recommendation: str


class CaregiverCard(BaseModel):
    medication: str
    purpose: str
    how_to_take: str
    key_warning: str


class CombinedResponse(BaseModel):
    medication_name: str
    explanation: str
    risk: RiskInfo
    caregiver_card: CaregiverCard


class PipelineResponse(BaseModel):
    extraction: MedicationExtraction
    analysis: CombinedResponse


class HealthCheck(BaseModel):
    status: str
    model: str
