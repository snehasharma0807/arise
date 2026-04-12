import anthropic
from fastapi import HTTPException
from app.config import ANTHROPIC_API_KEY, CLAUDE_MODEL

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


def _call_claude(system: str, user_content: list, max_tokens: int = 1024) -> str:
    try:
        response = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user_content}],
            timeout=30.0,
        )
        return response.content[0].text
    except anthropic.APITimeoutError:
        raise HTTPException(status_code=504, detail="Claude API request timed out.")
    except anthropic.RateLimitError:
        raise HTTPException(status_code=429, detail="Claude API rate limit exceeded.")
    except anthropic.APIError as e:
        raise HTTPException(status_code=502, detail=f"Claude API error: {str(e)}")


def _safe_parse_json(raw_text: str) -> dict:
    import json
    import re

    # Strip markdown code fences if present (```json ... ``` or ``` ... ```)
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw_text.strip())
    cleaned = re.sub(r"\s*```$", "", cleaned.strip())

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to parse Claude response as JSON: {str(e)}",
        )
