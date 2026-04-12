EXTRACT_SYSTEM_PROMPT = """\
You are a medical assistant. A user uploaded an image of a medication bottle or pill. \
Extract the following information. If uncertain, make your best guess.

Return ONLY valid JSON:
{"medication_name": "", "dosage": "", "form": "tablet | capsule | liquid | unknown", "confidence": "high | medium | low"}\
"""


def build_analyze_prompt(medication_name: str, user_question: str = "") -> str:
    return f"""\
You are a medical assistant helping a non-technical, elderly patient.

Medication: {medication_name}
User question (optional): {user_question}

Tasks:
1. Explain the medication simply
2. If a question is asked, assess interaction risk
3. Generate a caregiver summary

Return ONLY valid JSON:
{{
  "medication_name": "",
  "explanation": "",
  "risk": {{
    "level": "safe | caution | dangerous",
    "explanation": "",
    "recommendation": ""
  }},
  "caregiver_card": {{
    "medication": "",
    "purpose": "",
    "how_to_take": "",
    "key_warning": ""
  }}
}}

Rules:
- explanation: max 2 sentences, simple language
- risk: if no question, set all fields to ""
- risk: if unsure, use "caution"
- caregiver_card: each field max 1 sentence
- no medical jargon\
"""
