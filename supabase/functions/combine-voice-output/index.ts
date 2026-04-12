/**
 * Arise — combine-voice-output Supabase Edge Function
 *
 * Takes a medication explanation and a risk message (both already formatted
 * for speech) and asks Claude to blend them into a single, natural 3-sentence
 * spoken response.
 *
 * This is the final step before handing text to ElevenLabs.
 *
 * Deploy:
 *   supabase functions deploy combine-voice-output --no-verify-jwt
 *
 * Secrets required (shared with format-safety-speech):
 *   ANTHROPIC_API_KEY   — already set
 *   CLAUDE_MODEL        — optional, defaults to claude-sonnet-4-6
 *
 * ── Teammate interface ────────────────────────────────────────────────────────
 * POST /functions/v1/combine-voice-output
 * Headers:
 *   Content-Type: application/json
 *   apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>
 *
 * Body (CombineVoiceRequest):
 *   {
 *     explanation:  string,  ← medication explanation (from prompt 1 / Claude teammate)
 *     risk_message: string,  ← formatted safety message (from format-safety-speech)
 *   }
 *
 * Response (CombineVoiceResponse):
 *   { final_text: string }   ← pass straight to /text-to-speech
 *
 * If risk_message is omitted or empty, the explanation is returned cleaned up
 * on its own — so the function is safe to call even for "safe" interactions
 * that have no warning to add.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ── Types ──────────────────────────────────────────────────────────────────

interface CombineVoiceRequest {
  explanation: string;
  /** Optional — omit or pass "" for safe interactions with no warning */
  risk_message?: string;
}

interface CombineVoiceResponse {
  final_text: string;
  /** True when risk_message was empty and only the explanation was used */
  explanation_only: boolean;
}

// ── CORS ───────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Prompt builders ────────────────────────────────────────────────────────

/** Full combine prompt — used when both explanation AND risk_message are present */
function buildCombinePrompt(explanation: string, risk_message: string): string {
  return `You are generating a final voice message for a user.
Explanation: ${explanation}
Risk message: ${risk_message}
Combine into a single natural spoken response.
Rules:
- flow naturally
- max 3 sentences total
- simple and warm tone
Return ONLY the final text.`;
}

/**
 * Explanation-only prompt — used when the interaction is safe and there is
 * no risk message to combine. Cleans up the explanation for smooth delivery.
 */
function buildExplanationOnlyPrompt(explanation: string): string {
  return `You are preparing a spoken message for a patient about their medication.
Explanation: ${explanation}
Rewrite as a single natural spoken response.
Rules:
- warm and reassuring tone
- max 2 sentences
- very simple language
Return ONLY the final text.`;
}

// ── Handler ────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  // ── Parse + validate ────────────────────────────────────────────────────

  let body: CombineVoiceRequest;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const { explanation, risk_message } = body;

  if (!explanation?.trim()) {
    return jsonError("`explanation` is required", 400);
  }

  // ── Resolve secrets ─────────────────────────────────────────────────────

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.error("[arise/combine-voice-output] ANTHROPIC_API_KEY not set");
    return jsonError("Voice combination service not configured", 500);
  }

  const model = Deno.env.get("CLAUDE_MODEL") ?? "claude-sonnet-4-6";

  // ── Decide which prompt to use ─────────────────────────────────────────

  const hasRiskMessage = Boolean(risk_message?.trim());
  const prompt = hasRiskMessage
    ? buildCombinePrompt(explanation.trim(), risk_message!.trim())
    : buildExplanationOnlyPrompt(explanation.trim());

  // ── Call Claude ────────────────────────────────────────────────────────

  let claudeResponse: Response;
  try {
    claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 180, // 3 sentences of simple language
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (err) {
    console.error("[arise/combine-voice-output] Network error:", err);
    return jsonError("Could not reach voice combination service", 502);
  }

  if (!claudeResponse.ok) {
    const detail = await claudeResponse.text().catch(() => "unknown");
    console.error(
      `[arise/combine-voice-output] Claude returned ${claudeResponse.status}: ${detail}`
    );
    return jsonError("Voice combination failed", claudeResponse.status);
  }

  // ── Extract text ───────────────────────────────────────────────────────

  let final_text: string;
  try {
    const claudeBody = await claudeResponse.json();
    final_text = claudeBody?.content?.[0]?.text?.trim() ?? "";
    if (!final_text) throw new Error("Empty response from Claude");
  } catch (err) {
    console.error("[arise/combine-voice-output] Failed to parse Claude response:", err);
    return jsonError("Failed to parse combined voice output", 500);
  }

  // ── Return ─────────────────────────────────────────────────────────────

  const responseBody: CombineVoiceResponse = {
    final_text,
    explanation_only: !hasRiskMessage,
  };

  return new Response(JSON.stringify(responseBody), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});

// ── Helpers ────────────────────────────────────────────────────────────────

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
