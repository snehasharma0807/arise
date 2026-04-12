/**
 * useSafetyResponse — chains format-safety-speech → text-to-speech for Arise.
 *
 * This is the single hook the UI teammate needs for all drug-interaction
 * follow-up responses. It:
 *   1. Sends risk_level + explanation + recommendation to the
 *      `format-safety-speech` Edge Function (Claude reformats for speech tone)
 *   2. Passes the result to the `text-to-speech` Edge Function (ElevenLabs)
 *   3. Plays audio with the correct voice preset for the risk level
 *
 * Usage (UI teammate):
 * ─────────────────────────────────────────────────────────────────────────────
 *   const { speakSafetyResponse, stop, status, error } = useSafetyResponse();
 *
 *   // Called once Claude returns a classification
 *   await speakSafetyResponse({
 *     riskLevel:      "caution",
 *     explanation:    "Ibuprofen can raise blood pressure when taken with lisinopril.",
 *     recommendation: "Avoid ibuprofen. Use paracetamol instead.",
 *   });
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Teammate interface with Claude integration:
 *   Your Claude teammate classifies the interaction and returns:
 *     { risk_level, explanation, recommendation }
 *   Pass those directly into speakSafetyResponse() — no text formatting needed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use client";

import { useState, useCallback } from "react";
import { useTextToSpeech, type SpeechStatus } from "@/hooks/useTextToSpeech";
import type { SafetyLevel } from "@/lib/elevenlabs";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SpeakSafetyResponseOptions {
  /** Safety classification from Claude */
  riskLevel: SafetyLevel;
  /** Claude's plain-language explanation of the interaction */
  explanation: string;
  /** Claude's recommended action for the patient */
  recommendation: string;
}

export interface UseSafetyResponseCallbacks {
  /** Fired with the formatted text after Claude reformats it (before TTS) */
  onFormatted?: (formattedText: string) => void;
  /** Fired when audio starts playing */
  onStart?: () => void;
  /** Fired when audio finishes */
  onEnd?: () => void;
  /** Fired on any error */
  onError?: (error: Error) => void;
}

export interface UseSafetyResponseReturn {
  /** Format text and play spoken safety response */
  speakSafetyResponse: (options: SpeakSafetyResponseOptions) => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  /** "formatting" while Claude reformats, then standard SpeechStatus */
  status: SpeechStatus | "formatting";
  /** The Claude-formatted text (available after formatting, before/during playback) */
  formattedText: string | null;
  error: string | null;
}

// ── Endpoint helpers ───────────────────────────────────────────────────────

function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  return url;
}

function getAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
  return key;
}

/**
 * Maps risk level → TTS voice preset.
 *
 * "dangerous" and "caution" both use the "followup" preset
 * (slightly more expressive than the medication-explanation preset).
 * "safe" uses "explanation" (warm and calm — reassuring for the patient).
 */
function presetForRiskLevel(
  riskLevel: SafetyLevel
): "explanation" | "followup" {
  return riskLevel === "safe" ? "explanation" : "followup";
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useSafetyResponse(
  callbacks: UseSafetyResponseCallbacks = {}
): UseSafetyResponseReturn {
  const [isFormatting, setIsFormatting] = useState(false);
  const [formattedText, setFormattedText] = useState<string | null>(null);
  const [formatError, setFormatError] = useState<string | null>(null);

  const { speak, stop, pause, resume, status: ttsStatus, error: ttsError } =
    useTextToSpeech({
      onStart: callbacks.onStart ? () => callbacks.onStart!() : undefined,
      onEnd: callbacks.onEnd,
      onError: callbacks.onError,
    });

  // ── Format then speak ──────────────────────────────────────────────────

  const speakSafetyResponse = useCallback(
    async ({ riskLevel, explanation, recommendation }: SpeakSafetyResponseOptions) => {
      setFormattedText(null);
      setFormatError(null);
      setIsFormatting(true);

      let text: string;

      try {
        const supabaseUrl = getSupabaseUrl();
        const anonKey = getAnonKey();

        // Step 1 — ask Claude to reformat for voice tone
        const formatResponse = await fetch(
          `${supabaseUrl}/functions/v1/format-safety-speech`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: anonKey,
            },
            body: JSON.stringify({
              risk_level: riskLevel,
              explanation,
              recommendation,
            }),
          }
        );

        if (!formatResponse.ok) {
          const detail = await formatResponse
            .json()
            .catch(() => ({ error: "Formatting failed" }));
          throw new Error(
            (detail as { error?: string }).error ?? "Formatting failed"
          );
        }

        const { formatted_text } = await formatResponse.json() as {
          formatted_text: string;
        };

        text = formatted_text;
        setFormattedText(text);
        callbacks.onFormatted?.(text);
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Formatting error");
        setFormatError(error.message);
        callbacks.onError?.(error);
        return;
      } finally {
        setIsFormatting(false);
      }

      // Step 2 — pass formatted text to ElevenLabs TTS
      await speak({
        text,
        preset: presetForRiskLevel(riskLevel),
        safetyLevel: riskLevel,
      });
    },
    [speak, callbacks]
  );

  // ── Derived status ─────────────────────────────────────────────────────

  const status: SpeechStatus | "formatting" = isFormatting
    ? "formatting"
    : ttsStatus;

  const error = formatError ?? ttsError;

  return {
    speakSafetyResponse,
    stop,
    pause,
    resume,
    status,
    formattedText,
    error,
  };
}
