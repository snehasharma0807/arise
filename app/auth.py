from fastapi import Header, HTTPException
from app.config import APP_API_KEY


def verify_api_key(x_api_key: str = Header(..., alias="X-API-Key")) -> None:
    if not APP_API_KEY:
        # Dev mode: no key configured, allow all requests
        return
    if x_api_key != APP_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key.")
