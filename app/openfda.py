"""
Fetch structured drug label data from the OpenFDA Drug Labels API.
https://open.fda.gov/apis/drug/label/
"""

import logging
import urllib.parse
import urllib.request
import json
from typing import Optional

logger = logging.getLogger(__name__)

OPENFDA_LABEL_URL = "https://api.fda.gov/drug/label.json"


def _first(fields: list, data: dict) -> str:
    """Return the first non-empty value found among a list of field names."""
    for field in fields:
        val = data.get(field)
        if val and isinstance(val, list) and val[0]:
            return val[0].strip()
    return ""


def fetch_fda_label(medication_name: str) -> Optional[dict]:
    """
    Query OpenFDA for the drug label matching `medication_name`.
    Returns a dict of curated label sections, or None if not found.
    """
    # Try generic name first, then brand name
    for search_field in ("openfda.generic_name", "openfda.brand_name"):
        encoded = urllib.parse.quote(f'{search_field}:"{medication_name}"')
        url = f"{OPENFDA_LABEL_URL}?search={encoded}&limit=1"
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "Arise-MedApp/1.0"},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                body = json.loads(resp.read().decode())
            results = body.get("results", [])
            if results:
                label = results[0]
                return {
                    "indications": _first(["indications_and_usage"], label),
                    "warnings": _first(["warnings", "warnings_and_cautions", "boxed_warning"], label),
                    "drug_interactions": _first(["drug_interactions"], label),
                    "dosage": _first(["dosage_and_administration"], label),
                    "contraindications": _first(["contraindications"], label),
                    "adverse_reactions": _first(["adverse_reactions"], label),
                }
        except Exception as exc:
            logger.debug("OpenFDA lookup failed for %s (%s): %s", medication_name, search_field, exc)

    return None


def format_fda_context(fda: Optional[dict]) -> str:
    """Convert the FDA label dict into a compact context block for the prompt."""
    if not fda:
        return ""

    sections = [
        ("INDICATIONS", fda.get("indications")),
        ("WARNINGS", fda.get("warnings")),
        ("DRUG INTERACTIONS", fda.get("drug_interactions")),
        ("DOSAGE", fda.get("dosage")),
        ("CONTRAINDICATIONS", fda.get("contraindications")),
        ("ADVERSE REACTIONS", fda.get("adverse_reactions")),
    ]

    lines = ["=== FDA DRUG LABEL DATA (use this as the authoritative source) ==="]
    for title, content in sections:
        if content:
            # Truncate very long label sections to keep prompt size reasonable
            truncated = content[:800] + "…" if len(content) > 800 else content
            lines.append(f"\n[{title}]\n{truncated}")

    return "\n".join(lines) if len(lines) > 1 else ""
