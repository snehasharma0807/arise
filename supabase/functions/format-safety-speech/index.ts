/**
 * Arise — format-safety-speech Supabase Edge Function
 *
 * Takes a Claude-classified drug-interaction result and reformats it into a
 * tone-appropriate, voice-optimised spoken message using the Claude API.
 *
 * Deploy:
 *   supabase functions deploy format-safety-speech --no-verify-jwt
 *
 * Secrets required (set once):
 *   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
 *   supabase secrets set CLAUDE_MODEL=claude-sonnet-4-6   # optional, has default
 *
 * ── Teammate interface ────────────────────────────────────────────────────────
 * POST /functions/v1/format-safety-speech
 * Headers:
 *   Content-Type: application/json
 *   apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>
 *
 * Body (FormatSafetySpeechRequest):
 *   {
 *     risk_level:     "safe" | "caution" | "dangerous",
 *     explanation:    string,   ← Claude's explanation of the interaction
 *     recommendation: string,   ← Claude's recommended action
 *   }
 *
 * Response (FormatSafetySpeechResponse):
 *   { formatted_text: string }  ← ready to pass straight to /text-to-speech
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ── Types ──────────────────────────────────────────────────────────────────

type RiskLevel = "safe" | "caution" | "dangerous";

interface FormatSafetySpeechRequest {
  risk_level: RiskLevel;
  explanation: string;
  recommendation: string;
}

interface FormatSafetySpeechResponse {
  formatted_text: string;
}

// ── CORS ───────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Prompt template (matches the spec exactly) ─────────────────────────────

function buildPrompt(
  risk_level: RiskLevel,
  explanation: string,
  recommendation: string
): string {
  return `You are preparing a spoken warning for a medication interaction.
Risk level: ${risk_level}
Explanation: ${explanation}
Recommendation: ${recommendation}
Rewrite into a spoken message.
Rules:
- If "dangerous": clear and urgent, but calm (not scary)
- If "caution": gentle and careful
- max 2 sentences
- very simple language
Return ONLY the final spoken message.`;
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

  let body: FormatSafetySpeechRequest;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const { risk_level, explanation, recommendation } = body;

  if (!risk_level || !["safe", "caution", "dangerous"].includes(risk_level)) {
    return jsonError(
      '`risk_level` must be "safe", "caution", or "dangerous"',
      400
    );
  }

  if (!explanation?.trim()) {
    return jsonError("`explanation` is required", 400);
  }

  if (!recommendation?.trim()) {
    return jsonError("`recommendation` is required", 400);
  }

  // ── Resolve secrets ─────────────────────────────────────────────────────

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.error("[arise/format-safety-speech] ANTHROPIC_API_KEY not set");
    return jsonError("Speech formatting service not configured", 500);
  }

  const model =
    Deno.env.get("CLAUDE_MODEL") ?? "claude-sonnet-4-6";

  // ── Call Claude API ─────────────────────────────────────────────────────

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
        max_tokens: 120, // max 2 sentences of simple language
        messages: [
          {
            role: "user",
            content: buildPrompt(risk_level, explanation.trim(), recommendation.trim()),
          },
        ],
      }),
    });
  } catch (err) {
    console.error("[arise/format-safety-speech] Network error:", err);
    return jsonError("Could not reach formatting service", 502);
  }

  if (!claudeResponse.ok) {
    const detail = await claudeResponse.text().catch(() => "unknown");
    console.error(
      `[arise/format-safety-speech] Claude returned ${claudeResponse.status}: ${detail}`
    );
    return jsonError("Speech formatting failed", claudeResponse.status);
  }

  // ── Extract the text content from Claude's response ────────────────────

  let formatted_text: string;
  try {
    const claudeBody = await claudeResponse.json();
    formatted_text = claudeBody?.content?.[0]?.text?.trim() ?? "";
    if (!formatted_text) throw new Error("Empty response from Claude");
  } catch (err) {
    console.error("[arise/format-safety-speech] Failed to parse Claude response:", err);
    return jsonError("Failed to parse formatted speech", 500);
  }

  // ── Return formatted text ───────────────────────────────────────────────

  const responseBody: FormatSafetySpeechResponse = { formatted_text };

  return new Response(JSON.stringify(responseBody), {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
});

// ── Helpers ────────────────────────────────────────────────────────────────

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
