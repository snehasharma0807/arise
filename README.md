# MedAssist Backend

FastAPI backend for the MedAssist mobile medication assistant app. Provides medication extraction from images and AI-powered analysis via Claude.

---

## Project Structure

```
medassist-backend/
├── app/
│   ├── __init__.py
│   ├── main.py            # FastAPI app, lifespan, middleware, routers, error handler
│   ├── config.py          # Env vars via python-dotenv
│   ├── auth.py            # X-API-Key verification dependency
│   ├── rate_limit.py      # slowapi Limiter setup
│   ├── claude_client.py   # Anthropic client, _call_claude, _safe_parse_json
│   ├── image_utils.py     # Image validation, resize, base64 encode
│   ├── prompts.py         # System prompt constants and builders
│   ├── schemas.py         # Pydantic request/response models
│   └── routes/
│       ├── __init__.py
│       ├── health.py      # GET /health
│       ├── extract.py     # POST /extract
│       ├── analyze.py     # POST /analyze
│       └── pipeline.py    # POST /pipeline
├── requirements.txt
├── .env.example
└── README.md
```

---

## Quick Start

```bash
# 1. Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY (and optionally APP_API_KEY)

# 4. Run the server
python -m app.main

# Swagger UI available at:
# http://localhost:8000/docs
```

---

## Endpoints

### GET /health

No auth required. Returns server status and active model.

```bash
curl http://localhost:8000/health
```

```json
{"status": "ok", "model": "claude-sonnet-4-6"}
```

---

### POST /extract

Upload an image of a medication bottle or pill. Claude extracts structured medication info.

**Auth:** `X-API-Key` header required (unless `APP_API_KEY` is empty).  
**Body:** `multipart/form-data` with field `image` (JPEG/PNG/WebP/GIF, max 5 MB).

```bash
curl -X POST http://localhost:8000/extract \
  -H "X-API-Key: your-secret-app-key-here" \
  -F "image=@/path/to/bottle.jpg"
```

```json
{
  "medication_name": "Lisinopril",
  "dosage": "10mg",
  "form": "tablet",
  "confidence": "high"
}
```

---

### POST /analyze

Analyze a named medication and optionally answer a user question. Returns plain-language explanation, risk assessment, and a caregiver card.

**Auth:** `X-API-Key` header required.  
**Body:** JSON.

```bash
curl -X POST http://localhost:8000/analyze \
  -H "X-API-Key: your-secret-app-key-here" \
  -H "Content-Type: application/json" \
  -d '{"medication_name": "Lisinopril", "user_question": "Can I take this with ibuprofen?"}'
```

```json
{
  "medication_name": "Lisinopril",
  "explanation": "Lisinopril helps lower blood pressure by relaxing your blood vessels. It is usually taken once a day.",
  "risk": {
    "level": "caution",
    "explanation": "Taking ibuprofen with Lisinopril can reduce how well the medication works and may harm your kidneys.",
    "recommendation": "Ask your doctor or pharmacist before combining these medications."
  },
  "caregiver_card": {
    "medication": "Lisinopril 10mg",
    "purpose": "Controls high blood pressure.",
    "how_to_take": "Take one tablet by mouth once daily, with or without food.",
    "key_warning": "Avoid ibuprofen and other NSAIDs unless approved by a doctor."
  }
}
```

---

### POST /pipeline

Full end-to-end flow: upload an image, extract the medication name, then analyze it — in one request.

**Auth:** `X-API-Key` header required.  
**Body:** `multipart/form-data` with `image` (required) and `user_question` (optional string, max 500 chars).

```bash
curl -X POST http://localhost:8000/pipeline \
  -H "X-API-Key: your-secret-app-key-here" \
  -F "image=@/path/to/bottle.jpg" \
  -F "user_question=Is it safe to take this at night?"
```

```json
{
  "extraction": {
    "medication_name": "Metformin",
    "dosage": "500mg",
    "form": "tablet",
    "confidence": "high"
  },
  "analysis": {
    "medication_name": "Metformin",
    "explanation": "Metformin helps control blood sugar levels in people with type 2 diabetes. It is usually taken with meals.",
    "risk": {
      "level": "safe",
      "explanation": "Taking Metformin at night with your evening meal is a common and safe practice.",
      "recommendation": "Take it with dinner to reduce stomach upset."
    },
    "caregiver_card": {
      "medication": "Metformin 500mg",
      "purpose": "Controls blood sugar for type 2 diabetes.",
      "how_to_take": "Take with meals, up to three times daily as directed.",
      "key_warning": "Do not skip meals while taking this medication."
    }
  }
}
```

---

## Rate Limits

| Window  | Default | Env Variable            |
|---------|---------|-------------------------|
| Minute  | 5       | `RATE_LIMIT_PER_MINUTE` |
| Hour    | 30      | `RATE_LIMIT_PER_HOUR`   |
| Day     | 100     | `RATE_LIMIT_PER_DAY`    |

Limits apply per client IP. Returns HTTP `429` when exceeded.  
`/health` is exempt from rate limiting.

---

## Cost Tuning

**Model choice**

| Model               | ID                    | Notes                                  |
|---------------------|-----------------------|----------------------------------------|
| Claude Sonnet 4.6   | `claude-sonnet-4-6`   | Default — good quality/cost balance    |
| Claude Haiku 4.5    | `claude-haiku-4-5-20251001` | Faster, cheaper; lower accuracy  |

Set `CLAUDE_MODEL` in `.env` to switch.

**Token caps**

- `/extract` uses `max_tokens=256` — extraction JSON is small.
- `/analyze` and `/pipeline` step 2 use `max_tokens=512`.
- Raise these only if responses are being cut off.

**Image resizing savings**

Images are automatically resized so the longest side never exceeds `MAX_IMAGE_DIMENSION` (default 1568px) before being sent to Claude. Claude's vision pricing is based on image tile count — a 4000px image can be 6–8× more expensive than a resized equivalent with no meaningful accuracy loss for label/text extraction.

---

## Production Checklist

- [ ] **Set a strong `APP_API_KEY`** and store it in the mobile app's secure storage (iOS Keychain / Android EncryptedSharedPreferences). Never hardcode it.
- [ ] **Tighten CORS**: replace `allow_origins=["*"]` in `main.py` with your app's specific origin(s).
- [ ] **Run behind a reverse proxy** (nginx, Caddy) with HTTPS/TLS termination. Never expose port 8000 directly.
- [ ] **Switch slowapi storage to Redis** for multi-worker / multi-instance deployments. The default in-memory store is per-process and won't share state across workers.
- [ ] **Add per-user rate limiting** once you have an auth layer — pass a user ID as the key function instead of IP, so shared NAT/VPN IPs don't block multiple legitimate users.
- [ ] **Add monitoring** (Sentry for error tracking, Datadog/Grafana for latency and request volume) so you can react to API cost spikes quickly.
- [ ] **Set resource limits** on your container/VM (CPU, memory) and configure a process manager (gunicorn + uvicorn workers) for production concurrency.
# arise
