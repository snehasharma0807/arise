<<<<<<< HEAD
import jwt
from fastapi import Header, HTTPException, Request
from app.config import APP_API_KEY, SUPABASE_JWT_SECRET


def verify_api_key(
    request: Request,
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    authorization: str | None = Header(None),
) -> str | None:
    """
    Accept either:
      - X-API-Key header (existing mobile app key)
      - Authorization: Bearer <supabase-jwt> header (Supabase Auth users)

    Returns the Supabase user_id if a valid JWT was provided, else None.
    Raises HTTP 401 if neither form of auth passes.
    """
    # --- Supabase JWT path ---
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ")
        if SUPABASE_JWT_SECRET:
            try:
                payload = jwt.decode(
                    token,
                    SUPABASE_JWT_SECRET,
                    algorithms=["HS256"],
                    audience="authenticated",
                )
                return payload.get("sub")  # Supabase user UUID
            except jwt.ExpiredSignatureError:
                raise HTTPException(status_code=401, detail="JWT has expired.")
            except jwt.InvalidTokenError:
                raise HTTPException(status_code=401, detail="Invalid JWT.")

    # --- X-API-Key path ---
    if not APP_API_KEY:
        # Dev mode: no key configured, allow all requests
        return None
    if x_api_key == APP_API_KEY:
        return None
    raise HTTPException(status_code=401, detail="Invalid API key.")
=======
from typing import Optional

from fastapi import Header, HTTPException
from app.config import APP_API_KEY


def verify_api_key(x_api_key: Optional[str] = Header(None, alias="X-API-Key")) -> None:
    """Validate the X-API-Key header.

    Dev mode: if APP_API_KEY is not configured on the server, all requests are
    allowed regardless of whether the header is present.

    Production: the header must be present and match APP_API_KEY exactly.
    """
    if not APP_API_KEY:
        # Dev mode: no key configured on the server — allow all requests.
        return
    if x_api_key != APP_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key.")
>>>>>>> 7a40a2b (connecting my + ethan work)
