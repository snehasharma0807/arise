# Arise — Frontend Integration Guide

Everything the UI teammate needs to wire the frontend to our backend layers.

---

## Architecture at a glance

```
[User uploads image]
        │
        ▼
FastAPI  /pipeline  ──── Claude (vision + analysis)
        │
        │  returns PipelineResponse (see below)
        │
        ▼
useFinalVoiceOutput()   ← the ONE hook you need
        │
        ├─ format-safety-speech  (Supabase Edge Fn → Claude)
        ├─ combine-voice-output  (Supabase Edge Fn → Claude)
        └─ text-to-speech        (Supabase Edge Fn → ElevenLabs)
                │
                ▼
           Audio plays
```

---

## Step 1 — Environment variables

Copy `.env.example` to `.env.local` and fill in:

```env
# FastAPI backend
NEXT_PUBLIC_API_URL=http://localhost:8000      # or your deployed URL
NEXT_PUBLIC_APP_API_KEY=dev-key               # any string in dev; match APP_API_KEY in prod

# Supabase (for Edge Functions / voice pipeline)
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

---

## Step 2 — Call the FastAPI pipeline endpoint

This single call extracts the medication from the image AND runs the full Claude analysis.

```typescript
// lib/api.ts  — put this wherever you keep your API helpers

const API_URL = process.env.NEXT_PUBLIC_API_URL!;
const API_KEY = process.env.NEXT_PUBLIC_APP_API_KEY ?? "dev-key";

export interface PipelineResponse {
  extraction: {
    medication_name: string;
    dosage: string;
    form: "tablet" | "capsule" | "liquid" | "unknown";
    confidence: "high" | "medium" | "low";
  };
  analysis: {
    medication_name: string;
    explanation: string;               // ← pass to useFinalVoiceOutput as `explanation`
    risk: {
      level: "safe" | "caution" | "dangerous"; // ← pass as `riskLevel`
      explanation: string;
      recommendation: string;          // ← pass as `recommendation`
    };
    caregiver_card: {
      medication: string;
      purpose: string;
      how_to_take: string;
      key_warning: string;
    };
  };
}

export async function scanMedication(
  imageFile: File,
  userQuestion?: string
): Promise<PipelineResponse> {
  const form = new FormData();
  form.append("image", imageFile);
  if (userQuestion) form.append("user_question", userQuestion);

  const res = await fetch(`${API_URL}/pipeline`, {
    method: "POST",
    headers: { "X-API-Key": API_KEY },
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error ?? "Pipeline request failed");
  }

  return res.json() as Promise<PipelineResponse>;
}
```

> **Important:** Always send the `X-API-Key` header. In dev mode the server accepts
> any value — in production it must match `APP_API_KEY`.

---

## Step 3 — Wire the voice pipeline

Import `useFinalVoiceOutput` — this is the **one hook** that handles the full
format → combine → speak chain automatically.

```typescript
import { useFinalVoiceOutput } from "@/hooks/useFinalVoiceOutput";
import { scanMedication, type PipelineResponse } from "@/lib/api";

export default function MedicationScanner() {
  const { speak, stop, status, finalText, error } = useFinalVoiceOutput({
    onStart: () => console.log("Audio started"),
    onEnd:   () => console.log("Audio finished"),
    onError: (err) => console.error("Voice error:", err),
  });

  const [result, setResult] = useState<PipelineResponse | null>(null);

  async function handleScan(file: File, question?: string) {
    // 1. Call the FastAPI backend
    const data = await scanMedication(file, question);
    setResult(data);

    // 2. Map the response fields → hook parameters
    await speak({
      riskLevel:      data.analysis.risk.level,          // "safe" | "caution" | "dangerous"
      explanation:    data.analysis.explanation,          // medication explanation
      recommendation: data.analysis.risk.recommendation, // what to avoid/do (optional for "safe")
    });
  }

  return (
    <div>
      {/* your file input / camera UI */}
      {status === "loading"    && <p>Generating audio…</p>}
      {status === "formatting" && <p>Formatting safety message…</p>}
      {status === "combining"  && <p>Combining response…</p>}
      {status === "playing"    && <button onClick={stop}>Stop</button>}
      {error && <p className="text-red-500">{error}</p>}

      {/* Display caregiver card */}
      {result && (
        <div>
          <h2>{result.analysis.caregiver_card.medication}</h2>
          <p>{result.analysis.caregiver_card.purpose}</p>
          <p>{result.analysis.caregiver_card.how_to_take}</p>
          <p>{result.analysis.caregiver_card.key_warning}</p>
        </div>
      )}
    </div>
  );
}
```

---

## Step 4 — Use the SpeechPlayer component (optional but recommended)

`SpeechPlayer` gives you a ready-made play/pause/stop button with a safety badge.
Use it if you want audio controls without building them yourself.

```typescript
import { SpeechPlayer } from "@/components/SpeechPlayer";

// Inside your component — after you have the analysis result:
<SpeechPlayer
  speak={speak}
  stop={stop}
  pause={pause}
  resume={resume}
  status={status}
  error={error}
  safetyLevel={result.analysis.risk.level}   // colours the badge
  label="Listen to medication summary"
  autoPlay={false}
/>
```

---

## Status values (for loading UI)

| Status        | Meaning                                          |
|---------------|--------------------------------------------------|
| `idle`        | Nothing playing                                  |
| `loading`     | Fetching audio from ElevenLabs                   |
| `formatting`  | Claude reformatting safety message (step 1)      |
| `combining`   | Claude blending explanation + risk (step 2)      |
| `playing`     | Audio is playing                                 |
| `paused`      | Audio is paused                                  |
| `error`       | Something went wrong — check `error` string      |

---

## Safety colours (for UI badges / cards)

Import from `lib/elevenlabs.ts`:

```typescript
import { SAFETY_COLORS } from "@/lib/elevenlabs";
// SAFETY_COLORS.safe      → "#22c55e"  (green)
// SAFETY_COLORS.caution   → "#f59e0b"  (amber)
// SAFETY_COLORS.dangerous → "#ef4444"  (red)
```

---

## Running everything locally

**Terminal 1 — FastAPI backend:**
```bash
cd arise
pip install -r requirements.txt
cp .env.example .env
# fill in ANTHROPIC_API_KEY in .env
uvicorn app.main:app --reload
# → http://localhost:8000
# → docs at http://localhost:8000/docs
```

**Terminal 2 — Supabase Edge Functions:**
```bash
supabase start
supabase functions serve --env-file supabase/functions/.env
# Edge functions available at http://localhost:54321/functions/v1/
```

**Terminal 3 — Next.js:**
```bash
cp .env.example .env.local
# fill in all NEXT_PUBLIC_* vars
npm run dev
# → http://localhost:3000
```

---

## Checklist before demo

- [ ] `NEXT_PUBLIC_API_URL` points to running FastAPI instance
- [ ] `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are set
- [ ] `ELEVENLABS_API_KEY` is set as a Supabase secret (`supabase secrets set …`)
- [ ] `ANTHROPIC_API_KEY` is set in both FastAPI `.env` AND as a Supabase secret
- [ ] FastAPI is running and `GET /health` returns `{"status":"ok"}`
- [ ] Supabase Edge Functions are deployed (`supabase functions deploy …`)
- [ ] `X-API-Key` header is included in all FastAPI calls
