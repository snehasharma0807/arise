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

    Dev mode: if APP_API_KEY is not configured and no JWT secret is set,
    all requests are allowed without any header.
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
        # Dev mode: no key configured on the server — allow all requests.
        return None
    if x_api_key == APP_API_KEY:
        return None
    raise HTTPException(status_code=401, detail="Invalid API key.")
