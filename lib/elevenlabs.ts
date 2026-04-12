/**
 * ElevenLabs constants, types, and voice configuration for Arise.
 *
 * Voice choice rationale:
 *   Adam   — deep, authoritative, clear. Used for medication explanations.
 *   Rachel — calm, warm, neutral. Used for follow-up / safety responses.
 *
 * Teammate interface:
 *   Your Claude-integration teammate passes plain `text` strings here.
 *   The UI teammate imports `SpeechPlayer` and passes the same strings.
 */

// ---------------------------------------------------------------------------
// Voice IDs
// ---------------------------------------------------------------------------

export const ARISE_VOICES = {
  /** Primary voice — deep and authoritative, used for medication explanations */
  adam: "pNInz6obpgDQGcFmaJgB",
  /** Secondary voice — calm and warm, used for caution/danger follow-up responses */
  rachel: "21m00Tcm4TlvDq8ikWAM",
} as const;

export type AriseVoiceName = keyof typeof ARISE_VOICES;
export type AriseVoiceId = (typeof ARISE_VOICES)[AriseVoiceName];

// ---------------------------------------------------------------------------
// Voice settings per response type
// ---------------------------------------------------------------------------

export interface ElevenLabsVoiceSettings {
  stability: number;        // 0–1  higher = more consistent, less expressive
  similarity_boost: number; // 0–1  higher = closer to original voice character
  style: number;            // 0–1  expressiveness/warmth
  use_speaker_boost: boolean;
}

/**
 * Presets tuned for Arise's two response contexts.
 *
 * "explanation"  → slow, very stable, warm  (reading medication details)
 * "followup"     → slightly faster, calm  (answering drug-interaction questions)
 */
export const VOICE_PRESETS: Record<"explanation" | "followup", ElevenLabsVoiceSettings> = {
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

// ---------------------------------------------------------------------------
// ElevenLabs model
// ---------------------------------------------------------------------------

/**
 * eleven_turbo_v2_5 — lowest latency, highest quality for short text.
 * Perfect for the 2–3 sentence responses Arise generates.
 */
export const ELEVENLABS_MODEL = "eleven_turbo_v2_5";

/**
 * Audio output format. mp3_44100_128 gives good quality at reasonable file
 * size — important when saving caregiver audio to Supabase Storage later.
 */
export const ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128";

// ---------------------------------------------------------------------------
// Request / Response types (shared between Edge Function and React hook)
// ---------------------------------------------------------------------------

/** Body sent to the `text-to-speech` Supabase Edge Function */
export interface TTSRequest {
  /** The speech-optimised text produced by the Claude integration teammate */
  text: string;
  /**
   * Which preset to use. Defaults to "explanation".
   * Pass "followup" for drug-interaction / safety responses.
   */
  preset?: "explanation" | "followup";
  /** Override the voice ID if needed (defaults to Aria) */
  voiceId?: AriseVoiceId;
}

/** Metadata returned in the X-Arise-Meta response header (JSON-encoded) */
export interface TTSResponseMeta {
  voiceId: string;
  preset: string;
  charCount: number;
  generatedAt: string; // ISO timestamp
}

// ---------------------------------------------------------------------------
// Safety classification colours (for UI teammate)
// ---------------------------------------------------------------------------

/**
 * The Claude integration teammate classifies drug interactions as one of these.
 * The UI teammate can use these to colour the SpeechPlayer badge and caregiver card.
 */
export type SafetyLevel = "safe" | "caution" | "dangerous";

export const SAFETY_COLORS: Record<SafetyLevel, string> = {
  safe: "#22c55e",      // green-500
  caution: "#f59e0b",   // amber-500
  dangerous: "#ef4444", // red-500
};
