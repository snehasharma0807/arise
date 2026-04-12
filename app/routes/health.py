from fastapi import APIRouter
from app.config import CLAUDE_MODEL
from app.schemas import HealthCheck

router = APIRouter()


@router.get("/health", response_model=HealthCheck)
def health_check():
    return {"status": "ok", "model": CLAUDE_MODEL}
