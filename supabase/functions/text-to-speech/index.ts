/**
 * Arise — text-to-speech Supabase Edge Function
 *
 * Accepts a TTSRequest body, calls ElevenLabs streaming TTS, and pipes the
 * audio stream back to the caller as audio/mpeg.
 *
 * Deploy:
 *   supabase functions deploy text-to-speech --no-verify-jwt
 *
 * Secrets to set (once per project):
 *   supabase secrets set ELEVENLABS_API_KEY=sk_...
 *
 * Optional secret (falls back to Aria if not set):
 *   supabase secrets set ELEVENLABS_VOICE_ID=<voice_id>
 *
 * ── Teammate interface ───────────────────────────────────────────────────────
 * POST /functions/v1/text-to-speech
 * Headers:
 *   Content-Type: application/json
 *   apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>          ← required by Supabase
 *
 * Body (TTSRequest):
 *   { text: string, preset?: "explanation" | "followup", voiceId?: string }
 *
 * Response on success:
 *   Content-Type: audio/mpeg
 *   X-Arise-Meta: { voiceId, preset, charCount, generatedAt }  (JSON header)
 *   Body: audio stream
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ── Types (duplicated from lib/elevenlabs.ts so the Edge Function is self-contained) ──

interface ElevenLabsVoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
}

interface TTSRequest {
  text: string;
  preset?: "explanation" | "followup";
  voiceId?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Adam — deep, authoritative: used for medication explanations */
const ADAM_VOICE_ID = "pNInz6obpgDQGcFmaJgB";
/** Rachel — calm, warm: used for follow-up / safety responses */
const RACHEL_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

/** Default voice per preset — can still be overridden by passing voiceId in request */
const PRESET_VOICE_IDS: Record<"explanation" | "followup", string> = {
  explanation: ADAM_VOICE_ID,
  followup: RACHEL_VOICE_ID,
};

const ELEVENLABS_MODEL = "eleven_turbo_v2_5";
const OUTPUT_FORMAT = "mp3_44100_128";

const VOICE_PRESETS: Record<"explanation" | "followup", ElevenLabsVoiceSettings> = {
  explanation: {
    stability: 0.80,
    similarity_boost: 0.85,
    style: 0.20,
    use_speaker_boost: true,
  },
  followup: {
    stability: 0.70,
    similarity_boost: 0.80,
    style: 0.25,
    use_speaker_boost: true,
  },
};

// ── CORS ───────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Handler ────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  // ── Parse + validate request body ──────────────────────────────────────

  let body: TTSRequest;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const { text, preset = "explanation", voiceId } = body;

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return jsonError("`text` is required and must be a non-empty string", 400);
  }

  if (text.length > 5000) {
    return jsonError("`text` exceeds 5 000 character limit", 400);
  }

  // ── Resolve secrets ─────────────────────────────────────────────────────

  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (!apiKey) {
    console.error("[arise/tts] ELEVENLABS_API_KEY secret is not set");
    return jsonError("TTS service not configured", 500);
  }

  const resolvedVoiceId =
    voiceId ?? Deno.env.get("ELEVENLABS_VOICE_ID") ?? PRESET_VOICE_IDS[preset];

  const voiceSettings =
    VOICE_PRESETS[preset] ?? VOICE_PRESETS.explanation;

  // ── Call ElevenLabs streaming endpoint ─────────────────────────────────

  let elevenResponse: Response;
  try {
    elevenResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${resolvedVoiceId}/stream`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          "Accept": "audio/mpeg",
        },
        body: JSON.stringify({
          text: text.trim(),
          model_id: ELEVENLABS_MODEL,
          output_format: OUTPUT_FORMAT,
          voice_settings: voiceSettings,
        }),
      }
    );
  } catch (err) {
    console.error("[arise/tts] Network error calling ElevenLabs:", err);
    return jsonError("Could not reach TTS service", 502);
  }

  if (!elevenResponse.ok) {
    const detail = await elevenResponse.text().catch(() => "unknown");
    console.error(
      `[arise/tts] ElevenLabs returned ${elevenResponse.status}: ${detail}`
    );
    return jsonError("TTS generation failed", elevenResponse.status);
  }

  // ── Build metadata header ───────────────────────────────────────────────

  const meta = JSON.stringify({
    voiceId: resolvedVoiceId,
    preset,
    charCount: text.trim().length,
    generatedAt: new Date().toISOString(),
  });

  // ── Pipe audio stream back to client ───────────────────────────────────

  return new Response(elevenResponse.body, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-cache, no-store",
      "X-Arise-Meta": meta,
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
