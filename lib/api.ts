const API_URL = process.env.NEXT_PUBLIC_API_URL!;
const API_KEY = process.env.NEXT_PUBLIC_APP_API_KEY ?? "dev-key";

// ── Response types (mirror app/schemas.py) ────────────────────────────────

export interface PipelineResponse {
  extraction: {
    medication_name: string;
    dosage: string;
    form: "tablet" | "capsule" | "liquid" | "unknown";
    confidence: "high" | "medium" | "low";
  };
  analysis: {
    medication_name: string;
    explanation: string;
    risk: {
      level: "safe" | "caution" | "dangerous";
      explanation: string;
      recommendation: string;
    };
    caregiver_card: {
      medication: string;
      purpose: string;
      how_to_take: string;
      key_warning: string;
    };
  };
}

export interface AnalyzeResponse {
  medication_name: string;
  explanation: string;
  risk: {
    level: "safe" | "caution" | "dangerous";
    explanation: string;
    recommendation: string;
  };
  caregiver_card: {
    medication: string;
    purpose: string;
    how_to_take: string;
    key_warning: string;
  };
}

// ── API calls ─────────────────────────────────────────────────────────────

/**
 * POST /pipeline — upload an image, get extraction + analysis back.
 * Used by the "Scan Pill Bottle" button.
 */
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
    throw new Error((err as { error?: string }).error ?? "Pipeline request failed");
  }

  return res.json() as Promise<PipelineResponse>;
}

/**
 * POST /analyze — analyze a medication name + optional question.
 * Used by the text input (follow-up questions) and the Interactions page.
 */
export async function analyzeMedication(
  medicationName: string,
  userQuestion?: string
): Promise<AnalyzeResponse> {
  const res = await fetch(`${API_URL}/analyze`, {
    method: "POST",
    headers: {
      "X-API-Key": API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      medication_name: medicationName,
      user_question: userQuestion ?? "",
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error((err as { error?: string }).error ?? "Analyze request failed");
  }

  return res.json() as Promise<AnalyzeResponse>;
}
